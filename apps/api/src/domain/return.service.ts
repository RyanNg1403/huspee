import { Injectable } from '@nestjs/common';
import { Prisma, ReturnRequest, ReturnStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { DomainError, invalidState, notFound, validation } from '../common/errors';
import { dec, roundVnd, toNumber } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { addDays, unix } from '../common/time';
import { mediaUrl } from './catalog.service';
import { assertTransition } from './order.service';
import { PushService } from './push.service';

export const RETURN_REASONS = [
  'NOT_RECEIPT',
  'WRONG_ITEM',
  'ITEM_DAMAGED',
  'DIFFERENT_DESCRIPTION',
  'MUTUAL_AGREE',
  'ITEM_MISSING',
  'EXPECTATION_FAILED',
  'ITEM_FAKE',
  'PHYSICAL_DMG',
  'FUNCTIONAL_DMG',
  'CHANGE_MIND',
  'OTHER',
] as const;

/** return_solution values */
export const SOLUTION_RETURN_REFUND = 0;
export const SOLUTION_REFUND_ONLY = 1;

const SELLER_RESPONSE_DAYS = 3;
const OFFER_RESPONSE_DAYS = 2;
const OPEN_STATUSES: ReturnStatus[] = ['REQUESTED', 'PROCESSING', 'JUDGING', 'SELLER_DISPUTE'];

interface ReturnLine {
  item_id: number;
  model_id: number;
  external_model_id: number;
  quantity: number;
  item_price: number;
  refund_amount: number;
  item_name: string;
  model_name: string;
  item_sku: string;
  model_sku: string;
  image_url: string | null;
}

export function returnSnapshot(lines: ReturnLine[], refund: number) {
  return { lines: lines.map((line) => ({ item_id: line.item_id, model_id: line.external_model_id, name: line.item_name, variant: line.model_name, quantity: line.quantity, price: line.item_price, refund_amount: line.refund_amount })), refund };
}

interface Negotiation {
  negotiation_status: 'PENDING_RESPOND' | 'PENDING_BUYER_RESPOND' | 'TERMINATED' | 'ACCEPTED';
  latest_solution: 'return_refund' | 'refund' | '';
  latest_offer_amount: number;
  latest_offer_creator: 'seller' | 'buyer' | '';
  counter_limit: number;
  offer_due_date: number;
}

export interface CreateReturnInput {
  order_sn: string;
  reason: (typeof RETURN_REASONS)[number];
  text_reason?: string;
  solution: 'RETURN_REFUND' | 'REFUND_ONLY';
  items?: Array<{ item_id: number; model_id: number; quantity: number }>;
  image_urls?: string[];
}

const returnInclude = { buyer: { select: { name: true, email: true } } } satisfies Prisma.ReturnRequestInclude;
type ReturnWithBuyer = Prisma.ReturnRequestGetPayload<{ include: typeof returnInclude }>;

/**
 * Buyer return/refund lifecycle shared by the buyer API and Shopee-compatible returns.*:
 *   REQUESTED --confirm--> ACCEPTED (simulated refund paid)
 *   REQUESTED --offer--> REQUESTED(negotiation PENDING_BUYER_RESPOND) --buyer accept--> ACCEPTED
 *   REQUESTED --dispute--> JUDGING --cancel_dispute--> REQUESTED
 *   REQUESTED --buyer cancel--> CANCELLED
 * The order sits in TO_RETURN while a return is open and returns to COMPLETED afterwards.
 */
@Injectable()
export class ReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async preview(buyerId: number, input: CreateReturnInput) {
    const order = await this.prisma.order.findFirst({
      where: { orderSn: input.order_sn, buyerId },
      include: { items: true, package: true, shop: { include: { policy: true } }, returns: true },
    });
    if (!order) throw notFound('Order');
    if (order.status !== 'TO_CONFIRM_RECEIVE' && order.status !== 'COMPLETED') {
      throw invalidState(`A return cannot be requested for an order in status ${order.status}`);
    }
    const windowDays = order.shop.policy?.returnWindowDays ?? 7;
    const deliveredAt = order.package?.deliveredAt ?? order.completedAt;
    if (!deliveredAt || addDays(deliveredAt, windowDays) <= new Date()) {
      throw invalidState(`The ${windowDays}-day return window for this order has passed`);
    }
    if (order.returns.some((r) => OPEN_STATUSES.includes(r.status))) throw invalidState('This order already has an open return request');

    // Quantities already returned (accepted) or in progress cannot be returned again.
    const alreadyReturned = new Map<number, number>();
    for (const r of order.returns.filter((r) => r.status !== 'CANCELLED' && r.status !== 'CLOSED')) {
      for (const line of r.items as unknown as ReturnLine[]) alreadyReturned.set(line.model_id, (alreadyReturned.get(line.model_id) ?? 0) + line.quantity);
    }
    const requested =
      input.items ??
      order.items.map((i) => ({ item_id: i.itemId, model_id: i.isDefaultModel ? 0 : i.modelId, quantity: i.quantity - (alreadyReturned.get(i.modelId) ?? 0) }));
    const subtotal = toNumber(order.itemsSubtotal);
    const voucherShare = subtotal > 0 ? toNumber(order.voucherDiscount) / subtotal : 0;
    const lines: ReturnLine[] = [];
    for (const req of requested) {
      if (req.quantity <= 0) continue;
      const line = order.items.find((i) => i.itemId === req.item_id && (req.model_id === 0 ? i.isDefaultModel : i.modelId === req.model_id));
      if (!line) throw validation(`Item ${req.item_id}/${req.model_id} is not part of this order`);
      const remaining = line.quantity - (alreadyReturned.get(line.modelId) ?? 0);
      if (req.quantity > remaining) throw validation(`Cannot return more than ${remaining} of ${line.itemName}`);
      const unit = toNumber(line.discountedPrice);
      lines.push({
        item_id: line.itemId,
        model_id: line.modelId,
        external_model_id: line.isDefaultModel ? 0 : line.modelId,
        quantity: req.quantity,
        item_price: unit,
        refund_amount: roundVnd(unit * req.quantity * (1 - voucherShare)),
        item_name: line.itemName,
        model_name: line.modelName,
        item_sku: line.itemSku,
        model_sku: line.modelSku,
        image_url: line.imageUrl,
      });
    }
    if (lines.length === 0) throw validation('Nothing left to return for this order');
    const refund = lines.reduce((s, l) => s + l.refund_amount, 0);
    return { order, lines, refund };
  }

  async create(buyerId: number, input: CreateReturnInput, assistant?: { actionId: string; shopId: number; confirmationKey: string; snapshotHash: string }): Promise<ReturnRequest> {
    const { order, lines, refund } = await this.preview(buyerId, input);
    if (assistant && order.shopId !== assistant.shopId) throw notFound('Order');
    if (assistant && createHash('sha256').update(JSON.stringify(returnSnapshot(lines, refund))).digest('hex') !== assistant.snapshotHash) throw invalidState('Return details changed; please confirm again');
    const created = await this.prisma.$transaction(async (tx) => {
      if (assistant) {
        const claimed = await tx.pendingAction.updateMany({ where: { id: assistant.actionId, buyerId, shopId: assistant.shopId, type: 'OPEN_RETURN', status: 'PENDING', expiresAt: { gt: new Date() } }, data: { status: 'EXECUTED', idempotencyKey: assistant.confirmationKey } });
        if (!claimed.count) throw invalidState('Action is no longer pending');
      }
      assertTransition(order.status, 'TO_RETURN');
      const moved = await tx.order.updateMany({ where: { orderSn: order.orderSn, status: order.status }, data: { status: 'TO_RETURN' } });
      if (moved.count !== 1) throw invalidState('Order status changed concurrently, retry');
      const created = await tx.returnRequest.create({
        data: {
          returnSn: generateReturnSn(),
          orderSn: order.orderSn,
          shopId: order.shopId,
          buyerId,
          reason: input.reason,
          textReason: input.text_reason ?? '',
          imageUrls: input.image_urls ?? [],
          solution: input.solution === 'REFUND_ONLY' ? SOLUTION_REFUND_ONLY : SOLUTION_RETURN_REFUND,
          needsReturnShipment: input.solution !== 'REFUND_ONLY',
          refundAmount: dec(refund),
          items: lines as unknown as Prisma.InputJsonValue,
          negotiation: { negotiation_status: 'PENDING_RESPOND', latest_solution: '', latest_offer_amount: 0, latest_offer_creator: '', counter_limit: 1, offer_due_date: 0 },
          dueDate: addDays(new Date(), SELLER_RESPONSE_DAYS),
        },
      });
      if (assistant) await tx.pendingAction.update({ where: { id: assistant.actionId }, data: { result: { return_sn: created.returnSn } } });
      return created;
    });
    await this.emit(created);
    return created;
  }

  async getForShop(shopId: number, returnSn: string): Promise<ReturnWithBuyer> {
    const ret = await this.prisma.returnRequest.findFirst({ where: { returnSn, shopId }, include: returnInclude });
    if (!ret) throw new DomainError('NOT_FOUND', `Return ${returnSn} not found`);
    return ret;
  }

  async getForBuyer(buyerId: number, returnSn: string): Promise<ReturnWithBuyer> {
    const ret = await this.prisma.returnRequest.findFirst({ where: { returnSn, buyerId }, include: returnInclude });
    if (!ret) throw notFound('Return');
    return ret;
  }

  availableSolutions(ret: ReturnRequest) {
    const open = ret.status === 'REQUESTED' && negotiationOf(ret).negotiation_status === 'PENDING_RESPOND';
    const max = toNumber(ret.refundAmount);
    return {
      return_sn: ret.returnSn,
      offer_return_refund: { eligibility: open && ret.solution === SOLUTION_REFUND_ONLY, refund_amount_adjustable: false, max_refund_amount: max, min_refund_amount: max },
      offer_refund: { eligibility: open, refund_amount_adjustable: true, max_refund_amount: max, min_refund_amount: 0 },
    };
  }

  /** Seller accepts the buyer's request: refund is simulated as paid immediately. */
  async confirm(shopId: number, returnSn: string): Promise<void> {
    const ret = await this.getForShop(shopId, returnSn);
    if (ret.status !== 'REQUESTED') throw invalidState(`Return in status ${ret.status} cannot be confirmed`);
    await this.accept(ret, toNumber(ret.refundAmount), ret.solution);
  }

  async offer(shopId: number, returnSn: string, solution: 'return_refund' | 'refund', amount: number | undefined): Promise<void> {
    const ret = await this.getForShop(shopId, returnSn);
    const solutions = this.availableSolutions(ret);
    const option = solution === 'refund' ? solutions.offer_refund : solutions.offer_return_refund;
    if (!option.eligibility) throw invalidState(`Offer "${solution}" is not available for this return`);
    const offerAmount = option.refund_amount_adjustable ? amount : option.max_refund_amount;
    if (offerAmount === undefined) throw validation('proposed_adjusted_refund_amount is required for a refund offer');
    if (offerAmount < option.min_refund_amount || offerAmount > option.max_refund_amount) {
      throw validation(`proposed_adjusted_refund_amount must be between ${option.min_refund_amount} and ${option.max_refund_amount}`);
    }
    const negotiation: Negotiation = {
      negotiation_status: 'PENDING_BUYER_RESPOND',
      latest_solution: solution,
      latest_offer_amount: roundVnd(offerAmount),
      latest_offer_creator: 'seller',
      counter_limit: 0,
      offer_due_date: unix(addDays(new Date(), OFFER_RESPONSE_DAYS)),
    };
    await this.update(ret, 'REQUESTED', { negotiation: negotiation as unknown as Prisma.InputJsonValue });
  }

  async acceptOffer(buyerId: number, returnSn: string): Promise<void> {
    const ret = await this.getForBuyer(buyerId, returnSn);
    const negotiation = negotiationOf(ret);
    if (ret.status !== 'REQUESTED' || negotiation.negotiation_status !== 'PENDING_BUYER_RESPOND') {
      throw invalidState('There is no pending seller offer to accept');
    }
    await this.accept(ret, negotiation.latest_offer_amount, negotiation.latest_solution === 'refund' ? SOLUTION_REFUND_ONLY : SOLUTION_RETURN_REFUND, {
      ...negotiation,
      negotiation_status: 'ACCEPTED',
    });
  }

  async dispute(shopId: number, returnSn: string, input: { email: string; dispute_reason_id: number; dispute_text_reason?: string; images: string[] }) {
    const ret = await this.getForShop(shopId, returnSn);
    if (ret.status !== 'REQUESTED') throw invalidState(`Return in status ${ret.status} cannot be disputed`);
    await this.update(ret, 'JUDGING', {
      dispute: { reason_id: input.dispute_reason_id, text_reason: input.dispute_text_reason ?? '', email: input.email, images: input.images },
    });
  }

  async cancelDispute(shopId: number, returnSn: string) {
    const ret = await this.getForShop(shopId, returnSn);
    if (ret.status !== 'JUDGING') throw invalidState('Return is not under dispute');
    await this.update(ret, 'REQUESTED', { dispute: Prisma.DbNull });
  }

  async cancelByBuyer(buyerId: number, returnSn: string) {
    const ret = await this.getForBuyer(buyerId, returnSn);
    if (ret.status !== 'REQUESTED') throw invalidState(`Return in status ${ret.status} cannot be cancelled`);
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.returnRequest.updateMany({ where: { returnSn, status: 'REQUESTED' }, data: { status: 'CANCELLED' } });
      if (moved.count !== 1) throw invalidState('Return status changed concurrently, retry');
      await this.restoreOrder(tx, ret.orderSn);
    });
    await this.emit(await this.prisma.returnRequest.findUniqueOrThrow({ where: { returnSn } }));
  }

  presentForShopee(ret: ReturnWithBuyer, detail: boolean) {
    const lines = ret.items as unknown as ReturnLine[];
    const negotiation = negotiationOf(ret);
    const tracking = (ret.reverseTracking as Array<{ update_time: number; tracking_status: string }>) ?? [];
    const base = {
      image: ret.imageUrls.map(mediaUrl),
      reason: ret.reason,
      text_reason: ret.textReason,
      return_sn: ret.returnSn,
      refund_amount: toNumber(ret.refundAmount),
      currency: ret.currency,
      create_time: unix(ret.createdAt),
      update_time: unix(ret.updatedAt),
      status: ret.status,
      due_date: unix(ret.dueDate),
      tracking_number: ret.reverseTrackingNumber ?? '',
      dispute_reason: ret.dispute ? [String((ret.dispute as { reason_id: number }).reason_id)] : [],
      dispute_text_reason: ret.dispute ? [(ret.dispute as { text_reason: string }).text_reason] : [],
      needs_logistics: ret.needsReturnShipment,
      amount_before_discount: lines.reduce((s, l) => s + l.item_price * l.quantity, 0),
      user: { username: ret.buyer.name, email: '', portrait: '' },
      item: lines.map((l) => ({
        model_id: l.external_model_id,
        name: [l.item_name, l.model_name].filter(Boolean).join(' - '),
        images: l.image_url ? [l.image_url] : [],
        amount: l.quantity,
        item_price: l.item_price,
        is_add_on_deal: false,
        is_main_item: false,
        add_on_deal_id: 0,
        item_id: l.item_id,
        item_sku: l.item_sku,
        variation_sku: l.model_sku,
        ...(detail ? { refund_amount: l.refund_amount } : {}),
      })),
      order_sn: ret.orderSn,
      return_ship_due_date: ret.needsReturnShipment ? unix(addDays(ret.createdAt, 7)) : 0,
      return_seller_due_date: unix(ret.dueDate),
      negotiation_status: negotiation.negotiation_status,
      seller_proof_status: 'NOT_NEEDED',
      seller_compensation_status: 'NOT_REQUIRED',
      return_refund_type: 'POST_SHIPMENT',
      return_solution: ret.solution,
      is_seller_arrange: false,
      is_shipping_proof_mandatory: false,
      return_refund_request_type: 0,
      validation_type: 'seller_validation',
      is_partial_quantity_return: false,
      is_refund_amount_adjusted: negotiation.negotiation_status === 'ACCEPTED',
      shipping_fee_responsibility: 'buyer',
    };
    if (!detail) return base;
    const { negotiation_status: _n, ...rest } = base;
    return {
      ...rest,
      negotiation: {
        negotiation_status: negotiation.negotiation_status,
        latest_solution: negotiation.latest_solution,
        latest_offer_amount: negotiation.latest_offer_amount,
        latest_offer_creator: negotiation.latest_offer_creator,
        counter_limit: negotiation.counter_limit,
        offer_due_date: negotiation.offer_due_date,
      },
      logistics_status: ret.needsReturnShipment ? (tracking.at(-1)?.tracking_status ?? 'LOGISTICS_NOT_STARTED') : 'LOGISTICS_NOT_NEEDED',
      reverse_logistics_status: ret.needsReturnShipment ? (tracking.at(-1)?.tracking_status ?? 'LOGISTICS_NOT_STARTED') : '',
      activity: [],
    };
  }

  presentForBuyer(ret: ReturnWithBuyer) {
    const lines = ret.items as unknown as ReturnLine[];
    const negotiation = negotiationOf(ret);
    return {
      return_sn: ret.returnSn,
      order_sn: ret.orderSn,
      shop_id: ret.shopId,
      status: ret.status,
      reason: ret.reason,
      text_reason: ret.textReason,
      solution: ret.solution === SOLUTION_REFUND_ONLY ? 'REFUND_ONLY' : 'RETURN_REFUND',
      refund_amount: toNumber(ret.refundAmount),
      currency: ret.currency,
      refund_paid: !!ret.refundPaidAt,
      refund_paid_time: ret.refundPaidAt ? unix(ret.refundPaidAt) : null,
      items: lines.map((l) => ({
        item_id: l.item_id,
        model_id: l.model_id,
        item_name: l.item_name,
        model_name: l.model_name,
        quantity: l.quantity,
        refund_amount: l.refund_amount,
        image_url: l.image_url,
      })),
      seller_offer:
        negotiation.negotiation_status === 'PENDING_BUYER_RESPOND'
          ? { solution: negotiation.latest_solution, amount: negotiation.latest_offer_amount, due_date: negotiation.offer_due_date }
          : null,
      reverse_tracking_number: ret.reverseTrackingNumber,
      reverse_tracking: ret.reverseTracking,
      create_time: unix(ret.createdAt),
      update_time: unix(ret.updatedAt),
      due_date: unix(ret.dueDate),
    };
  }

  private async accept(ret: ReturnRequest, amount: number, solution: number, negotiation?: Negotiation) {
    const now = new Date();
    const needsShipment = solution === SOLUTION_RETURN_REFUND;
    const reverseTracking = needsShipment
      ? [
          { update_time: unix(now), tracking_status: 'LOGISTICS_REQUEST_CREATED', tracking_description: 'Yêu cầu trả hàng đã được tạo' },
          { update_time: unix(now), tracking_status: 'LOGISTICS_PICKUP_DONE', tracking_description: 'Đơn vị vận chuyển đã lấy hàng hoàn (mô phỏng)' },
          { update_time: unix(now), tracking_status: 'LOGISTICS_DELIVERY_DONE', tracking_description: 'Người bán đã nhận hàng hoàn (mô phỏng)' },
        ]
      : [];
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.returnRequest.updateMany({
        where: { returnSn: ret.returnSn, status: ret.status },
        data: {
          status: 'ACCEPTED',
          refundAmount: dec(amount),
          solution,
          needsReturnShipment: needsShipment,
          refundPaidAt: now,
          reverseTrackingNumber: needsShipment ? `RT${randomBytes(5).toString('hex').toUpperCase()}` : null,
          reverseTracking: reverseTracking as Prisma.InputJsonValue,
          ...(negotiation ? { negotiation: negotiation as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      if (moved.count !== 1) throw invalidState('Return status changed concurrently, retry');
      await this.restoreOrder(tx, ret.orderSn);
    });
    await this.emit(await this.prisma.returnRequest.findUniqueOrThrow({ where: { returnSn: ret.returnSn } }));
  }

  private async update(ret: ReturnRequest, status: ReturnStatus, data: Prisma.ReturnRequestUpdateManyMutationInput) {
    const moved = await this.prisma.returnRequest.updateMany({ where: { returnSn: ret.returnSn, status: ret.status }, data: { ...data, status } });
    if (moved.count !== 1) throw invalidState('Return status changed concurrently, retry');
    await this.emit(await this.prisma.returnRequest.findUniqueOrThrow({ where: { returnSn: ret.returnSn } }));
  }

  private async restoreOrder(tx: Prisma.TransactionClient, orderSn: string) {
    const order = await tx.order.findUniqueOrThrow({ where: { orderSn } });
    if (order.status === 'TO_RETURN') {
      assertTransition('TO_RETURN', 'COMPLETED');
      await tx.order.update({ where: { orderSn }, data: { status: 'COMPLETED', completedAt: order.completedAt ?? new Date() } });
    }
  }

  private async emit(ret: ReturnRequest) {
    await this.push.emit(ret.shopId, 'return_status', { return_sn: ret.returnSn, order_sn: ret.orderSn, status: ret.status, update_time: unix(ret.updatedAt) });
  }
}

function negotiationOf(ret: ReturnRequest): Negotiation {
  return (ret.negotiation as unknown as Negotiation | null) ?? {
    negotiation_status: 'TERMINATED',
    latest_solution: '',
    latest_offer_amount: 0,
    latest_offer_creator: '',
    counter_limit: 0,
    offer_due_date: 0,
  };
}

function generateReturnSn(): string {
  const now = new Date();
  const prefix = now.toISOString().slice(2, 10).replace(/-/g, '');
  return prefix + randomBytes(6).readUIntBE(0, 6).toString().padStart(12, '0').slice(0, 12);
}
