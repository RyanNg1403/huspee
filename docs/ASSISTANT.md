# Voice shopping assistant: Phase 2 contract

The shared contract for the Phase 2 assistant (AGENTS.md section 13). Backend, SDK and web work
build against this file. Change it only together with the code, and say so in the change.

All routes below are project-defined (`custom` provenance), live under `/api/v1`, and use the
standard custom envelope/error format. Except for public profiles, voices and Codex setup, routes use the Phase 1
web session cookie. Protected routes check role and
ownership server-side: buyer routes act only for the signed-in buyer; seller routes require
membership of `:shopId`.

## 1. Data model (Prisma, one additive migration)

| Model | Key fields |
|---|---|
| `AssistantConfig` | `shopId` (PK, FK Shop), `enabled` (default true), `tone` (`FRIENDLY`, `PROFESSIONAL`, `ENTHUSIASTIC`; default FRIENDLY), `voice` (string, default `spruce`), `greetingVi`, `greetingEn`, `updatedAt` |
| `AssistantFaq` | `id`, `shopId`, `question`, `answer`, `lang` (`vi`, `en`, `any`), `enabled`, timestamps |
| `Conversation` | `id` (uuid), `shopId`, `buyerId`, `channel` (`VOICE`, `TEXT`), `status` (`ACTIVE`, `ENDED`), `startedAt`, `endedAt`, `language` (nullable), `summary` (Json, nullable; the post-conversation summary) |
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
| `search_products(query, min_price?, max_price?, limit?, requested_attributes?)` | Public items of this shop, with price range and stock per item |
| `get_viewed_product(requested_attributes?)` | Fresh details for the product currently viewed in this shop; clears when the buyer leaves the product page |
| `get_product_details(item_id, requested_attributes?)` | Description, attributes, variants (model_id, name, price, stock), rating |
| `compare_products(item_ids[2..4])` | Side-by-side facts |
| `get_vouchers()` | Public, currently usable vouchers of this shop with rules |
| `get_shipping_info(item_id?)` | Channels, fees and times from seeded/persisted data |
| `get_return_policy()` | The shop's persisted policy |
| `get_shop_faqs(query?)` | Enabled seller FAQs (verified data) |
| `get_cart()` | The buyer's cart lines for this shop, with API-computed totals |
| `get_order_status(order_sn?)` | The buyer's own orders with this shop (latest 5 if no order_sn), status and tracking |
| `add_to_cart(item_id, model_id, quantity, requested_attributes?)` | Creates a `PendingAction` (requiresTap false) and returns its readback |
| `update_cart_item(model_id, quantity?, new_model_id?)` | Same, `UPDATE_CART_ITEM` |
| `place_order(voucher_code?, address_id?, payment_method?)` | Creates a `PendingAction` (requiresTap **true**) from a server checkout preview of this shop's cart lines; readback has items, totals, voucher, address |
| `open_return(order_sn, items[{item_id, model_id, quantity}], reason, solution)` | `PendingAction` (requiresTap **true**) after eligibility checks |
| `confirm_action(action_id?)` | With no ID, selects the latest unexpired pending action in this conversation ordered by creation time then ID descending (the ID breaks equal timestamps deterministically), refusing a tap-required action; otherwise executes a PENDING, unexpired action of this conversation **only if requiresTap is false** (the model calls it after a spoken yes). Tap-required actions return an error telling the model to ask the buyer to tap the card |
| `handoff_to_seller(question, reason)` | Creates or appends to an OPEN `HandoffTicket` for this buyer+shop with the question and a transcript excerpt; returns a handoff card |

Optional `requested_attributes` maps buyer-requested variant attributes to free-string values. The registry compares normalized values against variant options and logs `missing: {attribute, value}` or `out_of_stock: true`. Matching ignores case, Vietnamese accents and spacing, and recognizes a small set of Vietnamese and English color and size synonyms; it does not translate arbitrary descriptions.

Execution reuses Phase 1 domain services (cart, checkout with idempotency, returns). Prices,
totals and discounts always come from those services, never from the model.

## 3. Routes

Buyer (role BUYER):

| Method and path | Body / result |
|---|---|
| `GET /assistant/shops/:shopId/profile` (public) | `{ shop_id, shop_name, enabled, voice, greeting: {vi, en} }` |
| `GET /assistant/voices` (public) | `{ voices: string[] }` (from the runtime; static fallback) |
| `POST /assistant/text/sessions` | `{ shop_id, lang?, resume_conversation_id? }` → `{ conversation_id }`; shared chat thread, reusing the voice session events/text/stop paths |
| `GET /assistant/shops/:shopId/conversations` | The buyer's own conversations with the shop (latest 30): `conversation_id, channel, status, started_at, ended_at, preview, message_count` |
| `GET /assistant/conversations/:conversationId` | The buyer's own conversation: `messages` and `cards` rebuilt from stored tool results |
| `POST /assistant/voice/sessions` | `{ shop_id, sdp_offer, lang?, resume_conversation_id? }` → `{ conversation_id, sdp_answer }`. A resumed session is a new conversation whose prompt carries the last 20 messages of the earlier one as context only |
| `POST /assistant/voice/sessions/:conversationId/call` | `{ sdp_offer }` → `{ conversation_id, sdp_answer, call_id }`; attach voice to the existing chat/thread |
| `POST /assistant/voice/sessions/:conversationId/call/stop` | `{ call_id? }` → `{ ok: true }`; stop only audio, retain text chat and call transcripts |
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
eventsUrl}, conversations.{list, get}, actions.{options, edit, confirm, cancel}}`, `client.buyer.messages.{list, unreadCount, get, reply}`,
`client.seller.assistant.{getConfig, updateConfig, faqs.{list, create, update, remove},
conversations.{list, get}}`, `client.seller.inbox.{list, get, reply, close}`.

Public Codex setup at web `/setup/codex` uses `client.assistant.connection.{get, login, cancel}`:
`GET /assistant/connection`, `POST /assistant/connection/login`, and `POST /assistant/connection/login/cancel`.
No marketplace session is required. A browser-owned setup cookie protects the pending code and
cancellation; `busy: true` indicates that another browser is signing in. Public callers cannot
disconnect or replace an already connected account. This is the only app sign-in location; Seller
Centre has no connection card. Seller sign-in/cancellation routes and SDK methods are removed.
Seller-only connection status and disconnect maintenance routes remain protected, and never
return a pending device code.

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
  | { kind: 'product'; item_id: number; name: string; image: string | null; models: Array<{ model_id: number; name: string; price: number; stock: number }>;
      // from get_product_details: what the shop publishes, shown as gallery, specs, description and reviews
      images?: string[]; description?: string; attributes?: Array<{ name: string; value: string }>; brand?: string | null;
      category?: string; rating?: number | null; rating_count?: number; sold?: number; days_to_ship?: number;
      reviews?: Array<{ rating: number; comment: string; buyer_name: string; model_name: string | null }> } // 3 latest, buyer names masked
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

When a tap-confirmed action executes or is cancelled, the bridge speaks the outcome, tells the
realtime voice (`[App]` note) and tells the Codex thread with a silent turn, so neither asks for the
tap again (see `docs/VOICE.md`).

## 5. Voice bridge (backend, `apps/api/src/assistant/voice/`)

Per AGENTS.md section 13 and `docs/VOICE.md`: one long-lived `codex
app-server` child process (private `CODEX_HOME` holding the ChatGPT login connected at
`/setup/codex`, or an existing link to the operator's `~/.codex/auth.json`; never read or logged); per conversation an ephemeral thread started with the
registry's `dynamicTools` and the prompt, then `thread/realtime/start` (v3, WebRTC, configured
voice, `clientManagedHandoffs: true`, so the backend decides what is spoken); `item/tool/call` requests are answered by
`AssistantToolRegistry.run`; transcripts go to `ConversationMessage` and SSE. On by default when
the Codex CLI is installed; with `ASSISTANT_VOICE_ENABLED=false` or no CLI, the voice routes return a
clear `assistant_unavailable` error. Tests use a fake app-server, never the real one.

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
`onAction`, forwards `{type:'action'}` on SSE, and on tap-executed or cancelled actions sends an
`[App]` note to both the realtime voice and the Codex thread. Voice registers its own `VoiceModule` in app.module.ts.

Voice catalog seam: `apps/api/src/assistant/voice-catalog.ts` (core) exports `VoiceCatalogRegistry` (`register(catalog)`, `list()` with static fallback); VoiceModule registers its runtime catalog in `onModuleInit`; seller config validates `voice` through it.

## 7. Seller insights

`GET /api/v1/seller/shops/:shopId/assistant/insights?from&to` requires seller membership. `from` and `to` are inclusive Unix seconds; default is the last 30 days ending now, maximum span 90 days. `POST /api/v1/seller/shops/:shopId/assistant/conversations/:id/summary` requires membership and schedules a summary for an ended conversation; it returns `{ scheduled: boolean }` (false when voice is disabled). SDK: `client.seller.assistant.insights(shopId, range)` and `.summarize(shopId, conversationId)`.

The response is `{ source: 'logs', from, to, totals, top_products, missing_requests, unanswered_questions, daily, campaigns, summaries }`. `totals` contains `conversations`, `voice`, `text`, `handoffs`, `orders_placed`, `returns_opened`; `top_products` rows contain `item_id`, `name`, `count`; `missing_requests` and `unanswered_questions` contain `conversation_id`, `question`, `tool`, `created_at`; `daily` rows contain `date` (UTC), and the totals fields; `campaigns` rows contain `code`, `count`; `summaries` rows contain `conversation_id`, `source: 'model'`, and `summary`. Summary is `{ topics: string[], hesitations: string[], listing_suggestions: Array<{ item_id?: number; text: string }>, language: string, model: string, created_at: number }` or `{ error: string }`.

Definitions (all records belong to selected shop and have their own timestamp in the inclusive range):
- Conversations, voice, text: conversation starts, split by channel.
- Handoffs: tickets created with a conversation.
- Orders placed and returns opened: executed pending actions of the respective type, counted by update time.
- Top products: distinct item IDs per search/details/compare tool call from arguments and structured result, counted once per call; names come from the shop catalog.
- Missing requests: structured requested-attribute misses and matching out-of-stock variants from search/details/cart calls, plus search/details/compare results with zero stock or an empty search and cart calls reporting a missing variation; question is the latest preceding buyer message, if any.
- Unanswered questions: handoff tickets and failed or empty tool results; question is the ticket subject or latest preceding buyer message, respectively.
- Daily: the above total counts grouped by UTC date of each record's relevant timestamp.
- Campaigns: distinct voucher codes per get_vouchers/place_order call, extracted from structured results, counted once per call.
- Summaries: latest stored summaries of conversations started in range, newest first; model wording is distinct from verified log counts.

## 8. Speech resolution and cart action edits

`search_products` compares accent-insensitive name tokens and bounded token edit distance within the
conversation's shop. Multiple matches are returned as candidates, not selected automatically. A single
match includes `resolution` with `resolved_from`, `resolved_to`, and a deterministic lexical confidence;
this is not an estimate of microphone or model confidence. `place_order` resolves a supplied voucher
against active, public, non-exhausted shop codes using spoken Vietnamese/English number normalization
and edit distance at most two; multiple plausible fuzzy matches return candidates and no pending order. Checkout still independently
checks eligibility. Cart and return tool quantities accept integers or unambiguous spoken Vietnamese and
English numbers; invalid words fail validation. The action summary shows spoken quantities and voucher
resolution alongside the exact server-derived details.

`GET /api/v1/assistant/actions/:id/options` and `PATCH /api/v1/assistant/actions/:id` are buyer-session
routes for pending cart additions, updates, orders and returns. Options list only variants of the original shop product, the order's cart lines, or purchased order lines;
the PATCH accepts only `model_id` and `quantity`, rejects client prices, invalidates the previous action
atomically, revalidates stock and price, and creates a new action requiring fresh spoken consent for cart changes, or a fresh on-screen tap for orders and returns. If
revalidation fails after invalidation, the old action remains cancelled and the buyer must prepare it
again. Editing an order card (`line_index` selects the line) changes that cart line, then prepares a new order with the same
address, payment and voucher, which again needs a tap.

## Product page context

The product page shares its public item ID with the shop assistant for both text and voice sessions.
A notice in chat shows the product name and thumbnail: it previews context before starting and
confirms when chat is using it. Context follows navigation within the same shop and clears on
non-product pages or pages belonging to another shop. An active chat remains scoped to its original
shop. History browsing does not display the live-context notice.

The API accepts only a publicly visible product belonging to the session's shop. The
`get_viewed_product` tool reads that server-held ID and fetches fresh product details; the prompt
requires this check for references such as “this product.” The browser cannot supply prices or
instructions as context. Viewing a product never authorizes a cart or order action. Context is
session-local and is not restored from conversation history.
