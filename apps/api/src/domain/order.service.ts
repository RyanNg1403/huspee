import { returnRequestBlock } from './return-eligibility';
import { Injectable } from '@nestjs/common';
import { LogisticsStatus, Order, OrderStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { DomainError, invalidState, notFound, validation } from '../common/errors';
import { CURRENCY, dec, toNumber } from '../common/money';
import { PrismaService, Tx } from '../common/prisma.service';
import { addDays, unix } from '../common/time';
import { mediaUrl, modelImage, modelName, resolveModelPrice } from './catalog.service';
import { LogisticsService, ShippingOption } from './logistics.service';
import { PushService } from './push.service';
import { VoucherService } from './voucher.service';
import { purchaseIssue } from './purchase-availability';

export const PAYMENT_METHODS = ['COD', 'SHOPEEPAY_SIM', 'CARD_SIM', 'BANK_TRANSFER_SIM'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  COD: 'Cash on Delivery',
  SHOPEEPAY_SIM: 'ShopeePay (simulated)',
  CARD_SIM: 'Credit/Debit Card (simulated)',
  BANK_TRANSFER_SIM: 'Bank Transfer (simulated)',
};

/** Explicit, testable order state machine. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  UNPAID: ['READY_TO_SHIP', 'CANCELLED'],
  READY_TO_SHIP: ['PROCESSED', 'CANCELLED'],
  PROCESSED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['TO_CONFIRM_RECEIVE', 'CANCELLED'],
  TO_CONFIRM_RECEIVE: ['COMPLETED', 'TO_RETURN'],
  COMPLETED: ['TO_RETURN'],
  TO_RETURN: ['COMPLETED', 'TO_CONFIRM_RECEIVE'],
  IN_CANCEL: ['CANCELLED', 'READY_TO_SHIP'],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw invalidState(`Order cannot move from ${from} to ${to}`, { shopee_error: 'error_invalid_status', from, to });
  }
}

export const SELLER_CANCEL_REASONS = ['OUT_OF_STOCK', 'CUSTOMER_REQUEST', 'UNDELIVERABLE_AREA', 'COD_NOT_SUPPORTED'] as const;

export const SHIPMENT_EVENTS = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED'] as const;
export type ShipmentEvent = (typeof SHIPMENT_EVENTS)[number];

const SHIPMENT_EVENT_TEXT: Record<ShipmentEvent, string> = {
  PICKED_UP: 'Đơn vị vận chuyển đã lấy hàng thành công',
  IN_TRANSIT: 'Đơn hàng đang được trung chuyển',
  OUT_FOR_DELIVERY: 'Đơn hàng đang được giao đến bạn',
  DELIVERED: 'Giao hàng thành công',
  DELIVERY_FAILED: 'Giao hàng không thành công',
};

export interface CheckoutShopOptions {
  shop_id: number;
  logistics_channel_id?: number;
  voucher_code?: string;
  message_to_seller?: string;
}

export interface CheckoutInput {
  address_id?: number;
  payment_method: PaymentMethod;
  cart_item_ids?: number[];
  items?: Array<{ model_id: number; quantity: number }>;
  shops?: CheckoutShopOptions[];
}

export interface QuoteLine {
  cart_item_id: number | null;
  item_id: number;
  model_id: number;
  item_name: string;
  model_name: string;
  image_url: string | null;
  quantity: number;
  stock: number;
  original_price: number;
  unit_price: number;
  line_total: number;
  promotion_id: number | null;
  available: boolean;
  issue?: string;
  weight_kg: number;
  item_sku: string;
  model_sku: string;
  is_default_model: boolean;
}

export interface QuoteGroup {
  shop_id: number;
  shop_name: string;
  lines: QuoteLine[];
  items_subtotal: number;
  shipping_options: ShippingOption[];
  logistics_channel_id: number | null;
  shipping_fee: number;
  shipping_discount: number;
  voucher: { voucher_id: number; code: string; eligible: boolean; discount: number; reason?: string } | null;
  voucher_discount: number;
  message_to_seller: string;
  total: number;
  days_to_ship: number;
  issues: string[];
}

export interface Quote {
  groups: QuoteGroup[];
  payment_method: PaymentMethod;
  totals: { items_subtotal: number; shipping_fee: number; shipping_discount: number; voucher_discount: number; total: number; currency: string };
  issues: string[];
  can_checkout: boolean;
}

/** Stable buyer-visible checkout facts bound to an assistant confirmation. */
export function assistantQuoteSnapshot(quote: Quote, address: { id: number; name: string; phone: string; region: string; state: string; city: string; district: string; town: string; address: string; zipcode: string }) {
  return { payment_method: quote.payment_method, address, groups: quote.groups.map((g) => ({ shop_id: g.shop_id, shop_name: g.shop_name, lines: g.lines.map((l) => ({ item_id: l.item_id, model_id: l.model_id, item_name: l.item_name, model_name: l.model_name, quantity: l.quantity, unit_price: l.unit_price })), shipping_fee: g.shipping_fee, shipping_discount: g.shipping_discount, voucher: g.voucher ? { code: g.voucher.code, eligible: g.voucher.eligible, discount: g.voucher.discount } : null, total: g.total })), totals: quote.totals };
}

export const orderInclude = {
  returns: { select: { status: true, items: true } },
  items: { orderBy: { id: 'asc' } },
  package: { include: { events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } },
  shop: { select: { id: true, name: true } },
  buyer: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;
type LoadedOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type OrderWithRelations = Omit<LoadedOrder, 'returns'> & { returns?: LoadedOrder['returns'] };

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logistics: LogisticsService,
    private readonly vouchers: VoucherService,
    private readonly push: PushService,
  ) {}

  // ---------------------------------------------------------------------------
  // Quote / checkout
  // ---------------------------------------------------------------------------

  async quote(buyerId: number, input: CheckoutInput, db: Tx = this.prisma): Promise<Quote> {
    const requested = await this.resolveLines(buyerId, input, db);
    const models = await db.model.findMany({
      where: { id: { in: requested.map((r) => r.modelId) } },
      include: {
        discountModels: { include: { discount: true } },
        item: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 }, shop: { include: { policy: true } } } },
      },
    });
    const byId = new Map(models.map((m) => [m.id, m]));
    const ownShops = new Set(
      (await db.shopMember.findMany({ where: { userId: buyerId }, select: { shopId: true } })).map((m) => m.shopId),
    );
    const channels = await this.logistics.channels(db);
    const shopOptions = new Map((input.shops ?? []).map((s) => [s.shop_id, s]));

    const groups = new Map<number, QuoteGroup>();
    const groupMeta = new Map<number, { logistics: unknown[]; freeShippingMin: number | null }>();
    const issues: string[] = [];

    for (const req of requested) {
      const model = byId.get(req.modelId);
      if (!model) {
        issues.push(`Model ${req.modelId} no longer exists`);
        continue;
      }
      const item = model.item;
      const shop = item.shop;
      const price = resolveModelPrice(model);
      const issue = purchaseIssue(item, model, shop, req.quantity, ownShops.has(shop.id));

      let group = groups.get(shop.id);
      if (!group) {
        group = {
          shop_id: shop.id,
          shop_name: shop.name,
          lines: [],
          items_subtotal: 0,
          shipping_options: [],
          logistics_channel_id: null,
          shipping_fee: 0,
          shipping_discount: 0,
          voucher: null,
          voucher_discount: 0,
          message_to_seller: (shopOptions.get(shop.id)?.message_to_seller ?? '').slice(0, 500),
          total: 0,
          days_to_ship: 0,
          issues: [],
        };
        groups.set(shop.id, group);
        groupMeta.set(shop.id, { logistics: [], freeShippingMin: shop.policy?.freeShippingMinSpend ? toNumber(shop.policy.freeShippingMinSpend) : null });
      }
      const weight = toNumber(model.weightKg ?? item.weightKg);
      const line: QuoteLine = {
        cart_item_id: req.cartItemId,
        item_id: item.id,
        model_id: model.id,
        item_name: item.name,
        model_name: modelName(item, model.tierIndex),
        image_url: modelImage(item, model.tierIndex),
        quantity: req.quantity,
        stock: model.stock,
        original_price: price.originalPrice,
        unit_price: price.currentPrice,
        line_total: price.currentPrice * req.quantity,
        promotion_id: price.promotionId,
        available: !issue,
        ...(issue ? { issue } : {}),
        weight_kg: weight,
        item_sku: item.itemSku,
        model_sku: model.sku,
        is_default_model: model.isDefault,
      };
      group.lines.push(line);
      group.days_to_ship = Math.max(group.days_to_ship, item.daysToShip);
      groupMeta.get(shop.id)!.logistics.push(item.logistics);
      if (issue) group.issues.push(`${item.name}: ${issue}`);
    }

    for (const group of groups.values()) {
      const meta = groupMeta.get(group.shop_id)!;
      const available = group.lines.filter((l) => l.available);
      group.items_subtotal = available.reduce((s, l) => s + l.line_total, 0);
      const weight = available.reduce((s, l) => s + l.weight_kg * l.quantity, 0);
      const eligible = this.logistics
        .eligibleChannels(channels, meta.logistics)
        .filter((c) => input.payment_method !== 'COD' || c.codEnabled);
      group.shipping_options = eligible.map((c) => this.logistics.option(c, weight));
      const opts = shopOptions.get(group.shop_id);
      const chosen = opts?.logistics_channel_id
        ? group.shipping_options.find((o) => o.logistics_channel_id === opts.logistics_channel_id)
        : [...group.shipping_options].sort((a, b) => a.shipping_fee - b.shipping_fee || a.logistics_channel_id - b.logistics_channel_id)[0];
      if (!chosen) {
        group.issues.push(
          opts?.logistics_channel_id ? `Shipping channel ${opts.logistics_channel_id} is not available for this shop` : 'No shipping channel available',
        );
      } else {
        group.logistics_channel_id = chosen.logistics_channel_id;
        group.shipping_fee = chosen.shipping_fee;
        if (meta.freeShippingMin !== null && group.items_subtotal >= meta.freeShippingMin) group.shipping_discount = chosen.shipping_fee;
      }
      if (opts?.voucher_code) {
        const voucher = await db.voucher.findUnique({
          where: { shopId_code: { shopId: group.shop_id, code: opts.voucher_code.trim().toUpperCase() } },
        });
        if (!voucher) {
          group.voucher = { voucher_id: 0, code: opts.voucher_code, eligible: false, discount: 0, reason: 'Voucher does not exist for this shop' };
        } else {
          const evaluation = this.vouchers.evaluate(
            voucher,
            available.map((l) => ({ itemId: l.item_id, lineTotal: l.line_total })),
          );
          if (evaluation.eligible && (await this.vouchers.alreadyUsedBy(buyerId, voucher.id, db))) {
            group.voucher = { voucher_id: voucher.id, code: voucher.code, eligible: false, discount: 0, reason: 'You have already used this voucher' };
          } else {
            group.voucher = { voucher_id: voucher.id, code: voucher.code, ...evaluation };
          }
        }
        if (group.voucher.eligible) group.voucher_discount = group.voucher.discount;
        else group.issues.push(`Voucher ${group.voucher.code}: ${group.voucher.reason}`);
      }
      group.total = group.items_subtotal - group.voucher_discount + group.shipping_fee - group.shipping_discount;
    }

    const list = [...groups.values()].sort((a, b) => a.shop_id - b.shop_id);
    const totals = {
      items_subtotal: sum(list, 'items_subtotal'),
      shipping_fee: sum(list, 'shipping_fee'),
      shipping_discount: sum(list, 'shipping_discount'),
      voucher_discount: sum(list, 'voucher_discount'),
      total: sum(list, 'total'),
      currency: CURRENCY,
    };
    const allIssues = [...issues, ...list.flatMap((g) => g.issues)];
    return {
      groups: list,
      payment_method: input.payment_method,
      totals,
      issues: allIssues,
      can_checkout: list.length > 0 && allIssues.length === 0,
    };
  }

  /**
   * Create one order per shop atomically: conditional stock decrements, voucher usage,
   * cart cleanup. Retries with the same Idempotency-Key return the original orders.
   */
  async checkout(buyerId: number, input: CheckoutInput, idempotencyKey?: string, assistant?: { actionId: string; shopId: number; snapshotHash: string; confirmationKey: string }): Promise<{ checkout_id: string; order_sn_list: string[]; replayed: boolean }> {
    if (!input.address_id) throw validation('address_id is required');
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if (idempotencyKey) {
      const replay = await this.findReplay(buyerId, idempotencyKey, requestHash);
      if (replay) return replay;
    }
    const address = await this.prisma.buyerAddress.findFirst({ where: { id: input.address_id, userId: buyerId, deletedAt: null } });
    if (!address) throw notFound('Address');

    const checkoutId = `CO${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`;
    let created: string[];
    try {
      created = await this.prisma.$transaction(
        async (tx) => {
          if (idempotencyKey) {
            await tx.checkoutRequest.create({ data: { buyerId, idempotencyKey, checkoutId, requestHash } });
          }
          const quote = await this.quote(buyerId, input, tx);
          if (assistant) {
            const currentAddress = await tx.buyerAddress.findFirst({ where: { id: input.address_id, userId: buyerId, deletedAt: null }, select: { id: true, name: true, phone: true, region: true, state: true, city: true, district: true, town: true, address: true, zipcode: true } });
            const initialAddress = { id: address.id, name: address.name, phone: address.phone, region: address.region, state: address.state, city: address.city, district: address.district, town: address.town, address: address.address, zipcode: address.zipcode };
            const hash = currentAddress && createHash('sha256').update(JSON.stringify(assistantQuoteSnapshot(quote, currentAddress))).digest('hex');
            if (JSON.stringify(currentAddress) !== JSON.stringify(initialAddress) || quote.groups.length !== 1 || quote.groups[0]?.shop_id !== assistant.shopId || hash !== assistant.snapshotHash) throw invalidState('Checkout details changed; please confirm again');
            const claimed = await tx.pendingAction.updateMany({ where: { id: assistant.actionId, buyerId, shopId: assistant.shopId, type: 'PLACE_ORDER', status: 'PENDING', expiresAt: { gt: new Date() } }, data: { status: 'EXECUTED', idempotencyKey: assistant.confirmationKey } });
            if (!claimed.count) throw invalidState('Action is no longer pending');
          }
          if (quote.groups.length === 0) throw validation('Nothing to check out');
          if (!quote.can_checkout) {
            const outOfStock = quote.groups.some((g) => g.lines.some((l) => !l.available && /stock/i.test(l.issue ?? '')));
            throw new DomainError(outOfStock ? 'OUT_OF_STOCK' : 'VALIDATION', quote.issues.join('; '), { issues: quote.issues });
          }
          const now = new Date();
          const orderSns: string[] = [];
          for (const group of quote.groups) {
            for (const line of group.lines) {
              const updated = await tx.model.updateMany({
                where: { id: line.model_id, stock: { gte: line.quantity }, status: 'MODEL_NORMAL' },
                data: { stock: { decrement: line.quantity } },
              });
              if (updated.count !== 1) throw new DomainError('OUT_OF_STOCK', `${line.item_name} is out of stock`);
              await tx.item.update({ where: { id: line.item_id }, data: { sales: { increment: line.quantity } } });
            }
            if (group.voucher?.eligible) {
              const used = await tx.$executeRaw`UPDATE vouchers SET current_usage = current_usage + 1 WHERE id = ${group.voucher.voucher_id} AND current_usage < usage_quantity`;
              if (used !== 1) throw new DomainError('VOUCHER_INVALID', `Voucher ${group.voucher.code} is fully redeemed`);
            }
            const channel = group.shipping_options.find((o) => o.logistics_channel_id === group.logistics_channel_id)!;
            const orderSn = generateOrderSn(now);
            const paid = input.payment_method !== 'COD';
            await tx.order.create({
              data: {
                orderSn,
                checkoutId,
                shopId: group.shop_id,
                buyerId,
                status: 'READY_TO_SHIP',
                paymentMethod: PAYMENT_METHOD_LABEL[input.payment_method],
                cod: !paid,
                itemsSubtotal: dec(group.items_subtotal),
                shippingFee: dec(group.shipping_fee),
                shippingDiscount: dec(group.shipping_discount),
                voucherDiscount: dec(group.voucher_discount),
                totalAmount: dec(group.total),
                voucherId: group.voucher?.eligible ? group.voucher.voucher_id : null,
                voucherCode: group.voucher?.eligible ? group.voucher.code : null,
                recipientAddress: {
                  name: address.name,
                  phone: address.phone,
                  town: address.town,
                  district: address.district,
                  city: address.city,
                  state: address.state,
                  region: address.region,
                  zipcode: address.zipcode,
                  full_address: [address.address, address.town, address.district, address.city, address.state].filter(Boolean).join(', '),
                },
                messageToSeller: group.message_to_seller,
                logisticsChannelId: channel.logistics_channel_id,
                shippingCarrier: channel.logistics_channel_name,
                daysToShip: group.days_to_ship,
                shipByDate: addDays(now, group.days_to_ship),
                payTime: paid ? now : null,
                createdAt: now,
                items: {
                  create: group.lines.map((l) => ({
                    itemId: l.item_id,
                    modelId: l.model_id,
                    isDefaultModel: l.is_default_model,
                    itemName: l.item_name,
                    modelName: l.model_name,
                    itemSku: l.item_sku,
                    modelSku: l.model_sku,
                    imageUrl: l.image_url,
                    quantity: l.quantity,
                    originalPrice: dec(l.original_price),
                    discountedPrice: dec(l.unit_price),
                    weightKg: dec(l.weight_kg),
                    promotionId: l.promotion_id,
                  })),
                },
                package: {
                  create: {
                    packageNumber: `OFG${randomDigits(12)}`,
                    logisticsStatus: 'LOGISTICS_READY',
                    events: {
                      create: [
                        { logisticsStatus: 'LOGISTICS_NOT_START', description: 'Đơn hàng đã được đặt', createdAt: now },
                        ...(paid ? [{ logisticsStatus: 'LOGISTICS_READY' as const, description: 'Thanh toán thành công (mô phỏng)', createdAt: now }] : []),
                      ],
                    },
                  },
                },
              },
            });
            orderSns.push(orderSn);
          }
          const cartIds = quote.groups.flatMap((g) => g.lines.map((l) => l.cart_item_id)).filter((id): id is number => id !== null);
          if (cartIds.length) await tx.cartItem.deleteMany({ where: { id: { in: cartIds }, userId: buyerId } });
          if (assistant) await tx.pendingAction.update({ where: { id: assistant.actionId }, data: { result: { order_sn: orderSns[0] } } });
          return orderSns;
        },
        { timeout: 20000, ...(assistant ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } : {}) },
      );
    } catch (err) {
      if (idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const replay = await this.findReplay(buyerId, idempotencyKey, requestHash);
        if (replay) return replay;
      }
      throw err;
    }
    for (const orderSn of created) {
      const order = await this.prisma.order.findUniqueOrThrow({ where: { orderSn } });
      await this.push.emit(order.shopId, 'order_status', { ordersn: orderSn, status: order.status, update_time: unix(order.updatedAt) });
    }
    return { checkout_id: checkoutId, order_sn_list: created, replayed: false };
  }

  private async findReplay(buyerId: number, key: string, requestHash: string) {
    const existing = await this.prisma.checkoutRequest.findUnique({ where: { buyerId_idempotencyKey: { buyerId, idempotencyKey: key } } });
    if (!existing) return null;
    if (existing.requestHash !== requestHash) throw new DomainError('CONFLICT', 'Idempotency-Key was already used with a different request');
    const orders = await this.prisma.order.findMany({ where: { checkoutId: existing.checkoutId }, orderBy: { shopId: 'asc' }, select: { orderSn: true } });
    return { checkout_id: existing.checkoutId, order_sn_list: orders.map((o) => o.orderSn), replayed: true };
  }

  private async resolveLines(buyerId: number, input: CheckoutInput, db: Tx) {
    if (input.items?.length) {
      const merged = new Map<number, number>();
      for (const i of input.items) merged.set(i.model_id, (merged.get(i.model_id) ?? 0) + i.quantity);
      return [...merged].map(([modelId, quantity]) => ({ modelId, quantity, cartItemId: null as number | null }));
    }
    const cart = await db.cartItem.findMany({
      where: { userId: buyerId, ...(input.cart_item_ids?.length ? { id: { in: input.cart_item_ids } } : {}) },
      orderBy: { id: 'asc' },
    });
    if (input.cart_item_ids?.length && cart.length !== new Set(input.cart_item_ids).size) throw notFound('Cart item');
    return cart.map((c) => ({ modelId: c.modelId, quantity: c.quantity, cartItemId: c.id as number | null }));
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async getForShop(shopId: number, orderSn: string, db: Tx = this.prisma): Promise<OrderWithRelations> {
    const order = await db.order.findFirst({ where: { orderSn, shopId }, include: orderInclude });
    if (!order) throw new DomainError('NOT_FOUND', `Order ${orderSn} not found`, { shopee_error: 'error_not_found' });
    return order;
  }

  async getForBuyer(buyerId: number, orderSn: string, db: Tx = this.prisma): Promise<OrderWithRelations> {
    const order = await db.order.findFirst({ where: { orderSn, buyerId }, include: orderInclude });
    if (!order) throw notFound('Order');
    return order;
  }

  async cancel(order: Order, by: 'seller' | 'buyer' | 'system', reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUniqueOrThrow({ where: { orderSn: order.orderSn }, include: { items: true } });
      assertTransition(fresh.status, 'CANCELLED');
      const moved = await tx.order.updateMany({
        where: { orderSn: fresh.orderSn, status: fresh.status },
        data: {
          status: 'CANCELLED',
          cancelBy: by,
          cancelReason: reason,
          ...(by === 'buyer' ? { buyerCancelReason: reason } : {}),
        },
      });
      if (moved.count !== 1) throw invalidState('Order status changed concurrently, retry');
      for (const line of fresh.items) {
        await tx.model.updateMany({ where: { id: line.modelId }, data: { stock: { increment: line.quantity } } });
        await tx.item.updateMany({ where: { id: line.itemId, sales: { gte: line.quantity } }, data: { sales: { decrement: line.quantity } } });
      }
      if (fresh.voucherId) {
        await tx.voucher.updateMany({ where: { id: fresh.voucherId, currentUsage: { gt: 0 } }, data: { currentUsage: { decrement: 1 } } });
      }
      const pkg = await tx.shipment.findUnique({ where: { orderSn: fresh.orderSn } });
      if (pkg) {
        const status: LogisticsStatus = fresh.status === 'SHIPPED' ? 'LOGISTICS_DELIVERY_FAILED' : 'LOGISTICS_REQUEST_CANCELED';
        await tx.shipment.update({
          where: { packageNumber: pkg.packageNumber },
          data: { logisticsStatus: status, events: { create: { logisticsStatus: status, description: `Đơn hàng đã bị hủy (${reason})`, createdAt: new Date() } } },
        });
      }
    });
    await this.emitStatus(order.orderSn);
  }

  async ship(shopId: number, orderSn: string, opts: { method: 'pickup' | 'dropoff'; addressId?: number; pickupTimeId?: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await this.getForShop(shopId, orderSn, tx);
      assertTransition(order.status, 'PROCESSED');
      if (opts.method === 'pickup') {
        const address = await tx.shopAddress.findFirst({ where: { id: opts.addressId, shopId, isPickup: true } });
        if (!address) throw validation('Invalid pickup address_id for this shop');
        if (opts.pickupTimeId && !/^\d{8}_(AM|PM)$/.test(opts.pickupTimeId)) throw validation('Invalid pickup_time_id');
      }
      const channel = await tx.logisticsChannel.findUniqueOrThrow({ where: { id: order.logisticsChannelId } });
      const moved = await tx.order.updateMany({ where: { orderSn, status: order.status }, data: { status: 'PROCESSED' } });
      if (moved.count !== 1) throw invalidState('Order status changed concurrently, retry');
      await tx.shipment.update({
        where: { orderSn },
        data: {
          logisticsStatus: 'LOGISTICS_REQUEST_CREATED',
          trackingNumber: `${channel.trackingPrefix}${randomDigits(10)}`,
          shipMethod: opts.method,
          pickupAddressId: opts.method === 'pickup' ? opts.addressId : null,
          pickupTimeId: opts.pickupTimeId ?? null,
          events: {
            create: {
              logisticsStatus: 'LOGISTICS_REQUEST_CREATED',
              description: opts.method === 'pickup' ? 'Người bán đã sắp xếp lấy hàng' : 'Người bán sẽ gửi hàng tại bưu cục',
              createdAt: new Date(),
            },
          },
        },
      });
    });
    const order = await this.prisma.order.findUniqueOrThrow({ where: { orderSn }, include: { package: true } });
    await this.push.emit(shopId, 'tracking_no', { ordersn: orderSn, package_number: order.package?.packageNumber, tracking_no: order.package?.trackingNumber });
    await this.emitStatus(orderSn);
  }

  /** Simulated carrier progress (seller-side custom signed extension). */
  async advanceShipment(shopId: number, orderSn: string, event: ShipmentEvent): Promise<OrderWithRelations> {
    const order = await this.getForShop(shopId, orderSn);
    if (event === 'DELIVERY_FAILED') {
      if (order.status !== 'SHIPPED') throw invalidState('Only shipped orders can fail delivery');
      await this.cancel(order, 'system', 'LOGISTICS_DELIVERY_FAILED');
      return this.getForShop(shopId, orderSn);
    }
    const plan: Record<Exclude<ShipmentEvent, 'DELIVERY_FAILED'>, { from: OrderStatus; to: OrderStatus | null; logistics: LogisticsStatus }> = {
      PICKED_UP: { from: 'PROCESSED', to: 'SHIPPED', logistics: 'LOGISTICS_PICKUP_DONE' },
      IN_TRANSIT: { from: 'SHIPPED', to: null, logistics: 'LOGISTICS_PICKUP_DONE' },
      OUT_FOR_DELIVERY: { from: 'SHIPPED', to: null, logistics: 'LOGISTICS_PICKUP_DONE' },
      DELIVERED: { from: 'SHIPPED', to: 'TO_CONFIRM_RECEIVE', logistics: 'LOGISTICS_DELIVERY_DONE' },
    };
    const step = plan[event];
    if (order.status !== step.from) {
      throw invalidState(`Shipment event ${event} requires order status ${step.from}, current ${order.status}`, { shopee_error: 'error_invalid_status' });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (step.to) {
        assertTransition(order.status, step.to);
        const moved = await tx.order.updateMany({ where: { orderSn, status: order.status }, data: { status: step.to } });
        if (moved.count !== 1) throw invalidState('Order status changed concurrently, retry');
      }
      await tx.shipment.update({
        where: { orderSn },
        data: {
          logisticsStatus: step.logistics,
          ...(event === 'PICKED_UP' ? { shippedAt: now } : {}),
          ...(event === 'DELIVERED' ? { deliveredAt: now } : {}),
          events: { create: { logisticsStatus: step.logistics, description: SHIPMENT_EVENT_TEXT[event], createdAt: now } },
        },
      });
    });
    if (step.to) await this.emitStatus(orderSn);
    return this.getForShop(shopId, orderSn);
  }

  async confirmReceipt(buyerId: number, orderSn: string): Promise<void> {
    const order = await this.getForBuyer(buyerId, orderSn);
    if (order.status !== 'TO_CONFIRM_RECEIVE') throw invalidState(`Order cannot be confirmed in status ${order.status}`);
    const moved = await this.prisma.order.updateMany({
      where: { orderSn, status: 'TO_CONFIRM_RECEIVE' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (moved.count !== 1) throw invalidState('Order status changed concurrently, retry');
    await this.emitStatus(orderSn);
  }

  async emitStatus(orderSn: string): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { orderSn } });
    await this.push.emit(order.shopId, 'order_status', { ordersn: orderSn, status: order.status, update_time: unix(order.updatedAt) });
  }

  // ---------------------------------------------------------------------------
  // Presenters
  // ---------------------------------------------------------------------------

  /** Project-defined buyer view (custom API). */
  presentForBuyer(order: OrderWithRelations, returnWindowDays = 7) {
    const deliveredAt = order.package?.deliveredAt ?? order.completedAt;
    const returnDue = deliveredAt ? addDays(deliveredAt, returnWindowDays) : null;
    return {
      order_sn: order.orderSn,
      checkout_id: order.checkoutId,
      shop: { shop_id: order.shop.id, shop_name: order.shop.name },
      status: order.status,
      payment_method: order.paymentMethod,
      cod: order.cod,
      currency: order.currency,
      items: order.items.map((i) => ({
        item_id: i.itemId,
        model_id: i.modelId,
        item_name: i.itemName,
        model_name: i.modelName,
        image_url: i.imageUrl ? mediaUrl(i.imageUrl) : null,
        quantity: i.quantity,
        original_price: toNumber(i.originalPrice),
        unit_price: toNumber(i.discountedPrice),
        line_total: toNumber(i.discountedPrice) * i.quantity,
      })),
      amounts: {
        items_subtotal: toNumber(order.itemsSubtotal),
        shipping_fee: toNumber(order.shippingFee),
        shipping_discount: toNumber(order.shippingDiscount),
        voucher_discount: toNumber(order.voucherDiscount),
        total_amount: toNumber(order.totalAmount),
      },
      voucher_code: order.voucherCode,
      recipient_address: order.recipientAddress,
      message_to_seller: order.messageToSeller,
      logistics: {
        logistics_channel_id: order.logisticsChannelId,
        shipping_carrier: order.shippingCarrier,
        tracking_number: order.package?.trackingNumber ?? null,
        logistics_status: order.package?.logisticsStatus ?? null,
      },
      cancel_by: order.cancelBy,
      cancel_reason: order.cancelReason,
      create_time: unix(order.createdAt),
      update_time: unix(order.updatedAt),
      pay_time: order.payTime ? unix(order.payTime) : null,
      ship_by_date: unix(order.shipByDate),
      delivered_time: deliveredAt ? unix(deliveredAt) : null,
      actions: {
        can_cancel: canTransition(order.status, 'CANCELLED') && ['UNPAID', 'READY_TO_SHIP'].includes(order.status),
        can_confirm_receipt: order.status === 'TO_CONFIRM_RECEIVE',
        can_request_return:
          !returnRequestBlock({ status: order.status, deliveredAt: order.package?.deliveredAt ?? null, completedAt: order.completedAt, windowDays: returnWindowDays, items: order.items, returns: order.returns ?? [] }),
        return_request_due_date: returnDue ? unix(returnDue) : null,
      },
    };
  }

  /** Shopee get_order_detail shape; optional blocks follow response_optional_fields. */
  presentForShopee(order: OrderWithRelations, optional: Set<string>) {
    const base: Record<string, unknown> = {
      order_sn: order.orderSn,
      region: 'VN',
      currency: order.currency,
      cod: order.cod,
      total_amount: toNumber(order.totalAmount),
      pending_terms: [],
      order_status: order.status,
      shipping_carrier: order.shippingCarrier,
      payment_method: order.paymentMethod,
      estimated_shipping_fee: toNumber(order.shippingFee),
      message_to_seller: order.messageToSeller,
      create_time: unix(order.createdAt),
      update_time: unix(order.updatedAt),
      days_to_ship: order.daysToShip,
      ship_by_date: unix(order.shipByDate),
      booking_sn: '',
      advance_package: false,
      is_international: false,
    };
    const add = (field: string, value: unknown) => {
      if (optional.has(field)) base[field] = value;
    };
    add('buyer_user_id', order.buyer.id);
    add('buyer_username', order.buyer.name);
    add('recipient_address', order.recipientAddress);
    add('actual_shipping_fee', toNumber(order.shippingFee) - toNumber(order.shippingDiscount));
    add('actual_shipping_fee_confirmed', order.status !== 'UNPAID' && order.status !== 'READY_TO_SHIP');
    add('goods_to_declare', false);
    add('note', '');
    add('note_update_time', 0);
    add('pay_time', order.payTime ? unix(order.payTime) : 0);
    add('dropshipper', '');
    add('dropshipper_phone', '');
    add('split_up', false);
    add('buyer_cancel_reason', order.buyerCancelReason ?? '');
    add('cancel_by', order.cancelBy ?? '');
    add('cancel_reason', order.cancelReason ?? '');
    add('fulfillment_flag', 'fulfilled_by_local_seller');
    add('pickup_done_time', order.package?.shippedAt ? unix(order.package.shippedAt) : 0);
    add('checkout_shipping_carrier', order.shippingCarrier);
    add('reverse_shipping_fee', 0);
    add('order_chargeable_weight_gram', Math.round(order.items.reduce((s, i) => s + toNumber(i.weightKg) * i.quantity, 0) * 1000));
    add('return_request_due_date', order.package?.deliveredAt ? unix(addDays(order.package.deliveredAt, 7)) : 0);
    add('edt_from', 0);
    add('edt_to', 0);
    const itemList = order.items.map((i) => ({
      item_id: i.itemId,
      item_name: i.itemName,
      item_sku: i.itemSku,
      model_id: i.isDefaultModel ? 0 : i.modelId,
      model_name: i.modelName,
      model_sku: i.modelSku,
      model_quantity_purchased: i.quantity,
      model_original_price: toNumber(i.originalPrice),
      model_discounted_price: toNumber(i.discountedPrice),
      wholesale: false,
      weight: toNumber(i.weightKg),
      add_on_deal: false,
      main_item: false,
      add_on_deal_id: 0,
      promotion_type: i.promotionId ? 'discount' : '',
      promotion_id: i.promotionId ?? 0,
      order_item_id: i.id,
      promotion_group_id: 0,
      image_info: { image_url: i.imageUrl ? mediaUrl(i.imageUrl) : '' },
      product_location_id: '',
      is_prescription_item: false,
      is_b2c_owned_item: false,
    }));
    add('item_list', itemList);
    add('package_list', order.package
      ? [
          {
            package_number: order.package.packageNumber,
            logistics_status: order.package.logisticsStatus,
            logistics_channel_id: order.logisticsChannelId,
            shipping_carrier: order.shippingCarrier,
            allow_self_design_awb: false,
            item_list: order.items.map((i) => ({
              item_id: i.itemId,
              model_id: i.isDefaultModel ? 0 : i.modelId,
              model_quantity: i.quantity,
              order_item_id: i.id,
              promotion_group_id: 0,
              product_location_id: '',
            })),
            parcel_chargeable_weight: Math.round(order.items.reduce((s, i) => s + toNumber(i.weightKg) * i.quantity, 0) * 1000),
          },
        ]
      : []);
    add('payment_info', [
      {
        payment_method: order.paymentMethod,
        payment_processor_register: '',
        card_family: '',
        transaction_id: order.payTime ? `SIM-${order.orderSn}` : '',
        payment_amount: toNumber(order.totalAmount),
      },
    ]);
    return base;
  }
}

function sum<T extends Record<K, number>, K extends keyof T>(list: T[], key: K): number {
  return list.reduce((s, g) => s + g[key], 0);
}

function randomDigits(n: number): string {
  const bytes = randomBytes(n);
  return Array.from(bytes, (b) => String(b % 10)).join('');
}

const SN_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateOrderSn(at: Date): string {
  const yymmdd = at.toISOString().slice(2, 10).replace(/-/g, '');
  const bytes = randomBytes(8);
  return yymmdd + Array.from(bytes, (b) => SN_ALPHABET[b % SN_ALPHABET.length]).join('');
}
