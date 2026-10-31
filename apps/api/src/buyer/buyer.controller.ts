import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OrderStatus, Prisma, ReturnStatus, User } from '@prisma/client';
import { z } from 'zod';
import { DomainError, invalidState, notFound, validation } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { unix } from '../common/time';
import { paging, parseInput, q, splitList } from '../common/validation';
import { CurrentUser, RequireRole, SessionGuard } from '../auth/session.guard';
import { modelImage, modelName, resolveModelPrice } from '../domain/catalog.service';
import { orderInclude, OrderService, PAYMENT_METHODS } from '../domain/order.service';
import { RETURN_REASONS, ReturnService, returnInclude } from '../domain/return.service';
import { pageInfo } from './marketplace.controller';

const MAX_LINE_QUANTITY = 999;

const addressSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^(\+84|0)\d{9,10}$/, 'must be a Vietnamese phone number'),
  state: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  town: z.string().trim().max(100).default(''),
  address: z.string().trim().min(1).max(300),
  zipcode: z.string().trim().max(20).default(''),
  is_default: z.boolean().default(false),
});

const checkoutSchema = z
  .object({
    address_id: z.number().int().optional(),
    payment_method: z.enum(PAYMENT_METHODS).default('COD'),
    cart_item_ids: z.array(z.number().int()).max(100).optional(),
    items: z.array(z.object({ model_id: z.number().int(), quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) })).max(100).optional(),
    shops: z
      .array(
        z.object({
          shop_id: z.number().int(),
          logistics_channel_id: z.number().int().optional(),
          voucher_code: z.string().trim().min(1).max(20).optional(),
          message_to_seller: z.string().max(500).optional(),
        }),
      )
      .max(50)
      .optional(),
  })
  .refine((v) => !(v.items?.length && v.cart_item_ids?.length), { message: 'Use either items or cart_item_ids', path: ['items'] });

/**
 * Buyer commerce API (project-defined, cookie session). Every query is scoped to the
 * session user: other buyers' carts, addresses, orders and returns are indistinguishable from
 * non-existent resources.
 */
@Controller('api/v1')
@UseGuards(SessionGuard)
@RequireRole('BUYER')
export class BuyerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly returns: ReturnService,
  ) {}

  // ----- addresses -----

  @Get('buyer/addresses')
  async listAddresses(@CurrentUser() user: User) {
    const rows = await this.prisma.buyerAddress.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
    return { data: rows.map(presentAddress) };
  }

  @Post('buyer/addresses')
  async createAddress(@CurrentUser() user: User, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseInput(addressSchema, body);
    const count = await this.prisma.buyerAddress.count({ where: { userId: user.id, deletedAt: null } });
    if (count >= 20) throw validation('Address book is full (20 addresses)');
    const makeDefault = input.is_default || count === 0;
    const address = await this.prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.buyerAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      const { is_default: _d, ...rest } = input;
      return tx.buyerAddress.create({ data: { ...rest, userId: user.id, isDefault: makeDefault } });
    });
    res.status(201);
    return { data: presentAddress(address) };
  }

  @Patch('buyer/addresses/:addressId')
  async updateAddress(@CurrentUser() user: User, @Param('addressId', ParseIntPipe) addressId: number, @Body() body: unknown) {
    const input = parseInput(addressSchema.partial(), body);
    await this.ownAddress(user.id, addressId);
    const address = await this.prisma.$transaction(async (tx) => {
      if (input.is_default) await tx.buyerAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      const { is_default, ...rest } = input;
      return tx.buyerAddress.update({ where: { id: addressId }, data: { ...rest, ...(is_default ? { isDefault: true } : {}) } });
    });
    return { data: presentAddress(address) };
  }

  @Delete('buyer/addresses/:addressId')
  async deleteAddress(@CurrentUser() user: User, @Param('addressId', ParseIntPipe) addressId: number) {
    const address = await this.ownAddress(user.id, addressId);
    await this.prisma.$transaction(async (tx) => {
      await tx.buyerAddress.update({ where: { id: addressId }, data: { deletedAt: new Date(), isDefault: false } });
      if (address.isDefault) {
        const next = await tx.buyerAddress.findFirst({ where: { userId: user.id, deletedAt: null }, orderBy: { id: 'asc' } });
        if (next) await tx.buyerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return { data: { deleted: true } };
  }

  // ----- cart -----

  @Get('cart')
  async getCart(@CurrentUser() user: User) {
    return { data: await this.cart(user.id) };
  }

  @Post('cart/items')
  async addCartItem(@CurrentUser() user: User, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseInput(z.object({ model_id: z.number().int(), quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) }), body);
    const model = await this.sellableModel(input.model_id);
    const existing = await this.prisma.cartItem.findUnique({ where: { userId_modelId: { userId: user.id, modelId: model.id } } });
    const quantity = (existing?.quantity ?? 0) + input.quantity;
    if (quantity > model.stock) throw new DomainError('OUT_OF_STOCK', `Only ${model.stock} available`);
    if ((await this.prisma.cartItem.count({ where: { userId: user.id } })) >= 200 && !existing) throw validation('Cart is full');
    await this.prisma.cartItem.upsert({
      where: { userId_modelId: { userId: user.id, modelId: model.id } },
      create: { userId: user.id, modelId: model.id, quantity },
      update: { quantity },
    });
    res.status(201);
    return { data: await this.cart(user.id) };
  }

  @Patch('cart/items/:cartItemId')
  async updateCartItem(@CurrentUser() user: User, @Param('cartItemId', ParseIntPipe) cartItemId: number, @Body() body: unknown) {
    const input = parseInput(
      z.object({ quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).optional(), model_id: z.number().int().optional() }).refine(
        (v) => v.quantity !== undefined || v.model_id !== undefined,
        'quantity or model_id is required',
      ),
      body,
    );
    const line = await this.prisma.cartItem.findFirst({ where: { id: cartItemId, userId: user.id }, include: { model: true } });
    if (!line) throw notFound('Cart item');
    const targetModelId = input.model_id ?? line.modelId;
    const model = await this.sellableModel(targetModelId);
    if (model.itemId !== line.model.itemId) throw validation('model_id must be a variation of the same product');
    const quantity = input.quantity ?? line.quantity;
    if (quantity > model.stock) throw new DomainError('OUT_OF_STOCK', `Only ${model.stock} available`);
    await this.prisma.$transaction(async (tx) => {
      if (targetModelId !== line.modelId) {
        const clash = await tx.cartItem.findUnique({ where: { userId_modelId: { userId: user.id, modelId: targetModelId } } });
        if (clash) {
          await tx.cartItem.delete({ where: { id: line.id } });
          await tx.cartItem.update({ where: { id: clash.id }, data: { quantity: Math.min(clash.quantity + quantity, model.stock) } });
          return;
        }
      }
      await tx.cartItem.update({ where: { id: line.id }, data: { modelId: targetModelId, quantity } });
    });
    return { data: await this.cart(user.id) };
  }

  @Delete('cart/items/:cartItemId')
  async removeCartItem(@CurrentUser() user: User, @Param('cartItemId', ParseIntPipe) cartItemId: number) {
    const removed = await this.prisma.cartItem.deleteMany({ where: { id: cartItemId, userId: user.id } });
    if (!removed.count) throw notFound('Cart item');
    return { data: await this.cart(user.id) };
  }

  // ----- checkout & shipping -----

  @Post('checkout/preview')
  @HttpCode(200)
  async preview(@CurrentUser() user: User, @Body() body: unknown) {
    const input = parseInput(checkoutSchema, body);
    return { data: await this.orders.quote(user.id, input) };
  }

  @Post('checkout')
  async checkout(
    @CurrentUser() user: User,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parseInput(checkoutSchema, body);
    if (idempotencyKey !== undefined && !/^[A-Za-z0-9_\-:.]{8,128}$/.test(idempotencyKey)) throw validation('Invalid Idempotency-Key');
    const result = await this.orders.checkout(user.id, input, idempotencyKey);
    const orders = await this.prisma.order.findMany({ where: { orderSn: { in: result.order_sn_list } }, include: orderInclude, orderBy: { shopId: 'asc' } });
    res.status(result.replayed ? 200 : 201);
    return { data: { ...result, orders: orders.map((o) => this.orders.presentForBuyer(o)) } };
  }

  @Post('shipping/quote')
  @HttpCode(200)
  async shippingQuote(@CurrentUser() user: User, @Body() body: unknown) {
    const input = parseInput(
      z.object({
        items: z.array(z.object({ model_id: z.number().int(), quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) })).min(1).max(100),
        payment_method: z.enum(PAYMENT_METHODS).default('COD'),
      }),
      body,
    );
    const quote = await this.orders.quote(user.id, { items: input.items, payment_method: input.payment_method });
    return {
      data: quote.groups.map((g) => ({
        shop_id: g.shop_id,
        shop_name: g.shop_name,
        items_subtotal: g.items_subtotal,
        options: g.shipping_options,
        recommended_logistics_channel_id: g.logistics_channel_id,
        free_shipping_applied: g.shipping_discount > 0,
      })),
    };
  }

  // ----- orders -----

  @Get('buyer/orders')
  async listOrders(@CurrentUser() user: User, @Query() query: unknown) {
    const input = parseInput(
      z.object({
        status: z.preprocess(splitList, z.array(z.nativeEnum(OrderStatus)).min(1)).optional(),
        shop_id: q.int().positive().optional(),
        ...paging,
      }),
      query,
    );
    const where: Prisma.OrderWhereInput = {
      buyerId: user.id,
      ...(input.shop_id ? { shopId: input.shop_id } : {}),
      ...(input.status?.length
        ? input.status.length === 1
          ? { status: input.status[0] }
          : { status: { in: input.status } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { orderSn: 'asc' }],
        skip: (input.page - 1) * input.page_size,
        take: input.page_size,
      }),
      this.prisma.order.count({ where }),
    ]);
    const [windows, viaAssistant] = await Promise.all([
      this.returnWindows(rows.map((o) => o.shopId)),
      this.assistantOrders(user.id, rows.map((o) => o.orderSn)),
    ]);
    return {
      data: rows.map((o) => this.orders.presentForBuyer(o, windows.get(o.shopId), viaAssistant.get(o.orderSn) ?? null)),
      page: pageInfo(input.page, input.page_size, total),
    };
  }

  /** Order counts per status for the order tabs, plus the buyer's return requests. */
  @Get('buyer/orders/counts')
  async orderCounts(@CurrentUser() user: User) {
    const [groups, returns] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: { buyerId: user.id }, _count: { _all: true } }),
      this.prisma.returnRequest.count({ where: { buyerId: user.id } }),
    ]);
    const by_status = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
    return { data: { total: groups.reduce((sum, g) => sum + g._count._all, 0), by_status, returns } };
  }

  @Get('buyer/orders/:orderSn')
  async getOrder(@CurrentUser() user: User, @Param('orderSn') orderSn: string) {
    const order = await this.orders.getForBuyer(user.id, orderSn);
    const [windows, viaAssistant] = await Promise.all([this.returnWindows([order.shopId]), this.assistantOrders(user.id, [order.orderSn])]);
    return { data: this.orders.presentForBuyer(order, windows.get(order.shopId), viaAssistant.get(order.orderSn) ?? null) };
  }

  @Post('buyer/orders/:orderSn/cancel')
  @HttpCode(200)
  async cancelOrder(@CurrentUser() user: User, @Param('orderSn') orderSn: string, @Body() body: unknown) {
    const input = parseInput(z.object({ reason: z.string().trim().min(1).max(200).default('Buyer changed mind') }), body);
    const order = await this.orders.getForBuyer(user.id, orderSn);
    const policy = await this.prisma.shopPolicy.findUnique({ where: { shopId: order.shopId } });
    const cancellable: OrderStatus[] = policy?.allowBuyerCancelUntil === 'UNPAID' ? ['UNPAID'] : ['UNPAID', 'READY_TO_SHIP'];
    if (!cancellable.includes(order.status)) throw invalidState(`Order in status ${order.status} can no longer be cancelled by the buyer`);
    await this.orders.cancel(order, 'buyer', input.reason);
    return { data: this.orders.presentForBuyer(await this.orders.getForBuyer(user.id, orderSn)) };
  }

  @Post('buyer/orders/:orderSn/confirm-receipt')
  @HttpCode(200)
  async confirmReceipt(@CurrentUser() user: User, @Param('orderSn') orderSn: string) {
    await this.orders.confirmReceipt(user.id, orderSn);
    return { data: this.orders.presentForBuyer(await this.orders.getForBuyer(user.id, orderSn)) };
  }

  @Get('buyer/orders/:orderSn/tracking')
  async tracking(@CurrentUser() user: User, @Param('orderSn') orderSn: string) {
    const order = await this.orders.getForBuyer(user.id, orderSn);
    return {
      data: {
        order_sn: order.orderSn,
        order_status: order.status,
        shipping_carrier: order.shippingCarrier,
        tracking_number: order.package?.trackingNumber ?? null,
        logistics_status: order.package?.logisticsStatus ?? 'LOGISTICS_NOT_START',
        events: (order.package?.events ?? [])
          .slice()
          .reverse()
          .map((e) => ({ time: unix(e.createdAt), logistics_status: e.logisticsStatus, description: e.description })),
      },
    };
  }

  @Post('buyer/orders/:orderSn/reviews')
  async review(@CurrentUser() user: User, @Param('orderSn') orderSn: string, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseInput(
      z.object({
        item_id: z.number().int(),
        model_id: z.number().int().optional(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(1000).default(''),
        image_urls: z.array(z.string().url()).max(5).default([]),
      }),
      body,
    );
    const order = await this.orders.getForBuyer(user.id, orderSn);
    if (order.status !== 'COMPLETED') throw invalidState('Reviews can only be written for completed orders');
    const line = order.items.find((i) => i.itemId === input.item_id && (input.model_id === undefined || i.modelId === input.model_id));
    if (!line) throw validation('This item is not part of the order');
    const exists = await this.prisma.review.findFirst({ where: { orderSn, itemId: line.itemId, modelId: line.modelId } });
    if (exists) throw new DomainError('CONFLICT', 'You have already reviewed this item for this order');
    const review = await this.prisma.review.create({
      data: {
        itemId: line.itemId,
        modelId: line.modelId,
        orderSn,
        buyerId: user.id,
        rating: input.rating,
        comment: input.comment,
        imageUrls: input.image_urls,
      },
    });
    res.status(201);
    return { data: { comment_id: review.id, item_id: review.itemId, rating: review.rating, comment: review.comment, create_time: unix(review.createdAt) } };
  }

  // ----- returns -----

  @Post('buyer/returns')
  async createReturn(@CurrentUser() user: User, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseInput(
      z.object({
        order_sn: z.string().min(1),
        reason: z.enum(RETURN_REASONS),
        text_reason: z.string().trim().max(1000).optional(),
        solution: z.enum(['RETURN_REFUND', 'REFUND_ONLY']).default('RETURN_REFUND'),
        items: z.array(z.object({ item_id: z.number().int(), model_id: z.number().int(), quantity: z.number().int().min(1) })).min(1).optional(),
        image_urls: z.array(z.string().url()).max(8).optional(),
        evidence_ids: z.array(z.string().uuid()).max(8).optional(),
      }),
      body,
    );
    const created = await this.returns.create(user.id, input);
    res.status(201);
    return { data: this.returns.presentForBuyer(await this.returns.getForBuyer(user.id, created.returnSn)) };
  }

  @Get('buyer/returns')
  async listReturns(@CurrentUser() user: User, @Query() query: unknown) {
    const input = parseInput(z.object({ status: z.nativeEnum(ReturnStatus).optional(), ...paging }), query);
    const where: Prisma.ReturnRequestWhereInput = { buyerId: user.id, ...(input.status ? { status: input.status } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        include: returnInclude,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.page_size,
        take: input.page_size,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return { data: rows.map((r) => this.returns.presentForBuyer(r)), page: pageInfo(input.page, input.page_size, total) };
  }

  @Get('buyer/returns/:returnSn')
  async getReturn(@CurrentUser() user: User, @Param('returnSn') returnSn: string) {
    return { data: this.returns.presentForBuyer(await this.returns.getForBuyer(user.id, returnSn)) };
  }

  @Post('buyer/returns/:returnSn/accept-offer')
  @HttpCode(200)
  async acceptOffer(@CurrentUser() user: User, @Param('returnSn') returnSn: string) {
    await this.returns.acceptOffer(user.id, returnSn);
    return { data: this.returns.presentForBuyer(await this.returns.getForBuyer(user.id, returnSn)) };
  }

  @Post('buyer/returns/:returnSn/cancel')
  @HttpCode(200)
  async cancelReturn(@CurrentUser() user: User, @Param('returnSn') returnSn: string) {
    await this.returns.cancelByBuyer(user.id, returnSn);
    return { data: this.returns.presentForBuyer(await this.returns.getForBuyer(user.id, returnSn)) };
  }

  // ---------------------------------------------------------------------------

  private async ownAddress(userId: number, addressId: number) {
    const address = await this.prisma.buyerAddress.findFirst({ where: { id: addressId, userId, deletedAt: null } });
    if (!address) throw notFound('Address');
    return address;
  }

  private async sellableModel(modelId: number) {
    const model = await this.prisma.model.findUnique({ where: { id: modelId }, include: { item: { include: { shop: true } } } });
    if (
      !model ||
      model.item.status !== 'NORMAL' ||
      model.item.shop.status !== 'NORMAL' ||
      model.status !== 'MODEL_NORMAL' ||
      model.isDefault === model.item.hasModel
    ) {
      throw notFound('Product variation');
    }
    return model;
  }

  private async returnWindows(shopIds: number[]) {
    const policies = await this.prisma.shopPolicy.findMany({ where: { shopId: { in: [...new Set(shopIds)] } } });
    return new Map(policies.map((p) => [p.shopId, p.returnWindowDays]));
  }

  /** Orders placed by tapping an assistant quote, keyed by order_sn: the executed PLACE_ORDER action records it. */
  private async assistantOrders(buyerId: number, orderSns: string[]) {
    if (!orderSns.length) return new Map<string, { conversationId: string; at: Date }>();
    const placed = await this.prisma.pendingAction.findMany({
      where: { buyerId, type: 'PLACE_ORDER', status: 'EXECUTED' },
      select: { conversationId: true, result: true, updatedAt: true },
    });
    const wanted = new Set(orderSns);
    const map = new Map<string, { conversationId: string; at: Date }>();
    for (const action of placed) {
      const sn = (action.result as { order_sn?: unknown } | null)?.order_sn;
      if (typeof sn === 'string' && wanted.has(sn)) map.set(sn, { conversationId: action.conversationId, at: action.updatedAt });
    }
    return map;
  }

  private async cart(userId: number) {
    const lines = await this.prisma.cartItem.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
      include: {
        model: {
          include: {
            discountModels: { include: { discount: true } },
            item: { include: { shop: { select: { id: true, name: true, status: true, holidayMode: true } }, images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
          },
        },
      },
    });
    const groups = new Map<number, { shop_id: number; shop_name: string; items: unknown[]; subtotal: number }>();
    let total = 0;
    for (const line of lines) {
      const { model } = line;
      const item = model.item;
      const price = resolveModelPrice(model);
      const available =
        item.status === 'NORMAL' && item.shop.status === 'NORMAL' && !item.shop.holidayMode && model.status === 'MODEL_NORMAL' && model.isDefault !== item.hasModel;
      const inStock = model.stock >= line.quantity;
      const group = groups.get(item.shop.id) ?? { shop_id: item.shop.id, shop_name: item.shop.name, items: [], subtotal: 0 };
      const lineTotal = price.currentPrice * line.quantity;
      group.items.push({
        cart_item_id: line.id,
        item_id: item.id,
        model_id: model.id,
        item_name: item.name,
        model_name: modelName(item, model.tierIndex),
        image_url: modelImage(item, model.tierIndex),
        quantity: line.quantity,
        unit_price: price.currentPrice,
        original_price: price.originalPrice,
        line_total: lineTotal,
        stock: model.stock,
        available: available && inStock,
        issue: !available ? 'Product is unavailable' : !inStock ? (model.stock === 0 ? 'Out of stock' : `Only ${model.stock} left`) : null,
      });
      if (available && inStock) {
        group.subtotal += lineTotal;
        total += lineTotal;
      }
      groups.set(item.shop.id, group);
    }
    return { shops: [...groups.values()], item_count: lines.reduce((s, l) => s + l.quantity, 0), subtotal: total, currency: 'VND' };
  }
}

function presentAddress(a: {
  id: number;
  name: string;
  phone: string;
  region: string;
  state: string;
  city: string;
  district: string;
  town: string;
  address: string;
  zipcode: string;
  isDefault: boolean;
}) {
  return {
    address_id: a.id,
    name: a.name,
    phone: a.phone,
    region: a.region,
    state: a.state,
    city: a.city,
    district: a.district,
    town: a.town,
    address: a.address,
    zipcode: a.zipcode,
    is_default: a.isDefault,
  };
}
