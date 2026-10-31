import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { DomainError } from '../../common/errors';
import { ActionsService } from '../actions.service';
import { RETURN_REASONS } from '../../domain/return.service';
import { LogisticsService } from '../../domain/logistics.service';
import { PAYMENT_METHODS } from '../../domain/order.service';
import { purchaseIssue } from '../../domain/purchase-availability';
import { VoucherService, VOUCHER_PRODUCT } from '../../domain/voucher.service';
import { toNumber } from '../../common/money';
import { PrismaService } from '../../common/prisma.service';
import { CatalogService, itemInclude, mediaUrl, modelImage, modelName, resolveModelPrice, sellableModels, tierVariations, type ItemWithRelations } from '../../domain/catalog.service';
import type { AssistantCard } from '../types';
import { maskName } from '../../compat/ops/product.ops';

export interface ToolContext {
  conversationId: string;
  buyerId: number;
  shopId: number;
  /** Verified page context, supplied by the runtime rather than the model. */
  viewedItemId?: number | null;
}
export interface ToolOutput {
  text: string;
  card?: AssistantCard;
  success: boolean;
  validation_miss?: { attribute: string; value: string };
  out_of_stock?: boolean;
  response_language?: 'vi' | 'en';
}

function ctxScope({ conversationId, buyerId, shopId }: ToolContext) {
  return { conversationId, buyerId, shopId };
}

const quantity = z.number().int().min(1).max(999);
const quantityProperty = { type: 'integer', minimum: 1, maximum: 999 };
const requestedAttributes = z.record(z.string().trim().min(1).max(100)).optional();
const requestedAttributesProperty = { type: 'object', additionalProperties: { type: 'string', minLength: 1, maxLength: 100 }, description: 'Exact tier names and option values from get_product_details or get_viewed_product. Translate the buyer request using those choices; ask for clarification when uncertain. No fuzzy matching is performed.' };

/** A partial request may leave several sizes; show a color only when their images agree. */
function requestedProductImage(item: ItemWithRelations, requested?: Record<string, string>): string | null {
  if (!requested || !Object.keys(requested).length) return modelImage(item);
  const matching = sellableModels(item).filter((model) => Object.entries(requested).every(([attribute, value]) =>
    tierVariations(item).some((tier, index) =>
      attribute === tier.name && tier.option_list?.[model.tierIndex[index] ?? -1]?.option === value,
    ),
  ));
  const images = new Set(matching.map((model) => modelImage(item, model.tierIndex)));
  return images.size === 1 ? images.values().next().value ?? null : modelImage(item);
}
type VariantMatch = { validation_miss?: { attribute: string; value: string }; variants?: 'default_only'; out_of_stock?: boolean };
function variantMatch(items: ItemWithRelations[], requested: Record<string, string>): VariantMatch {
  let matches = items.flatMap((item) => sellableModels(item).map((model) => ({ item, model })));
  for (const [attribute, value] of Object.entries(requested)) {
    matches = matches.filter(({ item, model }) => tierVariations(item).some((tier, i) =>
      attribute === tier.name && tier.option_list?.[model.tierIndex[i] ?? -1]?.option === value,
    ));
    if (!matches.length) {
      const defaultOnly = items.every((item) => !tierVariations(item).length);
      return { validation_miss: { attribute, value }, ...(defaultOnly ? { variants: 'default_only' as const } : {}) };
    }
  }
  if (Object.keys(requested).length && matches.every(({ model }) => model.status !== 'MODEL_NORMAL' || model.stock <= 0)) return { out_of_stock: true };
  return {};
}

const spokenSkip = new Set(['Địa chỉ', 'Address']);
function readback(summary: { title: string; lines: { label: string; value: string }[]; total?: number }, lang: 0 | 1): string {
  const pick = (text: string) => { const parts = text.split(' / '); return (parts[lang] ?? parts[0]!).trim(); };
  const lines = summary.lines
    .filter((line) => !spokenSkip.has(pick(line.label)))
    .map((line) => {
      const value = (line.value.includes(' / ') ? pick(line.value) : line.value).replace(
        /×\s*(\d+)\s*@\s*(\d+)\s*VND/,
        lang ? 'quantity $1, unit price $2 VND' : 'số lượng $1, đơn giá $2 VND',
      );
      return `${pick(line.label)}: ${value}`;
    });
  const total = summary.total === undefined ? '' : ` ${lang ? 'Total' : 'Tổng cộng'}: ${summary.total} VND.`;
  return `${pick(summary.title)}. ${lines.join('; ')}.${total}`;
}
export function actionText(action: { action_id: string; summary: unknown }): string {
  const summary = action.summary as Parameters<typeof readback>[0];
  return [
    `Action ID (do not read aloud): ${action.action_id}`,
    `Say this read-back word for word in the buyer's language before asking for confirmation.`,
    `readback_vi: ${readback(summary, 0)}`,
    `readback_en: ${readback(summary, 1)}`,
  ].join('\n');
}

const definitions = {
  set_response_language: {
    schema: z.object({ language: z.enum(['vi', 'en']) }).strict(),
    properties: { language: { type: 'string', enum: ['vi', 'en'] } },
    required: ['language'],
  },
  check_voucher: {
    schema: z.object({
      voucher_code: z.string().trim().min(1).max(20),
      lines: z.array(z.object({ item_id: z.number().int(), model_id: z.number().int(), quantity }).strict()).min(1).max(50)
        .refine((lines) => new Set(lines.map((line) => line.model_id)).size === lines.length).optional(),
    }).strict(),
    properties: {
      voucher_code: { type: 'string', description: 'Exact code returned by get_vouchers; never a phonetic guess.' },
      lines: {
        type: 'array', minItems: 1, maxItems: 50,
        description: 'Exact product and variant IDs plus quantities for a proposed basket. Omit to evaluate the current shop cart.',
        items: { type: 'object', properties: { item_id: { type: 'integer' }, model_id: { type: 'integer' }, quantity: quantityProperty }, required: ['item_id', 'model_id', 'quantity'], additionalProperties: false },
      },
    },
    required: ['voucher_code'],
  },
  search_products: {
    schema: z
      .object({
        query: z.string(),
        min_price: z.number().min(0).optional(),
        max_price: z.number().min(0).optional(),
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .strict(),
    properties: {
      query: { type: 'string' },
      min_price: { type: 'number', minimum: 0 },
      max_price: { type: 'number', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      offset: { type: 'integer', minimum: 0 },
    },
    required: ['query'],
  },
  get_viewed_product: {
    schema: z.object({ requested_attributes: requestedAttributes }).strict(),
    properties: { requested_attributes: requestedAttributesProperty },
    required: [],
  },
  get_product_details: {
    schema: z.object({ item_id: z.number().int(), requested_attributes: requestedAttributes }).strict(),
    properties: { item_id: { type: 'integer' }, requested_attributes: requestedAttributesProperty },
    required: ['item_id'],
  },
  get_shop_faqs: { schema: z.object({ query: z.string().optional() }).strict(), properties: { query: { type: 'string' } }, required: [] },
  get_return_policy: { schema: z.object({}).strict(), properties: {}, required: [] },
  get_shipping_info: {
    schema: z.object({ item_id: z.number().int().optional() }).strict(),
    properties: { item_id: { type: 'integer' } },
    required: [],
  },
  compare_products: {
    schema: z
      .object({ item_ids: z.array(z.number().int()).min(2).max(4) })
      .strict()
      .refine((v) => new Set(v.item_ids).size === v.item_ids.length),
    properties: { item_ids: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 4, uniqueItems: true } },
    required: ['item_ids'],
  },
  get_cart: { schema: z.object({}).strict(), properties: {}, required: [] },
  add_to_cart: {
    schema: z.object({ item_id: z.number().int(), model_id: z.number().int(), quantity: quantity, requested_attributes: requestedAttributes }).strict(),
    properties: { item_id: { type: 'integer' }, model_id: { type: 'integer' }, quantity: quantityProperty, requested_attributes: requestedAttributesProperty },
    required: ['item_id', 'model_id', 'quantity'],
  },
  update_cart_item: {
    schema: z
      .object({ model_id: z.number().int(), quantity: quantity.optional(), new_model_id: z.number().int().optional() })
      .strict()
      .refine((v) => v.quantity !== undefined || v.new_model_id !== undefined),
    properties: { model_id: { type: 'integer' }, quantity: quantityProperty, new_model_id: { type: 'integer' } },
    required: ['model_id'],
  },
  place_order: {
    schema: z
      .object({
        voucher_code: z.string().min(1).max(20).optional(),
        address_id: z.number().int().positive().optional(),
        payment_method: z.enum(PAYMENT_METHODS).optional(),
      })
      .strict(),
    properties: { voucher_code: { type: 'string' }, address_id: { type: 'integer' }, payment_method: { type: 'string', enum: PAYMENT_METHODS } },
    required: [],
  },
  open_return: {
    schema: z
      .object({
        order_sn: z.string().min(1),
        items: z.array(z.object({ item_id: z.number().int(), model_id: z.number().int(), quantity: quantity }).strict()).min(1),
        reason: z.enum(RETURN_REASONS),
        solution: z.enum(['RETURN_REFUND', 'REFUND_ONLY']),
      })
      .strict()
      .refine((value) => new Set(value.items.map((item) => `${item.item_id}:${item.model_id}`)).size === value.items.length),
    properties: {
      order_sn: { type: 'string' },
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: { item_id: { type: 'integer' }, model_id: { type: 'integer' }, quantity: quantityProperty },
          required: ['item_id', 'model_id', 'quantity'],
          additionalProperties: false,
        },
      },
      reason: { type: 'string', enum: RETURN_REASONS },
      solution: { type: 'string', enum: ['RETURN_REFUND', 'REFUND_ONLY'] },
    },
    required: ['order_sn', 'items', 'reason', 'solution'],
  },
  confirm_action: {
    schema: z.object({ action_id: z.string().uuid() }).strict(),
    properties: { action_id: { type: 'string', description: 'Exact pending cart action being confirmed; do not read aloud. A yes to a different question is not consent.' } },
    required: ['action_id'],
  },
  cancel_action: {
    schema: z.object({ action_id: z.string().uuid() }).strict(),
    properties: { action_id: { type: 'string', description: 'Exact pending action to cancel before preparing a revision.' } },
    required: ['action_id'],
  },
  handoff_to_seller: {
    schema: z.object({ question: z.string().trim().min(1).max(2000), reason: z.string().trim().min(1).max(1000) }).strict(),
    properties: { question: { type: 'string' }, reason: { type: 'string' } },
    required: ['question', 'reason'],
  },
  get_order_status: { schema: z.object({ order_sn: z.string().optional() }).strict(), properties: { order_sn: { type: 'string' } }, required: [] },
  get_vouchers: { schema: z.object({}).strict(), properties: {}, required: [] },
} as const;
const descriptions: Record<string, string> = {
  set_response_language: 'Set Vietnamese or English for app-authored readbacks and action outcomes when the buyer changes language. Interpret their language yourself; the server does not guess it from keywords.',
  cancel_action: 'Cancel an exact pending action in this conversation. Use when the buyer withdraws or revises it; then prepare and read back a replacement before asking for fresh confirmation.',
  check_voucher: 'Read-only voucher eligibility for an exact proposed basket or the current shop cart. Returns live prices, covered items, eligible subtotal, minimum-spend shortfall, discount and reason, using checkout rules. Call before claiming that a voucher applies. This does not apply the voucher or place an order; checkout revalidates.',
  get_viewed_product: 'Read the product the buyer is currently viewing in this shop, with fresh details and a product card. Check every time the buyer refers to this product, this item or the product on screen; the buyer may navigate between turns. Returns no product when they leave its page.',
  search_products: 'Find public products in this shop by literal words across product name, brand and persisted category names (Vietnamese or English), plus optional price range. An empty query lists the catalog (default 50, stable order); total and has_more indicate remaining pages. Results are candidates, not an automatic interpretation of speech. Try a shorter keyword or list the catalog when unsure, then clarify with the buyer.',
  get_product_details: 'Get public product details, exact tier names/options, and each variant ID, attributes, live price and stock. Use these choices to interpret the buyer request; requested_attributes must use those exact strings.',
  compare_products: 'Compare two to four public products from this shop.',
  get_vouchers: 'List currently public, unexpired shop vouchers that this buyer has not used; eligibility rules still apply.',
  get_shipping_info: 'Get the shop shipping policy and, when a product is specified, its eligible channels and fees.',
  get_return_policy: 'Get the persisted shop return policy.',
  get_shop_faqs: 'Search enabled seller-written FAQs for this shop. Returns the FAQs sharing the most words with the query first, or every FAQ when none match.',
  get_cart: 'Get this buyer’s cart for this shop with calculated totals.',
  get_order_status: 'Get this buyer’s own order with its items and tracking for this shop, or the latest five orders. Use the item and model ids from here for open_return.',
  add_to_cart: 'Prepare a cart addition and read its exact summary aloud. Ask for spoken confirmation before calling confirm_action.',
  update_cart_item: 'Prepare a cart change and read its exact summary aloud. Ask for spoken confirmation before calling confirm_action.',
  place_order: 'Prepare an order for this shop. Read the summary aloud and ask the buyer to tap the on-screen confirmation card.',
  open_return: 'Check eligibility and prepare a return. Read the summary aloud and ask the buyer to tap the on-screen confirmation card.',
  confirm_action: 'Execute the exact prepared cart action only after the buyer approves its full readback in a new reply. Interpret their whole reply: clarification, acknowledgement, conditions and revisions are not approval of an earlier action. Orders and returns require tapping their card.',
  handoff_to_seller: 'Send an unanswered question and conversation excerpt to this shop’s seller inbox.',
};

type Name = keyof typeof definitions;

@Injectable()
export class AssistantToolRegistry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly actions: ActionsService,
    private readonly logistics: LogisticsService,
    private readonly vouchers: VoucherService,
  ) {}

  specs(): Array<{ name: string; description: string; inputSchema: object }> {
    return Object.entries(definitions).map(([name, def]) => ({
      name,
      description: descriptions[name] ?? name,
      inputSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: def.properties,
        required: def.required,
        additionalProperties: false,
      },
    }));
  }

  async run(name: string, args: unknown, ctx: ToolContext): Promise<ToolOutput> {
    const started = Date.now();
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: ctx.conversationId, buyerId: ctx.buyerId, shopId: ctx.shopId, status: 'ACTIVE' },
    });
    // Do not log attempts for an absent or ended conversation; the log must belong to an active conversation.
    if (!conversation) return { success: false, text: 'Conversation not found.' };
    let result: ToolOutput;
    try {
      const def = definitions[name as Name];
      if (!def) throw new Error('Tool unavailable');
      const input = def.schema.parse(args) as Record<string, unknown>;
      result = await this.execute(name as Name, input, ctx);
    } catch (error) {
      result = {
        success: false,
        text:
          error instanceof z.ZodError ? JSON.stringify({ error: 'invalid_tool_arguments', issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) }) : error instanceof DomainError ? error.message : 'Requested data is unavailable.',
      };
    }
    await this.prisma.conversationToolCall.create({
      data: {
        conversationId: ctx.conversationId,
        tool: name,
        args: args == null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(args)) as Prisma.InputJsonValue),
        result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        success: result.success,
        error: result.success ? null : result.text,
        latencyMs: Date.now() - started,
      },
    });
    return result;
  }

  private async execute(name: Name, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
    if (name === 'set_response_language') {
      const language = input.language as 'vi' | 'en';
      await this.prisma.conversation.update({ where: { id: ctx.conversationId }, data: { language } });
      return { success: true, text: JSON.stringify({ response_language: language }), response_language: language };
    }
    if (name === 'check_voucher') {
      const code = (input.voucher_code as string).toUpperCase();
      const voucher = await this.prisma.voucher.findFirst({ where: { shopId: ctx.shopId, code, displayChannels: { has: 1 } } });
      if (!voucher) return { success: false, text: 'Voucher is not publicly available in this shop. Call get_vouchers for exact available codes.' };
      const scope = input.lines ? 'proposed_basket' : 'current_shop_cart';
      const lines = input.lines as Array<{ item_id: number; model_id: number; quantity: number }> | undefined
        ?? (await this.prisma.cartItem.findMany({ where: { userId: ctx.buyerId, model: { item: { shopId: ctx.shopId } } }, include: { model: true } }))
          .map((line) => ({ item_id: line.model.itemId, model_id: line.modelId, quantity: line.quantity }));
      if (!lines.length) return { success: true, text: JSON.stringify({ code, scope, status: 'needs_basket', reason: 'Choose the exact variants and quantities to evaluate eligibility.' }) };
      const models = await this.prisma.model.findMany({
        where: { id: { in: lines.map((line) => line.model_id) }, item: { shopId: ctx.shopId, status: 'NORMAL', shop: { status: 'NORMAL' } } },
        include: { item: { include: { shop: true } }, discountModels: { include: { discount: true } } },
      });
      const ownsShop = !!(await this.prisma.shopMember.findFirst({ where: { userId: ctx.buyerId, shopId: ctx.shopId } }));
      const basket = [];
      for (const line of lines) {
        const model = models.find((model) => model.id === line.model_id && model.itemId === line.item_id);
        if (!model || model.isDefault === model.item.hasModel) return { success: false, text: 'Product variant not found in this shop. Read fresh product details.' };
        const price = resolveModelPrice(model).currentPrice;
        const issue = purchaseIssue(model.item, model, model.item.shop, line.quantity, ownsShop);
        basket.push({ ...line, name: model.item.name, variant: modelName(model.item, model.tierIndex), unit_price: price, line_total: price * line.quantity, stock: model.status === 'MODEL_NORMAL' ? model.stock : 0, covered: voucher.voucherType !== VOUCHER_PRODUCT || voucher.itemIds.includes(line.item_id), available: !issue, issue: issue ?? null });
      }
      const available = basket.filter((line) => line.available);
      const evaluation = this.vouchers.assess(voucher, available.map((line) => ({ itemId: line.item_id, lineTotal: line.line_total })));
      const used = await this.vouchers.alreadyUsedBy(ctx.buyerId, voucher.id);
      return { success: true, text: JSON.stringify({
        code, scope, status: 'evaluated', lines: basket,
        requested_items_subtotal: basket.reduce((sum, line) => sum + line.line_total, 0),
        items_subtotal: available.reduce((sum, line) => sum + line.line_total, 0),
        eligible_subtotal: evaluation.eligibleSubtotal, min_spend: toNumber(voucher.minBasketPrice),
        shortfall: used ? null : evaluation.shortfall,
        eligible: !used && evaluation.eligible, discount: used ? 0 : evaluation.discount,
        reason: used ? 'This buyer has already used the voucher' : evaluation.reason ?? null,
        can_fulfill: available.length === basket.length,
        note: 'This eligibility applies only to these lines at the time checked. Recheck after changes; checkout validates again.',
      }) };
    }
    if (name === 'get_viewed_product') {
      if (ctx.viewedItemId == null) return { success: true, text: JSON.stringify({ viewed: false, item: null, note: 'The buyer is not currently viewing a product in this shop. Ask which product they mean; do not treat an earlier viewed product as current.' }) };
      return this.execute('get_product_details', { ...input, item_id: ctx.viewedItemId }, ctx);
    }
    if (name === 'add_to_cart') {
      if (input.requested_attributes) {
        const item = await this.prisma.item.findFirst({ where: { id: input.item_id as number, shopId: ctx.shopId, status: 'NORMAL', shop: { status: 'NORMAL' } }, include: itemInclude });
        if (!item) return { success: false, text: 'Product not found.' };
        const match = variantMatch([item], input.requested_attributes as Record<string, string>);
        if (match.validation_miss || match.out_of_stock) return { success: false, text: JSON.stringify(match), ...match };
        const candidates = sellableModels(item).filter((model) => { const result = variantMatch([{ ...item, models: [model] }], input.requested_attributes as Record<string, string>); return !result.validation_miss && !result.out_of_stock; });
        if (candidates.length > 1) return { success: false, text: JSON.stringify({ error: 'Variant needs clarification', candidates: candidates.map((model) => ({ model_id: model.id, name: modelName(item, model.tierIndex) })) }) };
        const selected = { ...item, models: item.models.filter((model) => model.id === input.model_id) };
        const selectedMatch = variantMatch([selected], input.requested_attributes as Record<string, string>);
        if (selectedMatch.out_of_stock) return { success: false, text: JSON.stringify(selectedMatch), ...selectedMatch };
        if (selectedMatch.validation_miss) return { success: false, text: 'Selected variant does not match the requested attributes.' };
      }
      const action = await this.actions.prepareAdd(ctx, input as { item_id: number; model_id: number; quantity: number });
      return { success: true, text: actionText(action), card: { kind: 'action', action } };
    }
    if (name === 'update_cart_item') {
      const action = await this.actions.prepareUpdate(ctx, input as { model_id: number; quantity?: number; new_model_id?: number });
      return { success: true, text: actionText(action), card: { kind: 'action', action } };
    }
    if (name === 'place_order') {
      if (input.voucher_code) {
        const now = new Date();
        const voucher = await this.prisma.voucher.findFirst({ where: { shopId: ctx.shopId, code: (input.voucher_code as string).trim().toUpperCase(), displayChannels: { has: 1 }, startTime: { lte: now }, endTime: { gt: now } } });
        if (!voucher || voucher.currentUsage >= voucher.usageQuantity) return { success: false, text: 'Voucher is not currently public and available in this shop. Call get_vouchers for exact codes.' };
      }
      const action = await this.actions.prepareOrder(ctx, input as Parameters<ActionsService['prepareOrder']>[1]);
      return { success: true, text: actionText(action), card: { kind: 'action', action } };
    }
    if (name === 'open_return') {
      const action = await this.actions.prepareReturn(ctx, input as unknown as Parameters<ActionsService['prepareReturn']>[1]);
      return { success: true, text: actionText(action), card: { kind: 'action', action } };
    }
    if (name === 'confirm_action') {
      const id = input.action_id as string;
      const action = await this.actions.confirm(id, ctx.buyerId, ctx.conversationId, false);
      return { success: true, text: JSON.stringify(action), card: { kind: 'action', action } };
    }
    if (name === 'cancel_action') {
      const action = await this.prisma.pendingAction.findFirst({ where: { id: input.action_id as string, ...ctxScope(ctx) } });
      if (!action) return { success: false, text: 'Pending action not found in this conversation.' };
      const cancelled = await this.actions.cancel(action.id, ctx.buyerId, 'agent');
      return { success: true, text: JSON.stringify(cancelled), card: { kind: 'action', action: cancelled } };
    }
    if (name === 'get_cart') {
      const cart = await this.prisma.cartItem.findMany({
        where: { userId: ctx.buyerId, model: { item: { shopId: ctx.shopId } } },
        include: { model: { include: { item: { include: { shop: true } }, discountModels: { include: { discount: true } } } } },
        orderBy: { id: 'asc' },
      });
      const lines = cart.map((line) => ({
        item_id: line.model.itemId,
        model_id: line.modelId,
        name: line.model.item.name,
        quantity: line.quantity,
        price: resolveModelPrice(line.model).currentPrice,
      }));
      const total = cart.reduce((sum, line) => {
        const model = line.model;
        const item = model.item;
        const available =
          item.status === 'NORMAL' &&
          item.shop.status === 'NORMAL' &&
          !item.shop.holidayMode &&
          model.status === 'MODEL_NORMAL' &&
          model.isDefault !== item.hasModel &&
          model.stock >= line.quantity;
        return sum + (available ? resolveModelPrice(model).currentPrice * line.quantity : 0);
      }, 0);
      return { success: true, text: JSON.stringify({ lines, total }), card: { kind: 'cart', lines, total } };
    }
    if (name === 'compare_products') {
      const ids = input.item_ids as number[];
      const products = await this.prisma.item.findMany({
        where: { id: { in: ids }, shopId: ctx.shopId, status: 'NORMAL', shop: { status: 'NORMAL' } },
        include: itemInclude,
      });
      if (products.length !== new Set(ids).size) return { success: false, text: 'One or more products were not found.' };
      const items = products.map((item) => ({
        item_id: item.id,
        name: item.name,
        image: modelImage(item),
        price_min: this.catalog.priceRange(item).min,
        rows: { description: item.description, stock: String(this.catalog.totalStock(item)) },
      }));
      return { success: true, text: JSON.stringify(items), card: { kind: 'compare', items } };
    }
    if (name === 'handoff_to_seller') {
      const question = input.question as string;
      const reason = input.reason as string;
      const messages = await this.prisma.conversationMessage.findMany({
        where: { conversationId: ctx.conversationId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { role: true, text: true },
      });
      const body = `${question}\n\nReason: ${reason}\n\n${messages
        .reverse()
        .map((m) => `${m.role}: ${m.text}`)
        .join('\n')}`;
      const ticket = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ctx.buyerId}::int, ${ctx.shopId}::int)::text`;
        const existing = await tx.handoffTicket.findFirst({
          where: { buyerId: ctx.buyerId, shopId: ctx.shopId, status: 'OPEN' },
          orderBy: { id: 'desc' },
        });
        const ticket = existing
          ? await tx.handoffTicket.update({ where: { id: existing.id }, data: { sellerUnread: { increment: 1 } } })
          : await tx.handoffTicket.create({
              data: {
                buyerId: ctx.buyerId,
                shopId: ctx.shopId,
                conversationId: ctx.conversationId,
                subject: question.slice(0, 200),
                sellerUnread: 1,
              },
            });
        await tx.handoffMessage.create({ data: { ticketId: ticket.id, author: 'ASSISTANT', body } });
        return ticket;
      });
      return { success: true, text: 'Your question has been sent to the seller.', card: { kind: 'handoff', ticket_id: ticket.id } };
    }
    if (name === 'get_order_status') {
      const orders = await this.prisma.order.findMany({
        where: { buyerId: ctx.buyerId, shopId: ctx.shopId, ...(input.order_sn ? { orderSn: input.order_sn as string } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { items: { orderBy: { id: 'asc' } }, package: { include: { events: { orderBy: { createdAt: 'asc' } } } } },
      });
      const rows = orders.map((order) => ({
        order_sn: order.orderSn,
        status: order.status,
        items: order.items.map((line) => ({
          item_id: line.itemId,
          model_id: line.modelId,
          name: line.itemName,
          ...(line.isDefaultModel ? {} : { variant: line.modelName }),
          quantity: line.quantity,
          price: Number(line.discountedPrice),
        })),
        tracking: (order.package?.events ?? []).map((event) => ({
          time: Math.floor(event.createdAt.getTime() / 1000),
          description: event.description,
        })),
      }));
      return { success: true, text: JSON.stringify(rows), ...(rows.length === 1 ? { card: { kind: 'order' as const, ...rows[0]! } } : {}) };
    }
    if (name === 'search_products' || name === 'get_product_details') {
      const items = await this.prisma.item.findMany({
        where: {
          shopId: ctx.shopId,
          status: 'NORMAL',
          shop: { status: 'NORMAL' },
          ...(name === 'get_product_details' ? { id: input.item_id as number } : {
            AND: (input.query as string).trim().split(/\s+/).filter(Boolean).map((token) => ({ OR: [
              { name: { contains: token, mode: 'insensitive' as const } },
              { brand: { name: { contains: token, mode: 'insensitive' as const } } },
              { category: { name: { contains: token, mode: 'insensitive' as const } } },
              { category: { displayName: { contains: token, mode: 'insensitive' as const } } },
            ] })),
          }),
        },
        include: itemInclude,
        orderBy: { id: 'asc' },
      });
      const ratings = await this.catalog.ratingSummary(items.map((item) => item.id));
      if (name === 'get_product_details') {
        const item = items[0];
        if (!item) return { success: false, text: 'Product not found.' };
        const match = input.requested_attributes ? variantMatch([item], input.requested_attributes as Record<string, string>) : {};
        const models = sellableModels(item).map((m) => ({
          model_id: m.id,
          name: modelName(item, m.tierIndex),
          price: resolveModelPrice(m).currentPrice,
          stock: m.status === 'MODEL_NORMAL' ? m.stock : 0,
          attributes: Object.fromEntries(tierVariations(item).map((tier, index) => [tier.name, tier.option_list[m.tierIndex[index] ?? -1]?.option ?? ''])),
        }));
        const definitions = await this.prisma.categoryAttribute.findMany({ where: { categoryId: item.categoryId } });
        const attributes = (Array.isArray(item.attributes) ? item.attributes : [])
          .map((raw) => {
            const attr = raw as {
              attribute_id?: number;
              attribute_value_list?: Array<{ value_id?: number; original_value_name?: string; value_unit?: string }>;
            };
            const def = definitions.find((value) => value.id === attr.attribute_id);
            if (!def) return null;
            const known = (Array.isArray(def.values) ? def.values : []) as Array<{ value_id: number; name: string; display_name?: string }>;
            const value = (attr.attribute_value_list ?? [])
              .map((part) => {
                const match = known.find((entry) => entry.value_id === part.value_id);
                return (match?.display_name ?? match?.name ?? part.original_value_name ?? '') + (part.value_unit ? ` ${part.value_unit}` : '');
              })
              .filter(Boolean)
              .join(', ');
            return value ? { name: def.displayName, value } : null;
          })
          .filter(Boolean);
        const reviews = await this.prisma.review.findMany({
          where: { itemId: item.id, hidden: false },
          include: { buyer: { select: { name: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 3,
        });
        const rating = ratings.get(item.id);
        const card: AssistantCard = {
          kind: 'product',
          item_id: item.id,
          name: item.name,
          image: requestedProductImage(item, input.requested_attributes as Record<string, string> | undefined),
          models,
          images: item.images.slice(0, 6).map((image) => mediaUrl(image.url)),
          description: item.description,
          attributes: attributes as Array<{ name: string; value: string }>,
          brand: item.brand?.name ?? null,
          category: item.category.displayName,
          rating: rating?.avg ?? null,
          rating_count: rating?.count ?? 0,
          sold: item.sales,
          days_to_ship: item.daysToShip,
          reviews: reviews.map((review) => {
            const model = review.modelId ? item.models.find((m) => m.id === review.modelId) : undefined;
            return {
              rating: review.rating,
              comment: review.comment,
              buyer_name: maskName(review.buyer.name),
              model_name: model ? modelName(item, model.tierIndex) : null,
            };
          }),
        };
        return {
          success: true,
          text: JSON.stringify({
            item_id: item.id,
            name: item.name,
            description: item.description,
            attributes,
            brand: card.brand,
            category: card.category,
            rating: card.rating,
            rating_count: card.rating_count,
            sold: card.sold,
            days_to_ship: card.days_to_ship,
            recent_reviews: card.reviews,
            tier_variations: tierVariations(item).map((tier) => ({ name: tier.name, options: tier.option_list.map((option) => option.option) })),
            models,
            ...match,
          }),
          card,
          ...match,
        };
      }
      const filtered = items
        .map((item) => {
          const range = this.catalog.priceRange(item);
          return {
            item_id: item.id,
            name: item.name,
            image: requestedProductImage(item, input.requested_attributes as Record<string, string> | undefined),
            price_min: range.min,
            price_max: range.max,
            stock: this.catalog.totalStock(item),
            rating: ratings.get(item.id)?.avg ?? null,
          };
        })
        .filter(
          (item) =>
            (input.min_price === undefined || item.price_max >= (input.min_price as number)) &&
            (input.max_price === undefined || item.price_min <= (input.max_price as number)),
        )
        ;
      const offset = (input.offset as number | undefined) ?? 0;
      const limit = (input.limit as number | undefined) ?? 50;
      const rows = filtered.slice(offset, offset + limit);
      return { success: true, text: JSON.stringify({ items: rows, total: filtered.length, offset, limit, has_more: offset + rows.length < filtered.length }), card: { kind: 'products', items: rows } };
    }
    if (name === 'get_shop_faqs') {
      const faqs = await this.prisma.assistantFaq.findMany({
        where: { shopId: ctx.shopId, enabled: true },
        select: { question: true, answer: true, lang: true },
        orderBy: { id: 'asc' },
      });
      return { success: true, text: JSON.stringify(faqs) };
    }
    if (name === 'get_return_policy' || name === 'get_shipping_info') {
      const product = input.item_id
        ? await this.prisma.item.findFirst({
            where: { id: input.item_id as number, shopId: ctx.shopId, status: 'NORMAL', shop: { status: 'NORMAL' } },
            select: { logistics: true },
          })
        : null;
      if (input.item_id && !product) return { success: false, text: 'Product not found.' };
      const policy = await this.prisma.shopPolicy.findUnique({ where: { shopId: ctx.shopId } });
      if (!policy) return { success: false, text: 'Policy not available.' };
      if (name === 'get_return_policy')
        return { success: true, text: JSON.stringify({ return_policy: policy.returnPolicy, return_window_days: policy.returnWindowDays }) };
      const channels = product
        ? this.logistics.eligibleChannels(await this.logistics.channels(), [product.logistics]).map((channel) => ({
            name: channel.name,
            base_fee: toNumber(channel.baseFee),
            per_kg_fee: toNumber(channel.perKgFee),
            min_days: channel.minDays,
            max_days: channel.maxDays,
          }))
        : [];
      return {
        success: true,
        text: JSON.stringify({
          shipping_policy: policy.shippingPolicy,
          channels,
          ...(product ? {} : { note: 'Select a product for available shipping channels.' }),
        }),
      };
    }
    const now = new Date();
    const vouchers = await this.prisma.voucher.findMany({
      where: { shopId: ctx.shopId, startTime: { lte: now }, endTime: { gt: now }, displayChannels: { has: 1 } },
      select: {
        id: true,
        code: true,
        name: true,
        voucherType: true,
        rewardType: true,
        discountAmount: true,
        percentage: true,
        maxPrice: true,
        minBasketPrice: true,
        usageQuantity: true,
        currentUsage: true,
        itemIds: true,
        endTime: true,
      },
    });
    const used = await this.prisma.order.findMany({
      where: { buyerId: ctx.buyerId, shopId: ctx.shopId, voucherId: { in: vouchers.map((v) => v.id) }, status: { not: 'CANCELLED' } },
      select: { voucherId: true },
    });
    const usedIds = new Set(used.map((order) => order.voucherId));
    const visible = vouchers
      .filter((v) => v.currentUsage < v.usageQuantity && !usedIds.has(v.id))
      .map((v) => ({
        code: v.code,
        name: v.name,
        voucher_type: v.voucherType,
        reward_type: v.rewardType,
        discount_amount: v.discountAmount === null ? null : toNumber(v.discountAmount),
        percentage: v.percentage,
        max_discount: v.maxPrice === null ? null : toNumber(v.maxPrice),
        min_spend: toNumber(v.minBasketPrice),
        item_ids: v.itemIds,
        end_time: Math.floor(v.endTime.getTime() / 1000),
      }));
    return { success: true, text: JSON.stringify(visible) };
  }
}
