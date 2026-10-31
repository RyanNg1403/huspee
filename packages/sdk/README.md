# @huspee/sdk

Huspee's extension of the community [`@congminh1254/shopee-sdk`](https://github.com/congminh1254/shopee-sdk).
It has two entry points with deliberately separate trust levels:

| Import | Runtime | Auth transport | Purpose |
|---|---|---|---|
| `@huspee/sdk` | Browser + Node | Cookie session (`credentials: 'include'`, optional in-memory jar for Node) | Typed client for **project-defined** `/api/v1` routes: auth, marketplace, cart, checkout, buyer orders/returns, messages, seller onboarding, seller gateway, voice assistant and seller studio (see `docs/ASSISTANT.md`) |
| `@huspee/sdk/server` | Node only | Shopee HMAC + shop access token | `HuspeeShopeeSDK` (upstream `ShopeeSDK` subclass) + **custom signed** `/api/v2/custom/*` methods |

The browser entry imports no Node built-ins, no upstream SDK and never handles `partner_key` or shop
tokens (enforced by `tests/extensions/signed-client.test.ts`).

## Upstream version and delta

- Upstream dependency pinned to **`@congminh1254/shopee-sdk@2.12.0`** (exact version; review the upstream changelog before bumping and re-run `pnpm test:upstream`).
- **No upstream file is modified or monkey-patched.** `HuspeeShopeeSDK extends ShopeeSDK` and adds only:
  - `custom.shop.getPolicies()`, `custom.shop.updatePolicies(input)`, `custom.shop.getSalesSummary(range)`
  - `custom.logistics.simulateShipmentEvent({ order_sn, event })`
  - `buildAuthPartnerUrl(redirect)` — signed v2 `GET /shop/auth_partner` URL (upstream `getAuthorizationUrl()` targets Shopee's newer unsigned auth page, which Huspee does not implement)
- Standalone helpers: `signShopee`, `buildAuthPartnerUrl`, `verifyPushSignature`, `ShopTokenStore` (+ `createShopClient`) for keeping independent tokens per shop under one shared Partner identity.
- Tests prove every inherited manager method is the upstream function and that request signing through the subclass is byte-identical to upstream.

## Usage

### Browser / storefront (session)

```ts
import { HuspeeClient } from '@huspee/sdk';

const api = new HuspeeClient({ baseUrl: 'http://localhost:3000' });
await api.auth.login('an.nguyen@example.com', 'Password123!');
const { data: products } = await api.marketplace.searchProducts({ q: 'áo thun', sort: 'price_asc' });
const detail = await api.marketplace.getProduct(products[0].item_id);
await api.cart.addItem(detail.models[0].model_id, 1);
const quote = await api.checkout.preview({ address_id: 1, payment_method: 'COD' });
const result = await api.checkout.placeOrder({ address_id: 1 }, { idempotencyKey: crypto.randomUUID() });
```

Seller dashboard operations go through the trusted gateway; the backend signs/validates with the
shop's server-held token:

```ts
const env = await api.seller.shopee.call(880001, '/product/update_stock', {
  item_id: 2000103,
  stock_list: [{ model_id: 0, seller_stock: [{ stock: 50 }] }],
});
if (env.error) throw new Error(env.message);
```

Errors from `/api/v1` routes throw `HuspeeApiError { status, code, message, details }`. Gateway calls
return the Shopee envelope as-is (check `error`).

For Node scripts/tests, pass `cookieJar: true` to keep the session cookie in memory.

Public Codex setup uses `api.assistant.connection.get()`, `.login()` and `.cancel()` without
`api.auth.login()`. These project-owned routes use a separate browser setup cookie for pending
device-code ownership. Account disconnection remains under the seller-only
`api.seller.assistant.connection.disconnect()` maintenance method; seller status never returns a
pending device code. The former seller `.login()` and `.cancel()` methods and routes are removed.
The only app sign-in page is `/setup/codex`. No upstream SDK contracts change. Assistant product-list cards no longer emit or type the old lexical `resolution`/confidence metadata; stored history can still contain extra JSON fields, which the UI ignores. This is a project-owned assistant type change, not a Shopee SDK change.

### Server (signed Shopee-compatible calls)

```ts
import { createShopClient, ShopTokenStore } from '@huspee/sdk/server';

const store = new ShopTokenStore(); // persist encrypted in production
const sdk = createShopClient(
  { partner_id: 2001001, partner_key: process.env.HUSPEE_PARTNER_KEY!, base_url: 'http://localhost:3000/api/v2' },
  store,
  880001,
);
const consentUrl = sdk.buildAuthPartnerUrl('http://localhost:3000/my-callback');
// ... seller approves, your callback receives ?code=&shop_id=
await sdk.authenticateWithCode(code, 880001);

await sdk.product.getItemList({ offset: 0, page_size: 20, item_status: ['NORMAL'] }); // upstream method
await sdk.custom.shop.updatePolicies({ return_window_days: 10 });                    // Huspee extension
```

Product page context: `assistant.text.start` and `assistant.voice.start` accept an optional
`item_id` from the public catalog. `assistant.voice.setContext(conversationId, itemId)` updates
that context for either session type; pass `null` to clear it when leaving the product page.
Only the owning buyer can update an active session, and the item must be public in that shop.

Text → voice → text uses one live conversation:

```ts
const { conversation_id: id } = await api.assistant.text.start({ shop_id: 880002 });
await api.assistant.voice.text(id, 'Does La Roche have a discount?');
// Wait for the reply, then create the browser WebRTC SDP offer.
const call = await api.assistant.voice.startCall(id, sdpOffer);
// Apply call.sdp_answer to the peer connection and talk about Cocoon.
await api.assistant.voice.stopCall(id, call.call_id); // preserves chat and model history
await api.assistant.voice.text(id, 'Compare the two products we discussed.');
await api.assistant.voice.stop(id); // ends the entire conversation
```

Refund evidence extensions are private custom APIs: buyer draft upload/list/delete/content, conversation evidence selection, and submitted-return evidence list/content for authorized shop sellers. Use the surface-aware SDK Blob methods; do not put these bytes through public media or an image optimizer. Evidence metadata contains opaque IDs, size and timestamps, never original filenames or content URLs. Buyer return creation and pending-action edits accept buyer-selected evidence_ids. The agent cannot supply evidence IDs; it receives counts from quotes/readbacks. Cancel-return and accept-offer actions require their own exact final tap. Existing upstream Shopee image response contracts are unchanged.
