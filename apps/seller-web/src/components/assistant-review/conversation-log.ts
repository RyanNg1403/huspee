import type { AssistantConversationDetail } from '@huspee/sdk';
import type { Action, Card } from '@huspee/web-ui/components/assistant/card-types';

export type ToolCall = AssistantConversationDetail['tool_calls'][number];
type Message = AssistantConversationDetail['messages'][number];
type ConversationLog = Pick<AssistantConversationDetail, 'messages' | 'tool_calls'>;
type Json = Record<string, unknown>;

/** Logged by the voice runtime when spoken text was blocked or corrected; not a data lookup. */
const SPEECH_CHECK = 'speech_check';

const isObject = (value: unknown): value is Json =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

function parseText(result: Json): unknown {
  if (typeof result.text !== 'string') return undefined;
  try {
    return JSON.parse(result.text) as unknown;
  } catch {
    return undefined;
  }
}

function resultOf(call: ToolCall): Json {
  return isObject(call.result) ? call.result : {};
}

/** The card the buyer saw for this tool result, if any. */
function cardOf(call: ToolCall): Card | null {
  if (!call.success || call.tool === SPEECH_CHECK) return null;
  const card = resultOf(call).card;
  return isObject(card) && typeof card.kind === 'string' ? (card as Card) : null;
}

/** Backend summaries carry both languages as "Tiếng Việt / English". */
export function pickLang(text: string, lang: 'vi' | 'en'): string {
  const parts = text.split(' / ');
  return (parts.length === 2 ? parts[lang === 'vi' ? 0 : 1]! : text).trim();
}

export type ToolInput = {
  query?: string;
  attributes: string[];
  priceMin?: number;
  priceMax?: number;
  products: string[];
  quantity?: number;
  voucher?: string;
  orderSn?: string;
  question?: string;
  viewed?: boolean;
};

export type ToolOutput =
  | { kind: 'products'; names: string[]; closest: boolean }
  | { kind: 'product'; name: string; priceMin: number; priceMax: number; stock: number; variants: number }
  | { kind: 'missing'; attribute: string; value: string }
  | { kind: 'out_of_stock' }
  | { kind: 'compare'; names: string[] }
  | { kind: 'vouchers'; codes: string[] }
  | { kind: 'shipping'; channels: string[] }
  | { kind: 'return_policy'; days: number | null }
  | { kind: 'faqs'; count: number }
  | { kind: 'cart'; lines: number; total: number }
  | { kind: 'action'; action: Action }
  | { kind: 'order'; orderSn: string; status: string }
  | { kind: 'orders'; count: number }
  | { kind: 'handoff'; ticketId: number }
  | { kind: 'not_viewing' }
  | { kind: 'failed' }
  | { kind: 'none' };

export type ToolEntry = {
  id: number;
  at: number;
  tool: string;
  success: boolean;
  input: ToolInput;
  output: ToolOutput;
};

function productNames(card: Card | null): string[] {
  if (!card) return [];
  if (card.kind === 'product') return [card.name];
  if (card.kind === 'compare' || card.kind === 'products') return card.items.map((item) => item.name);
  return [];
}

function inputOf(call: ToolCall, card: Card | null): ToolInput {
  const args = isObject(call.args) ? call.args : {};
  const attributes = isObject(args.requested_attributes)
    ? Object.values(args.requested_attributes).flatMap((value) => str(value) ?? [])
    : [];
  const named =
    call.tool === 'get_product_details' ||
    call.tool === 'get_viewed_product' ||
    call.tool === 'compare_products';
  return {
    query: str(args.query),
    attributes,
    priceMin: num(args.min_price),
    priceMax: num(args.max_price),
    products: named ? productNames(card) : [],
    quantity: num(args.quantity),
    voucher: str(args.voucher_code),
    orderSn: str(args.order_sn),
    question: str(args.question),
    viewed: call.tool === 'get_viewed_product' || undefined,
  };
}

function outputOf(call: ToolCall, card: Card | null): ToolOutput {
  if (!call.success) return { kind: 'failed' };
  const result = resultOf(call);
  const missing = isObject(result.missing) ? result.missing : null;
  if (missing && str(missing.attribute) && str(missing.value))
    return { kind: 'missing', attribute: str(missing.attribute)!, value: str(missing.value)! };
  if (result.out_of_stock === true) return { kind: 'out_of_stock' };
  if (card) {
    switch (card.kind) {
      case 'products': {
        const body = parseText(result);
        return {
          kind: 'products',
          names: card.items.map((item) => item.name),
          closest: isObject(body) && body.match === 'closest',
        };
      }
      case 'product': {
        const prices = card.models.map((model) => model.price);
        return {
          kind: 'product',
          name: card.name,
          priceMin: prices.length ? Math.min(...prices) : 0,
          priceMax: prices.length ? Math.max(...prices) : 0,
          stock: card.models.reduce((sum, model) => sum + model.stock, 0),
          variants: card.models.length,
        };
      }
      case 'compare':
        return { kind: 'compare', names: card.items.map((item) => item.name) };
      case 'cart':
        return { kind: 'cart', lines: card.lines.length, total: card.total };
      case 'action':
        return { kind: 'action', action: card.action };
      case 'order':
        return { kind: 'order', orderSn: card.order_sn, status: card.status };
      case 'handoff':
        return { kind: 'handoff', ticketId: card.ticket_id };
    }
  }
  const body = parseText(result);
  switch (call.tool) {
    case 'get_viewed_product':
      return { kind: 'not_viewing' };
    case 'get_vouchers':
      return {
        kind: 'vouchers',
        codes: Array.isArray(body) ? body.flatMap((v) => (isObject(v) && str(v.code)) || []) : [],
      };
    case 'get_shipping_info':
      return {
        kind: 'shipping',
        channels:
          isObject(body) && Array.isArray(body.channels)
            ? body.channels.flatMap((c) => (isObject(c) && str(c.name)) || [])
            : [],
      };
    case 'get_return_policy':
      return { kind: 'return_policy', days: isObject(body) ? (num(body.return_window_days) ?? null) : null };
    case 'get_shop_faqs':
      return { kind: 'faqs', count: Array.isArray(body) ? body.length : 0 };
    case 'get_order_status':
      return { kind: 'orders', count: Array.isArray(body) ? body.length : 0 };
    case 'search_products':
      return { kind: 'products', names: [], closest: false };
  }
  return { kind: 'none' };
}

/** Every data lookup the assistant made, as plain facts without internal IDs. */
export function toolEntries(calls: ToolCall[]): ToolEntry[] {
  return calls
    .filter((call) => call.tool !== SPEECH_CHECK)
    .map((call) => {
      const card = cardOf(call);
      return {
        id: call.id,
        at: call.created_at,
        tool: call.tool,
        success: call.success,
        input: inputOf(call, card),
        output: outputOf(call, card),
      };
    });
}

export type Outcome =
  | { kind: 'order_quote'; total?: number }
  | { kind: 'return_request' }
  | { kind: 'cart' }
  | { kind: 'handoff'; ticketId: number }
  | { kind: 'missing' }
  | { kind: 'unanswered' }
  | { kind: 'asked' }
  | { kind: 'none' };

/** The furthest step the logs show: an order or return card, a cart change, a handoff, then lookups. */
export function outcomeOf(calls: ToolCall[]): Outcome {
  const entries = toolEntries(calls);
  const actions = entries.flatMap((entry) => (entry.output.kind === 'action' ? [entry.output.action] : []));
  const order = actions.filter((action) => action.type === 'PLACE_ORDER').at(-1);
  if (order) return { kind: 'order_quote', total: order.summary.total };
  if (actions.some((action) => action.type === 'OPEN_RETURN')) return { kind: 'return_request' };
  if (
    actions.some(
      (action) =>
        (action.type === 'ADD_TO_CART' || action.type === 'UPDATE_CART_ITEM') && action.status === 'EXECUTED',
    )
  )
    return { kind: 'cart' };
  const handoff = entries.find((entry) => entry.output.kind === 'handoff');
  if (handoff?.output.kind === 'handoff') return { kind: 'handoff', ticketId: handoff.output.ticketId };
  if (entries.some((entry) => entry.output.kind === 'missing' || entry.output.kind === 'out_of_stock'))
    return { kind: 'missing' };
  if (entries.some((entry) => !entry.success)) return { kind: 'unanswered' };
  return entries.length ? { kind: 'asked' } : { kind: 'none' };
}

export type Overview = { firstQuestion: string | null; products: string[]; turns: number; outcome: Outcome };

export function conversationOverview(log: ConversationLog): Overview {
  const products: string[] = [];
  for (const call of log.tool_calls) {
    const card = cardOf(call);
    const names =
      card?.kind === 'product' || card?.kind === 'compare'
        ? productNames(card)
        : card?.kind === 'products' && card.items.length === 1
          ? productNames(card)
          : [];
    for (const name of names) if (!products.includes(name)) products.push(name);
  }
  const buyerMessages = log.messages.filter((message) => message.role === 'USER' && message.text.trim());
  return {
    firstQuestion: buyerMessages[0]?.text.trim() ?? null,
    products,
    turns: buyerMessages.length,
    outcome: outcomeOf(log.tool_calls),
  };
}

export type SpeechFlag = { kind: 'corrected' | 'blocked'; unsupported: string[] };
export type TranscriptEntry =
  | { kind: 'message'; key: string; at: number; role: 'buyer' | 'assistant'; text: string; flag?: SpeechFlag }
  | { kind: 'blocked'; key: string; at: number; text: string; flag: SpeechFlag }
  | { kind: 'context'; key: string; at: number; product: string }
  | { kind: 'card'; key: string; at: number; tool: string; card: Card };

type SpeechLog = { kind: string; text: string; unsupported: string[] };
function speechLog(call: ToolCall): SpeechLog | null {
  const body = parseText(resultOf(call));
  if (!isObject(body) || typeof body.text !== 'string') return null;
  return {
    kind: str(body.kind) ?? '',
    text: body.text.trim(),
    unsupported: Array.isArray(body.unsupported)
      ? body.unsupported.filter((v): v is string => typeof v === 'string')
      : [],
  };
}

const rank = (entry: TranscriptEntry) =>
  entry.kind === 'message' && entry.role === 'buyer'
    ? 0
    : entry.kind === 'context'
      ? 1
      : entry.kind === 'card'
        ? 2
        : 3;

/**
 * The conversation as the buyer lived it: messages, the cards their tool results produced (an action
 * card keeps its first place and shows its latest state), the product page they were on, and any
 * spoken text the backend corrected or blocked.
 */
export function transcriptEntries(log: ConversationLog): TranscriptEntry[] {
  const entries: TranscriptEntry[] = log.messages
    .filter((message: Message) => message.text.trim())
    .map((message: Message) => ({
      kind: 'message',
      key: `m${message.id}`,
      at: message.created_at,
      role: message.role === 'USER' ? 'buyer' : 'assistant',
      text: message.text.trim(),
    }));
  const actions = new Map<string, Extract<TranscriptEntry, { kind: 'card' }>>();
  let viewing: string | null = null;
  for (const call of log.tool_calls) {
    if (call.tool === SPEECH_CHECK) {
      const speech = speechLog(call);
      if (!speech) continue;
      const flag: SpeechFlag = {
        kind: speech.kind === 'corrected' ? 'corrected' : 'blocked',
        unsupported: speech.unsupported,
      };
      // The voice said it, so it is in the transcript: the latest matching assistant line before the check.
      const spoken =
        flag.kind === 'corrected'
          ? entries
              .filter(
                (entry): entry is Extract<TranscriptEntry, { kind: 'message' }> => entry.kind === 'message',
              )
              .filter(
                (entry) =>
                  entry.role === 'assistant' &&
                  entry.at <= call.created_at &&
                  entry.text === speech.text &&
                  !entry.flag,
              )
              .at(-1)
          : undefined;
      if (spoken) spoken.flag = flag;
      else
        entries.push({ kind: 'blocked', key: `s${call.id}`, at: call.created_at, text: speech.text, flag });
      continue;
    }
    const card = cardOf(call);
    if (!card) continue;
    if (call.tool === 'get_viewed_product' && card.kind === 'product' && card.name !== viewing) {
      viewing = card.name;
      entries.push({ kind: 'context', key: `v${call.id}`, at: call.created_at, product: card.name });
    }
    if (card.kind === 'action') {
      const existing = actions.get(card.action.action_id);
      if (existing) {
        // A replayed pending card never hides the confirmed or cancelled state.
        if (
          existing.card.kind === 'action' &&
          (existing.card.action.status === 'PENDING' || card.action.status !== 'PENDING')
        )
          existing.card = card;
        continue;
      }
    }
    const entry: TranscriptEntry = {
      kind: 'card',
      key: `c${call.id}`,
      at: call.created_at,
      tool: call.tool,
      card,
    };
    if (card.kind === 'action') actions.set(card.action.action_id, entry);
    entries.push(entry);
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.at - b.entry.at || rank(a.entry) - rank(b.entry) || a.index - b.index)
    .map(({ entry }) => entry);
}
