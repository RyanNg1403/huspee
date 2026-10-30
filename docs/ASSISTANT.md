# Voice shopping assistant: Phase 2 contract

The shared contract for the Phase 2 assistant (AGENTS.md section 13). Backend, SDK and web work
build against this file. Change it only together with the code, and say so in the change.

All routes below are project-defined (`custom` provenance), live under `/api/v1`, use the Phase 1
web session cookie and the standard custom envelope/error format. Every route checks role and
ownership server-side: buyer routes act only for the signed-in buyer; seller routes require
membership of `:shopId`.

## 1. Data model (Prisma, one additive migration)

| Model | Key fields |
|---|---|
| `AssistantConfig` | `shopId` (PK, FK Shop), `enabled` (default true), `tone` (`FRIENDLY`, `PROFESSIONAL`, `ENTHUSIASTIC`; default FRIENDLY), `voice` (string, default `spruce`), `greetingVi`, `greetingEn`, `updatedAt` |
| `AssistantFaq` | `id`, `shopId`, `question`, `answer`, `lang` (`vi`, `en`, `any`), `enabled`, timestamps |
| `Conversation` | `id` (uuid), `shopId`, `buyerId`, `channel` (`VOICE`, `TEXT`), `status` (`ACTIVE`, `ENDED`), `startedAt`, `endedAt`, `language` (nullable), `summary` (Json, nullable; filled in wave 2) |
| `ConversationMessage` | `id`, `conversationId`, `role` (`USER`, `ASSISTANT`), `text`, `createdAt` |
| `ConversationToolCall` | `id`, `conversationId`, `tool`, `args` (Json), `result` (Json), `success`, `error` (nullable), `latencyMs`, `createdAt` |
| `PendingAction` | `id` (uuid), `conversationId`, `buyerId`, `shopId`, `type` (`ADD_TO_CART`, `UPDATE_CART_ITEM`, `PLACE_ORDER`, `OPEN_RETURN`), `payload` (Json, the exact executable input), `summary` (Json, what the buyer is shown), `requiresTap` (bool), `status` (`PENDING`, `EXECUTED`, `CANCELLED`, `EXPIRED`, `FAILED`), `expiresAt` (5 minutes), `result` (Json), `idempotencyKey` (nullable, unique), timestamps |
| `HandoffTicket` | `id`, `shopId`, `buyerId`, `conversationId` (nullable), `subject`, `status` (`OPEN`, `ANSWERED`, `CLOSED`), `buyerUnread` (int), `sellerUnread` (int), timestamps |
| `HandoffMessage` | `id`, `ticketId`, `author` (`BUYER`, `SELLER`, `ASSISTANT`), `authorUserId` (nullable), `body`, `createdAt` |

Seed: every seeded shop gets an `AssistantConfig` and 3-5 realistic FAQs (vi, some en). The seed's
truncation must include the new tables.

## 2. Tool layer (backend, `apps/api/src/assistant/tools/`)

`AssistantToolRegistry` (Nest provider):

```ts
interface ToolContext { conversationId: string; buyerId: number; shopId: number }
interface ToolOutput {
  text: string;            // compact facts for the model (VND integers, ids, names)
  card?: AssistantCard;    // optional UI card, see section 4
  success: boolean;
}
class AssistantToolRegistry {
  specs(): Array<{ name: string; description: string; inputSchema: object }>; // JSON Schema draft-7
  run(name: string, args: unknown, ctx: ToolContext): Promise<ToolOutput>;     // validates args, logs ConversationToolCall
}
```

Tools (all scoped to `ctx.shopId`; never return another shop's or buyer's data, seller-only
fields or unpublished items):

| Tool | Purpose |
|---|---|
| `search_products(query, min_price?, max_price?, limit?)` | Public items of this shop, with price range and stock per item |
| `get_product_details(item_id)` | Description, attributes, variants (model_id, name, price, stock), rating |
| `compare_products(item_ids[2..4])` | Side-by-side facts |
| `get_vouchers()` | Public, currently usable vouchers of this shop with rules |
| `get_shipping_info(item_id?)` | Channels, fees and times from seeded/persisted data |
| `get_return_policy()` | The shop's persisted policy |
| `get_shop_faqs(query?)` | Enabled seller FAQs (verified data) |
| `get_cart()` | The buyer's cart lines for this shop, with API-computed totals |
| `get_order_status(order_sn?)` | The buyer's own orders with this shop (latest 5 if no order_sn), status and tracking |
| `add_to_cart(item_id, model_id, quantity)` | Creates a `PendingAction` (requiresTap false) and returns its readback |
| `update_cart_item(model_id, quantity?, new_model_id?)` | Same, `UPDATE_CART_ITEM` |
| `place_order(voucher_code?, address_id?, payment_method?)` | Creates a `PendingAction` (requiresTap **true**) from a server checkout preview of this shop's cart lines; readback has items, totals, voucher, address |
| `open_return(order_sn, items[{item_id, model_id, quantity}], reason, solution)` | `PendingAction` (requiresTap **true**) after eligibility checks |
| `confirm_action(action_id)` | Executes a PENDING, unexpired action of this conversation **only if requiresTap is false** (the model calls it after a spoken yes). Tap-required actions return an error telling the model to ask the buyer to tap the card |
| `handoff_to_seller(question, reason)` | Creates or appends to an OPEN `HandoffTicket` for this buyer+shop with the question and a transcript excerpt; returns a handoff card |

Execution reuses Phase 1 domain services (cart, checkout with idempotency, returns). Prices,
totals and discounts always come from those services, never from the model.

## 3. Routes

Buyer (role BUYER):

| Method and path | Body / result |
|---|---|
| `GET /assistant/shops/:shopId/profile` (public) | `{ shop_id, shop_name, enabled, voice, greeting: {vi, en} }` |
| `GET /assistant/voices` (public) | `{ voices: string[] }` (from the runtime; static fallback) |
| `POST /assistant/text/sessions` | `{ shop_id, lang? }` → `{ conversation_id }`; text-only thread, reusing the voice session events/text/stop paths |
| `POST /assistant/voice/sessions` | `{ shop_id, sdp_offer, lang? }` → `{ conversation_id, sdp_answer }` |
| `GET /assistant/voice/sessions/:conversationId/events` | Server-sent events, section 4 |
| `POST /assistant/voice/sessions/:conversationId/text` | `{ text }` typed input into the live session → `{ ok: true }` |
| `POST /assistant/voice/sessions/:conversationId/stop` | → `{ ok: true }`; marks the conversation ENDED |
| `POST /assistant/actions/:actionId/confirm` | `{ idempotency_key }` → `{ action }` (executes; tap path) |
| `POST /assistant/actions/:actionId/cancel` | → `{ action }` |
| `GET /buyer/messages` | paged tickets `{ ticket_id, shop_id, shop_name, subject, status, buyer_unread, updated_at, last_message }` |
| `GET /buyer/messages/unread-count` | `{ count }` |
| `GET /buyer/messages/:ticketId` | ticket + messages; marks buyer side read |
| `POST /buyer/messages/:ticketId/replies` | `{ body }` → message |

Seller (member of `:shopId`):

| Method and path | Body / result |
|---|---|
| `GET` / `PUT /seller/shops/:shopId/assistant/config` | config fields (snake_case) |
| `GET` / `POST /seller/shops/:shopId/assistant/faqs`, `PUT` / `DELETE .../faqs/:faqId` | FAQ CRUD |
| `GET /seller/shops/:shopId/assistant/conversations` | paged; filters `status`, `has_handoff`, `from`, `to` |
| `GET /seller/shops/:shopId/assistant/conversations/:conversationId` | messages + tool calls in time order |
| `GET /seller/shops/:shopId/inbox` | paged tickets with `seller_unread`; filter `status` |
| `GET /seller/shops/:shopId/inbox/:ticketId` | ticket + messages + linked conversation id; marks seller side read |
| `POST /seller/shops/:shopId/inbox/:ticketId/replies` | `{ body }` → message; ticket becomes ANSWERED |
| `POST /seller/shops/:shopId/inbox/:ticketId/close` | → ticket |

SDK (`@huspee/sdk`, browser-safe): `client.assistant.{profile, voices, text.start, voice.{start, text, stop,
eventsUrl}, actions.{confirm, cancel}}`, `client.buyer.messages.{list, unreadCount, get, reply}`,
`client.seller.assistant.{getConfig, updateConfig, faqs.{list, create, update, remove},
conversations.{list, get}}`, `client.seller.inbox.{list, get, reply, close}`.

## 4. Live events and cards

SSE `data:` lines are JSON:

```ts
type AssistantEvent =
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; final: boolean; item_id?: string } // delta when final=false
  | { type: 'tool'; name: string; status: 'started' | 'done' | 'error' }
  | { type: 'card'; card: AssistantCard }
  | { type: 'action'; action: PendingActionView }   // created / executed / cancelled / expired
  | { type: 'closed'; reason: string | null }
  | { type: 'error'; message: string };

type AssistantCard =
  | { kind: 'products'; items: Array<{ item_id: number; name: string; image: string | null; price_min: number; price_max: number; stock: number; rating: number | null }> }
  | { kind: 'product'; item_id: number; name: string; image: string | null; models: Array<{ model_id: number; name: string; price: number; stock: number }> }
  | { kind: 'compare'; items: Array<{ item_id: number; name: string; image: string | null; price_min: number; rows: Record<string, string> }> }
  | { kind: 'cart'; lines: Array<{ item_id: number; model_id: number; name: string; quantity: number; price: number }>; total: number }
  | { kind: 'order'; order_sn: string; status: string; tracking: Array<{ time: number; description: string }> }
  | { kind: 'handoff'; ticket_id: number }
  | { kind: 'action'; action: PendingActionView };

interface PendingActionView {
  action_id: string; type: 'ADD_TO_CART' | 'UPDATE_CART_ITEM' | 'PLACE_ORDER' | 'OPEN_RETURN';
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  requires_tap: boolean; expires_at: number;
  summary: { title: string; lines: Array<{ label: string; value: string }>; total?: number };
  result?: { order_sn?: string; return_sn?: string; message?: string };
}
```

When a tap-confirmed action executes, the bridge tells the live session (`[App]` note) so the
assistant can say so.

## 5. Voice bridge (backend, `apps/api/src/assistant/voice/`)

Per AGENTS.md section 13 and the wave-0 spike (`docs/VOICE.md`): one long-lived `codex
app-server` child process (private `CODEX_HOME`, `auth.json` symlinked from the operator's
`~/.codex`, never read or logged); per conversation an ephemeral thread started with the
registry's `dynamicTools` and the prompt, then `thread/realtime/start` (v3, WebRTC, configured
voice, `clientManagedHandoffs: false`); `item/tool/call` requests are answered by
`AssistantToolRegistry.run`; transcripts go to `ConversationMessage` and SSE. Enabled only when
`ASSISTANT_VOICE_ENABLED=true`; otherwise the voice routes return a clear `assistant_unavailable`
error. Tests use a fake app-server, never the real one.

## 6. Module seam between core and voice

`apps/api/src/assistant/assistant.module.ts` (core) exports, as injectable Nest providers:

```ts
class AssistantToolRegistry { specs(); run(name, args, ctx) }          // section 2
class ConversationService {
  start(input: { shopId: number; buyerId: number; channel: 'VOICE' | 'TEXT' }): Promise<{ id: string }>;
  appendMessage(conversationId: string, role: 'USER' | 'ASSISTANT', text: string): Promise<void>;
  end(conversationId: string): Promise<void>;
  assertBuyer(conversationId: string, buyerId: number): Promise<{ shopId: number }>; // throws not found otherwise
}
class AssistantEvents {                                                // in-process, synchronous fan-out
  emitAction(e: { conversationId: string; action: PendingActionView }): void;
  onAction(listener: (e: { conversationId: string; action: PendingActionView }) => void): () => void;
}
```

Core calls `emitAction` whenever a pending action is created, executed, cancelled, expired or
fails, whichever path did it (tool or route). Voice imports `AssistantModule`, subscribes with
`onAction`, forwards `{type:'action'}` on SSE, and on tap-executed or cancelled actions appends an
`[App]` note to the live realtime thread. Voice registers its own `VoiceModule` in app.module.ts.

Voice catalog seam: `apps/api/src/assistant/voice-catalog.ts` (core) exports `VoiceCatalogRegistry` (`register(catalog)`, `list()` with static fallback); VoiceModule registers its runtime catalog in `onModuleInit`; seller config validates `voice` through it.
