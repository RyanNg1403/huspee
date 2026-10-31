import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, PendingAction } from '@prisma/client';
import { DomainError, invalidState, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { modelName, resolveModelPrice } from '../domain/catalog.service';
import { CreateReturnInput, returnSnapshot, returnStateHash, ReturnService } from '../domain/return.service';
import { assistantQuoteSnapshot, CheckoutInput, OrderService, PaymentMethod } from '../domain/order.service';
import { AssistantEvents } from './assistant.events';
import type { PendingActionView } from './types';

/** Spoken and shown labels for return reasons; the stored value stays the enum. */
const RETURN_REASON_LABELS: Record<string, string> = {
  NOT_RECEIPT: 'Chưa nhận được hàng / Item not received',
  WRONG_ITEM: 'Giao sai hàng / Wrong item',
  ITEM_DAMAGED: 'Hàng bị hư hỏng / Item damaged',
  DIFFERENT_DESCRIPTION: 'Khác mô tả / Different from description',
  MUTUAL_AGREE: 'Thỏa thuận với người bán / Agreed with seller',
  ITEM_MISSING: 'Thiếu hàng / Item missing',
  EXPECTATION_FAILED: 'Không như mong đợi / Not as expected',
  ITEM_FAKE: 'Hàng giả / Counterfeit item',
  PHYSICAL_DMG: 'Hư hỏng bên ngoài / Physical damage',
  FUNCTIONAL_DMG: 'Lỗi chức năng / Does not work properly',
  CHANGE_MIND: 'Đổi ý / Changed mind',
  OTHER: 'Lý do khác / Other',
};

/** Runtime context can contain page metadata; persist/query only the action's ownership fields. */
function actionScope({ conversationId, buyerId, shopId }: { conversationId: string; buyerId: number; shopId: number }) {
  return { conversationId, buyerId, shopId };
}

export type CartAddInput = { item_id: number; model_id: number; quantity: number };
type CartAddSnapshot = CartAddInput & { price: number; item_name: string; model_name: string; new_model_id?: number; previous_quantity?: number };
/** Older saved single-item actions remain confirmable and editable. */
function cartAddLines(payload: Prisma.JsonValue): CartAddSnapshot[] {
  const input = payload as unknown as CartAddSnapshot & { lines?: CartAddSnapshot[] };
  return input.lines ?? [input];
}

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AssistantEvents,
    private readonly orders: OrderService,
    private readonly returns: ReturnService,
  ) {}
  view(action: PendingAction): PendingActionView {
    return {
      action_id: action.id,
      type: action.type,
      status: action.status,
      requires_tap: action.requiresTap,
      expires_at: Math.floor(action.expiresAt.getTime() / 1000),
      summary: action.summary as unknown as PendingActionView['summary'],
      ...(action.result ? { result: action.result as PendingActionView['result'] } : {}),
    };
  }
  /** `replaces`: the action the buyer edited on screen; the voice reads the new summary back. */
  private emit(action: PendingAction, replaces?: string, initiatedBy?: 'agent' | 'buyer' | 'edit') {
    const view = this.view(action);
    this.events.emitAction({ conversationId: action.conversationId, action: view, ...(replaces ? { replaces } : {}), ...(initiatedBy ? { initiatedBy } : {}) });
    return view;
  }
  async prepareAdd(ctx: { conversationId: string; buyerId: number; shopId: number }, input: { item_id: number; model_id: number; quantity: number }, replaces?: string) {
    return this.prepareAdds(ctx, [input], replaces);
  }
  async prepareAdds(ctx: { conversationId: string; buyerId: number; shopId: number }, inputs: CartAddInput[], replaces?: string) {
    if (!inputs.length || inputs.length > 50 || new Set(inputs.map((line) => line.model_id)).size !== inputs.length)
      throw invalidState('Choose 1 to 50 distinct product variants');
    if (inputs.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999))
      throw invalidState('Quantity must be an integer between 1 and 999');
    const models = await this.prisma.model.findMany({
      where: {
        id: { in: inputs.map((line) => line.model_id) },
        status: 'MODEL_NORMAL',
        item: { shopId: ctx.shopId, status: 'NORMAL', shop: { status: 'NORMAL', holidayMode: false } },
      },
      include: { item: true, discountModels: { include: { discount: true } } },
    });
    const cart = await this.prisma.cartItem.findMany({ where: { userId: ctx.buyerId } });
    const lines = inputs.map((input): CartAddSnapshot => {
      const model = models.find((entry) => entry.id === input.model_id && entry.itemId === input.item_id);
      if (!model || model.isDefault === model.item.hasModel) throw notFound('Product variation');
      const existing = cart.find((line) => line.modelId === model.id);
      if ((existing?.quantity ?? 0) + input.quantity > Math.min(model.stock, 999)) throw invalidState('Requested quantity is unavailable');
      return { item_id: input.item_id, model_id: model.id, quantity: input.quantity,
        price: resolveModelPrice(model).currentPrice, item_name: model.item.name, model_name: modelName(model.item, model.tierIndex) };
    });
    if (cart.length + lines.filter((line) => !cart.some((entry) => entry.modelId === line.model_id)).length > 200) throw invalidState('Cart is full');
    const first = lines[0]!;
    const summary = {
      title: 'Sẵn sàng thêm vào giỏ hàng / Ready to add to cart',
      lines: [ ...(lines.length === 1 ? [
        { label: 'Sản phẩm / Item', value: first.item_name },
        { label: 'Phân loại / Variant', value: first.model_name || 'Mặc định / Default' },
        { label: 'Số lượng / Quantity', value: String(first.quantity) },
        { label: 'Đơn giá / Unit price', value: String(first.price) },
      ] : lines.map((line) => ({ label: line.item_name, value: `${line.model_name || 'Mặc định / Default'} × ${line.quantity} @ ${line.price} VND` }))),
        { label: 'Mã giảm giá / Voucher', value: 'Không có / None' },
      ],
      total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
    };
    const action = await this.prisma.pendingAction.create({
      data: {
        ...actionScope(ctx),
        type: 'ADD_TO_CART',
        payload: { lines },
        summary,
        requiresTap: false,
        expiresAt: new Date(Date.now() + 300000),
      },
    });
    return this.emit(action, replaces);
  }
  async prepareUpdate(
    ctx: { conversationId: string; buyerId: number; shopId: number },
    input: { model_id: number; quantity?: number; new_model_id?: number },
    replaces?: string,
  ) {
    const line = await this.prisma.cartItem.findFirst({
      where: { userId: ctx.buyerId, modelId: input.model_id, model: { item: { shopId: ctx.shopId } } },
      include: { model: true },
    });
    if (!line) throw notFound('Cart item');
    const model = await this.prisma.model.findFirst({
      where: {
        id: input.new_model_id ?? input.model_id,
        itemId: line.model.itemId,
        status: 'MODEL_NORMAL',
        item: { shopId: ctx.shopId, status: 'NORMAL', shop: { status: 'NORMAL', holidayMode: false } },
      },
      include: { item: true, discountModels: { include: { discount: true } } },
    });
    if (!model || model.isDefault === model.item.hasModel) throw notFound('Product variation');
    const quantity = input.quantity ?? line.quantity;
    if (quantity > model.stock) throw invalidState('Requested quantity is unavailable');
    const price = resolveModelPrice(model).currentPrice;
    const summary = {
      title: 'Cập nhật giỏ hàng / Update cart',
      lines: [
        { label: 'Sản phẩm / Item', value: model.item.name },
        { label: 'Phân loại / Variant', value: modelName(model.item, model.tierIndex) || 'Mặc định / Default' },
        { label: 'Số lượng / Quantity', value: String(quantity) },
        { label: 'Đơn giá / Unit price', value: String(price) },
        { label: 'Mã giảm giá / Voucher', value: 'Không có / None' },
      ],
      total: price * quantity,
    };
    const action = await this.prisma.pendingAction.create({
      data: {
        ...actionScope(ctx),
        type: 'UPDATE_CART_ITEM',
        payload: {
          model_id: line.modelId,
          new_model_id: model.id,
          item_id: model.itemId,
          quantity,
          price,
          item_name: model.item.name,
          model_name: modelName(model.item, model.tierIndex),
          previous_quantity: line.quantity,
        },
        summary,
        requiresTap: false,
        expiresAt: new Date(Date.now() + 300000),
      },
    });
    return this.emit(action, replaces);
  }
  async prepareOrder(
    ctx: { conversationId: string; buyerId: number; shopId: number },
    input: { voucher_code?: string; address_id?: number; payment_method?: PaymentMethod },
    replaces?: string,
  ) {
    const lines = await this.prisma.cartItem.findMany({
      where: { userId: ctx.buyerId, model: { item: { shopId: ctx.shopId } } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!lines.length) throw invalidState('The shop cart is empty');
    const address = await this.prisma.buyerAddress.findFirst({
      where: { userId: ctx.buyerId, deletedAt: null, ...(input.address_id ? { id: input.address_id } : { isDefault: true }) },
      select: { id: true, name: true, phone: true, region: true, state: true, city: true, district: true, town: true, address: true, zipcode: true },
    });
    if (!address) throw notFound('Delivery address');
    const checkout: CheckoutInput = {
      address_id: address.id,
      payment_method: input.payment_method ?? 'COD',
      cart_item_ids: lines.map((line) => line.id),
      shops: [{ shop_id: ctx.shopId, ...(input.voucher_code ? { voucher_code: input.voucher_code } : {}) }],
    };
    const quote = await this.orders.quote(ctx.buyerId, checkout);
    if (!quote.can_checkout || quote.groups.length !== 1 || quote.groups[0]?.shop_id !== ctx.shopId)
      throw invalidState(quote.issues.join('; ') || 'Checkout is unavailable');
    const snapshot = assistantQuoteSnapshot(quote, address);
    const snapshotHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const group = snapshot.groups[0]!;
    const quoted = quote.groups[0]!;
    const channel = quoted.shipping_options.find((option) => option.logistics_channel_id === quoted.logistics_channel_id);
    const summary = {
      title: 'Đặt hàng / Place order',
      lines: [
        ...group.lines.map((line) => ({
          label: line.item_name,
          value: `${line.model_name ? `${line.model_name} ` : ''}× ${line.quantity} @ ${line.unit_price} VND`,
        })),
        { label: 'Mã giảm giá / Voucher', value: group.voucher?.code ?? 'Không có / None' },
        ...(channel
          ? [
              {
                label: 'Vận chuyển / Shipping',
                value: `${channel.logistics_channel_name} · ${channel.estimated_delivery_days_min}–${channel.estimated_delivery_days_max} ngày (ước tính) / days (estimated)`,
              },
            ]
          : []),
        {
          label: 'Địa chỉ / Address',
          value: [address.name, address.phone, address.address, address.town, address.district, address.city, address.state]
            .filter(Boolean)
            .join(', '),
        },
        { label: 'Thanh toán / Payment', value: checkout.payment_method },
        { label: 'Tiền hàng / Items subtotal', value: String(snapshot.totals.items_subtotal) },
        { label: 'Phí vận chuyển / Shipping fee', value: String(group.shipping_fee) },
        { label: 'Giảm phí vận chuyển / Shipping discount', value: String(group.shipping_discount) },
        { label: 'Giảm giá / Voucher discount', value: String(group.voucher?.discount ?? 0) },
      ],
      total: group.total,
    };
    const action = await this.prisma.pendingAction.create({
      data: {
        ...actionScope(ctx),
        type: 'PLACE_ORDER',
        payload: { checkout: checkout as unknown as Prisma.InputJsonValue, snapshotHash },
        summary,
        requiresTap: true,
        expiresAt: new Date(Date.now() + 300000),
      },
    });
    return this.emit(action, replaces);
  }
  async prepareReturn(ctx: { conversationId: string; buyerId: number; shopId: number }, input: CreateReturnInput, replaces?: string) {
    const selection = await this.prisma.returnEvidenceSelection.findUnique({ where: { conversationId: ctx.conversationId } });
    input = { ...input, evidence_ids: input.evidence_ids ?? (selection?.orderSn === input.order_sn ? selection.evidenceIds : []) };
    const { order, lines, refund, evidence } = await this.returns.preview(ctx.buyerId, input);
    if (order.shopId !== ctx.shopId) throw notFound('Order');
    const snapshot = returnSnapshot(lines, refund, evidence);
    const snapshotHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const summary = {
      title: 'Yêu cầu trả hàng / Open return',
      lines: [
        { label: 'Đơn hàng / Order', value: input.order_sn },
        ...snapshot.lines.map((line) => ({
          label: line.name,
          value: `${line.variant ? `${line.variant} ` : ''}× ${line.quantity} @ ${line.price} VND`,
        })),
        { label: 'Lý do / Reason', value: RETURN_REASON_LABELS[input.reason] ?? input.reason },
        { label: 'Phương án / Solution', value: input.solution === 'REFUND_ONLY' ? 'Chỉ hoàn tiền / Refund only' : 'Trả hàng và hoàn tiền / Return and refund' },
        { label: 'Ghi chú / Notes', value: input.text_reason || 'Không có / None', verbatim: !!input.text_reason },
        { label: 'Ảnh bằng chứng / Evidence photos', value: String(evidence.length) },
        { label: 'Xét duyệt / Decision', value: 'Người bán xem xét; chưa được duyệt / Seller review required; not approved' },
        { label: 'Mã giảm giá / Voucher', value: order.voucherCode ?? 'Không có / None' },
      ],
      total: refund,
      evidence: { order_sn: input.order_sn, evidence_ids: evidence.map((row) => row.id) },
    };
    const action = await this.prisma.pendingAction.create({
      data: {
        ...actionScope(ctx),
        type: 'OPEN_RETURN',
        payload: { input: input as unknown as Prisma.InputJsonValue, snapshotHash },
        summary,
        requiresTap: true,
        expiresAt: new Date(Date.now() + 300000),
      },
    });
    return this.emit(action, replaces);
  }
  async prepareReturnChange(ctx: { conversationId: string; buyerId: number; shopId: number }, returnSn: string, type: 'CANCEL_RETURN' | 'ACCEPT_RETURN_OFFER') {
    const ret = await this.returns.buyerActionPreview(ctx.buyerId, ctx.shopId, returnSn, type);
    const view = this.returns.presentForBuyer(ret);
    if (type === 'ACCEPT_RETURN_OFFER' && !view.seller_offer) throw invalidState('The seller offer has expired');
    const summary = {
      title: type === 'CANCEL_RETURN' ? 'Hủy yêu cầu hoàn tiền / Cancel refund request' : 'Chấp nhận đề nghị hoàn tiền / Accept seller refund offer',
      lines: [
        { label: 'Yêu cầu / Request', value: ret.returnSn }, { label: 'Đơn hàng / Order', value: ret.orderSn },
        ...(type === 'CANCEL_RETURN' ? [{ label: 'Trạng thái đơn sau khi hủy / Order state after cancellation', value: ret.orderStatusBeforeReturn === 'TO_CONFIRM_RECEIVE' ? 'Chờ xác nhận đã nhận / Awaiting receipt confirmation' : 'Hoàn thành / Completed' }]
          : [{ label: 'Phương án / Solution', value: view.seller_offer?.solution === 'refund' ? 'Chỉ hoàn tiền / Refund only' : 'Trả hàng và hoàn tiền / Return and refund' }, { label: 'Hoàn tiền / Refund', value: String(view.seller_offer!.amount) }]),
        ...(type === 'CANCEL_RETURN' && view.seller_offer ? [{ label: 'Đề nghị của shop / Seller offer', value: 'Đề nghị hiện tại sẽ bị hủy / The current offer will be forfeited' }] : []),
        ...(type === 'CANCEL_RETURN' && (ret.evidence?.length ?? 0) > 0 ? [{ label: 'Ảnh đã gửi / Submitted photos', value: 'Người bán vẫn xem được sau khi hủy / Remain available to the seller after cancellation' }] : []),
        ...(type === 'ACCEPT_RETURN_OFFER' ? [{ label: 'Hạn đề nghị (UTC) / Offer deadline (UTC)', value: new Date(view.seller_offer!.due_date * 1000).toISOString() }] : []),
      ],
      ...(type === 'ACCEPT_RETURN_OFFER' ? { total: view.seller_offer!.amount } : {}),
    };
    return this.emit(await this.prisma.pendingAction.create({ data: { ...actionScope(ctx), type, payload: { return_sn: returnSn, snapshotHash: returnStateHash(ret) }, summary, requiresTap: true, expiresAt: new Date(Date.now() + 300000) } }));
  }
  async editOptions(id: string, buyerId: number) {
    const action = await this.prisma.pendingAction.findFirst({ where: { id, buyerId, status: 'PENDING', expiresAt: { gt: new Date() }, type: { in: ['ADD_TO_CART', 'UPDATE_CART_ITEM', 'OPEN_RETURN', 'PLACE_ORDER'] } } });
    if (!action) throw notFound('Pending action');
    if (action.type === 'PLACE_ORDER') {
      const { checkout } = action.payload as unknown as { checkout: CheckoutInput & { cart_item_ids: number[] } };
      const cart = await this.prisma.cartItem.findMany({
        where: { id: { in: checkout.cart_item_ids }, userId: buyerId, model: { item: { shopId: action.shopId } } },
        include: { model: { include: { item: { include: { models: { where: { status: 'MODEL_NORMAL' }, orderBy: { id: 'asc' } } } } } } },
      });
      const lines = checkout.cart_item_ids.map((cartItemId, index) => {
        const line = cart.find((entry) => entry.id === cartItemId);
        if (!line) throw invalidState('Cart changed; ask for a new order summary');
        const item = line.model.item;
        return { line_index: index, name: item.name, quantity: line.quantity, model_id: line.modelId,
          models: item.models.filter((model) => model.isDefault !== item.hasModel).map((model) => ({ model_id: model.id, name: modelName(item, model.tierIndex) || 'Default', stock: model.stock })) };
      });
      return { ...lines[0]!, lines };
    }
    if (action.type === 'OPEN_RETURN') {
      const payload = action.payload as unknown as { input: CreateReturnInput };
      const order = await this.prisma.order.findFirst({ where: { orderSn: payload.input.order_sn, buyerId, shopId: action.shopId }, include: { items: true } });
      if (!order || !payload.input.items?.length) throw notFound('Return items');
      const lines = payload.input.items.map((line, index) => {
        const purchased = order.items.find((item) => item.itemId === line.item_id && (line.model_id === 0 ? item.isDefaultModel : item.modelId === line.model_id));
        if (!purchased) throw notFound('Order item');
        return { line_index: index, name: purchased.itemName, quantity: line.quantity, model_id: line.model_id,
          models: order.items.filter((item) => item.itemId === line.item_id).map((item) => ({ model_id: item.isDefaultModel ? 0 : item.modelId, name: item.modelName || 'Default', stock: item.quantity })) };
      });
      return { ...lines[0]!, lines };
    }
    if (action.type === 'ADD_TO_CART') {
      const lines = await Promise.all(cartAddLines(action.payload).map(async (line, index) => {
        const models = await this.prisma.model.findMany({
          where: { itemId: line.item_id, status: 'MODEL_NORMAL', item: { shopId: action.shopId, status: 'NORMAL', shop: { status: 'NORMAL', holidayMode: false } } },
          include: { item: true }, orderBy: { id: 'asc' },
        });
        return { line_index: index, name: models[0]?.item.name ?? '', quantity: line.quantity, model_id: line.model_id,
          models: models.filter((model) => model.isDefault !== model.item.hasModel).map((model) => ({ model_id: model.id, name: modelName(model.item, model.tierIndex) || 'Default', stock: model.stock })) };
      }));
      return { ...lines[0]!, lines };
    }
    const payload = action.payload as { item_id: number; model_id: number; new_model_id?: number; quantity: number };
    const models = await this.prisma.model.findMany({
      where: { itemId: payload.item_id, status: 'MODEL_NORMAL', item: { shopId: action.shopId, status: 'NORMAL', shop: { status: 'NORMAL', holidayMode: false } } },
      include: { item: true }, orderBy: { id: 'asc' },
    });
    const line = { line_index: 0, name: models[0]?.item.name ?? '', quantity: payload.quantity, model_id: payload.new_model_id ?? payload.model_id,
      models: models.filter((model) => model.isDefault !== model.item.hasModel).map((model) => ({ model_id: model.id, name: modelName(model.item, model.tierIndex) || 'Default', stock: model.stock })) };
    return { ...line, lines: [line] };
  }
  async edit(id: string, buyerId: number, input: { quantity?: number; model_id?: number; line_index?: number; evidence_ids?: string[] }) {
    const action = await this.prisma.pendingAction.findFirst({ where: { id, buyerId, status: 'PENDING', expiresAt: { gt: new Date() }, type: { in: ['ADD_TO_CART', 'UPDATE_CART_ITEM', 'OPEN_RETURN', 'PLACE_ORDER'] }, conversation: { status: 'ACTIVE' } } });
    if (!action) throw notFound('Pending action');
    const photoOnly = input.evidence_ids !== undefined && input.quantity === undefined && input.model_id === undefined;
    if ((photoOnly && action.type !== 'OPEN_RETURN') || (!photoOnly && (input.quantity === undefined || input.model_id === undefined))) throw invalidState('Choose a valid action edit');
    const options = await this.editOptions(id, buyerId);
    const selected = options.lines.find((line) => line.line_index === (input.line_index ?? 0));
    if (!selected || (!photoOnly && !selected.models.some((model) => model.model_id === input.model_id))) throw notFound('Product variation');
    const quantity = input.quantity ?? selected.quantity, modelId = input.model_id ?? selected.model_id;
    let updatedReturn: CreateReturnInput | undefined;
    if (action.type === 'OPEN_RETURN') {
      const original = (action.payload as unknown as { input: CreateReturnInput }).input;
      const items = original.items!.map((line, index) => index === selected.line_index ? { ...line, model_id: modelId, quantity } : line);
      if (new Set(items.map((line) => `${line.item_id}:${line.model_id}`)).size !== items.length) throw invalidState('The same item cannot be returned twice');
      updatedReturn = { ...original, items, ...(input.evidence_ids !== undefined ? { evidence_ids: input.evidence_ids } : {}) };
      const preview = await this.returns.preview(buyerId, updatedReturn);
      if (preview.order.shopId !== action.shopId) throw notFound('Order');
    }
    // Invalidate old consent atomically before issuing a new action. A concurrent confirm wins or loses, never both.
    const cancelled = await this.prisma.pendingAction.updateMany({ where: { id, buyerId, status: 'PENDING', expiresAt: { gt: new Date() } }, data: { status: 'CANCELLED' } });
    if (!cancelled.count) throw invalidState('Action is no longer pending');
    this.emit(await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } }), undefined, 'edit');
    const ctx = { conversationId: action.conversationId, buyerId, shopId: action.shopId };
    if (action.type === 'PLACE_ORDER') {
      // The buyer edits their own cart line on screen, like on the cart page; the order still needs a fresh tap.
      const { checkout } = action.payload as unknown as { checkout: CheckoutInput & { cart_item_ids: number[] } };
      await this.prisma.$transaction(
        async (tx) => {
          const line = await tx.cartItem.findFirst({ where: { id: checkout.cart_item_ids[selected.line_index], userId: buyerId } });
          if (!line) throw invalidState('Cart changed; ask for a new order summary');
          const model = await tx.model.findUniqueOrThrow({ where: { id: modelId } });
          if (quantity > Math.min(model.stock, 999)) throw invalidState('Requested quantity is unavailable');
          if (model.id !== line.modelId && (await tx.cartItem.findUnique({ where: { userId_modelId: { userId: buyerId, modelId: model.id } } })))
            throw invalidState('Target variant already exists in cart; please update it separately');
          await tx.cartItem.update({ where: { id: line.id }, data: { modelId: model.id, quantity: quantity } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      const voucher = checkout.shops?.[0]?.voucher_code;
      return this.prepareOrder(ctx, { address_id: checkout.address_id, payment_method: checkout.payment_method, ...(voucher ? { voucher_code: voucher } : {}) }, id);
    }
    if (updatedReturn) {
      if (input.evidence_ids !== undefined) await this.prisma.returnEvidenceSelection.upsert({ where: { conversationId: ctx.conversationId }, create: { conversationId: ctx.conversationId, orderSn: updatedReturn.order_sn, evidenceIds: input.evidence_ids }, update: { orderSn: updatedReturn.order_sn, evidenceIds: input.evidence_ids } });
      return this.prepareReturn(ctx, updatedReturn, id);
    }
    if (action.type === 'ADD_TO_CART') {
      const lines = cartAddLines(action.payload).map((line, index) => ({ item_id: line.item_id, model_id: index === selected.line_index ? modelId : line.model_id, quantity: index === selected.line_index ? quantity : line.quantity }));
      return this.prepareAdds(ctx, lines, id);
    }
    const payload = action.payload as { item_id: number; model_id: number };
    return this.prepareUpdate(ctx, { model_id: payload.model_id, new_model_id: modelId, quantity: quantity }, id);
  }
  async cancel(id: string, buyerId: number, initiatedBy: 'agent' | 'buyer' = 'buyer') {
    const action = await this.prisma.pendingAction.findFirst({ where: { id, buyerId } });
    if (!action) throw notFound('Action');
    if (action.status !== 'PENDING') throw invalidState('Action is no longer pending');
    if (action.expiresAt <= new Date()) {
      const expired = await this.prisma.pendingAction.updateMany({ where: { id, buyerId, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      if (expired.count) this.emit(await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } }));
      throw invalidState('Action expired');
    }
    const changed = await this.prisma.pendingAction.updateMany({ where: { id, buyerId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (!changed.count) throw invalidState('Action is no longer pending');
    return this.emit(await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } }), undefined, initiatedBy);
  }
  async confirm(id: string, buyerId: number, conversationId: string | undefined, tap: boolean, confirmationKey?: string) {
    const existing = await this.prisma.pendingAction.findFirst({ where: { id, buyerId, ...(conversationId ? { conversationId } : {}) } });
    if (!existing) throw notFound('Action');
    if (existing.status === 'EXECUTED') {
      if (existing.idempotencyKey && existing.idempotencyKey !== confirmationKey) throw invalidState('Confirmation key does not match');
      return this.view(existing);
    }
    if (existing.status !== 'PENDING') throw invalidState('Action is no longer pending');
    if (existing.expiresAt <= new Date()) {
      const expired = await this.prisma.pendingAction.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      if (expired.count) this.emit(await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } }));
      throw invalidState('Action expired');
    }
    if (existing.requiresTap && !tap) throw invalidState('Ask the buyer to tap the confirmation card');
    if (!existing.requiresTap && tap) throw invalidState('Cart changes require spoken confirmation');
    try {
      if (existing.type === 'PLACE_ORDER') {
        if (!confirmationKey) throw invalidState('Confirmation key is required');
        const payload = existing.payload as unknown as { checkout: CheckoutInput; snapshotHash: string };
        try {
          await this.orders.checkout(buyerId, payload.checkout, `assistant:${existing.id}`, {
            actionId: existing.id,
            shopId: existing.shopId,
            snapshotHash: payload.snapshotHash,
            confirmationKey,
          });
        } catch (error) {
          const latest = await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } });
          if (latest.status !== 'EXECUTED' || latest.idempotencyKey !== confirmationKey) throw error;
        }
        const completed = await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } });
        if (completed.idempotencyKey !== confirmationKey) throw invalidState('Confirmation key does not match');
        return this.emit(completed);
      }
      if (existing.type === 'OPEN_RETURN') {
        if (!confirmationKey) throw invalidState('Confirmation key is required');
        const payload = existing.payload as unknown as { input: CreateReturnInput; snapshotHash: string };
        try {
          await this.returns.create(buyerId, payload.input, {
            actionId: existing.id,
            shopId: existing.shopId,
            snapshotHash: payload.snapshotHash,
            conversationId: existing.conversationId,
            confirmationKey,
          });
        } catch (error) {
          const latest = await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } });
          if (latest.status !== 'EXECUTED' || latest.idempotencyKey !== confirmationKey) throw error;
        }
        return this.emit(await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } }));
      }
      if (existing.type === 'CANCEL_RETURN' || existing.type === 'ACCEPT_RETURN_OFFER') {
        if (!confirmationKey) throw invalidState('Confirmation key is required');
        const payload = existing.payload as { return_sn: string; snapshotHash: string };
        try {
          await this.returns.confirmBuyerAction(buyerId, payload.return_sn, existing.type, { actionId: id, shopId: existing.shopId, confirmationKey, snapshotHash: payload.snapshotHash });
        } catch (error) {
          const latest = await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } });
          if (latest.status !== 'EXECUTED' || latest.idempotencyKey !== confirmationKey) throw error;
        }
        return this.emit(await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } }));
      }
      if (existing.type !== 'ADD_TO_CART' && existing.type !== 'UPDATE_CART_ITEM') throw invalidState('Action type is unavailable');
      const inputs = existing.type === 'ADD_TO_CART' ? cartAddLines(existing.payload) : [existing.payload as unknown as CartAddSnapshot];
      const action = await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.pendingAction.updateMany({
            where: { id, buyerId, status: 'PENDING', expiresAt: { gt: new Date() } },
            data: { status: 'EXECUTED', result: { message: existing.type === 'ADD_TO_CART' ? 'Added to cart' : 'Cart updated' } },
          });
          if (!locked.count) throw invalidState('Action is no longer pending');
          for (const input of inputs) {
            const model = await tx.model.findFirst({
              where: {
                id: input.new_model_id ?? input.model_id,
                itemId: input.item_id,
                status: 'MODEL_NORMAL',
                item: { shopId: existing.shopId, status: 'NORMAL', shop: { status: 'NORMAL', holidayMode: false } },
              },
              include: { item: true, discountModels: { include: { discount: true } } },
            });
            if (
              !model ||
              model.isDefault === model.item.hasModel ||
              resolveModelPrice(model).currentPrice !== input.price ||
              model.item.name !== input.item_name ||
              modelName(model.item, model.tierIndex) !== input.model_name
            )
              throw invalidState('Product or price changed; please confirm again');
            const line = await tx.cartItem.findUnique({ where: { userId_modelId: { userId: buyerId, modelId: model.id } } });
            if (existing.type === 'UPDATE_CART_ITEM') {
              const original = await tx.cartItem.findUnique({ where: { userId_modelId: { userId: buyerId, modelId: input.model_id } } });
              if (!original || original.quantity !== input.previous_quantity) throw invalidState('Cart item changed; please confirm again');
              if (model.id !== input.model_id && line) throw invalidState('Target variant already exists in cart; please update it separately');
              if (input.quantity > model.stock) throw invalidState('Requested quantity is unavailable');
              await tx.cartItem.update({ where: { id: original.id }, data: { modelId: model.id, quantity: input.quantity } });
              return tx.pendingAction.findUniqueOrThrow({ where: { id } });
            }
            const quantity = (line?.quantity ?? 0) + input.quantity;
            if (quantity > Math.min(model.stock, 999)) throw invalidState('Requested quantity is unavailable');
            if (!line && (await tx.cartItem.count({ where: { userId: buyerId } })) >= 200) throw invalidState('Cart is full');
            await tx.cartItem.upsert({
              where: { userId_modelId: { userId: buyerId, modelId: model.id } },
              create: { userId: buyerId, modelId: model.id, quantity },
              update: { quantity },
            });
          }
          return tx.pendingAction.findUniqueOrThrow({ where: { id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.emit(action);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'CONFLICT') throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new DomainError('CONFLICT', 'Confirmation key was already used');
      const latest = await this.prisma.pendingAction.findFirst({ where: { id, buyerId, status: 'PENDING' } });
      if (latest) {
        const changed = await this.prisma.pendingAction.updateMany({
          where: { id, buyerId, status: 'PENDING' },
          data: { status: latest.expiresAt <= new Date() ? 'EXPIRED' : 'FAILED' },
        });
        if (changed.count) this.emit(await this.prisma.pendingAction.findUniqueOrThrow({ where: { id } }));
      }
      throw error;
    }
  }
}
