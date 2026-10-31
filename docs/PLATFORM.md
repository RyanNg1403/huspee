# Platform notes

How the commerce platform fits together, its configuration and its security model. For running the
app see the [README](../README.md); for the API surface see [`PHASE1_ENDPOINTS.md`](../PHASE1_ENDPOINTS.md).

It has three API surfaces over one shared PostgreSQL state:

- **Shopee Open API v2-compatible seller API** (`/api/v2/*`): partner HMAC signing, signed shop
  authorization, opaque per-shop tokens with refresh rotation, products, variants, media, shop
  categories, vouchers, orders, logistics, returns and push. It works with the unmodified
  [`@congminh1254/shopee-sdk`](https://github.com/congminh1254/shopee-sdk).
- **Custom buyer and platform API** (`/api/v1/*`): cookie sessions, cross-shop marketplace, cart,
  checkout, buyer orders, tracking, returns and reviews, seller signup and shop onboarding, the seller
  gateway, and the voice assistant, messages and seller studio routes.
- **Custom signed seller extensions** (`/api/v2/custom/*`): shop policies, sales summary and simulated
  carrier events.

## How the pieces fit

1. **Seller onboarding:** `POST /api/v1/auth/signup` (seller) → `POST /api/v1/seller/shops` →
   `GET /api/v1/seller/shops/:id/authorization-url` returns a backend-signed
   `/api/v2/shop/auth_partner` URL → the seller approves the shop on the consent page → the browser
   lands on `/api/v1/integrations/shopee/callback`, which validates the state cookie and membership,
   exchanges the single-use code and stores the shop's tokens encrypted.
2. **Seller dashboard:** `POST /api/v1/seller/shops/:id/shopee { path, params }` runs any shop-level
   compat/custom operation in-process with the stored token (validated exactly like an external call).
   The browser never sees `partner_key` or tokens.
3. **External integrations / tests:** any client holding the Partner key can use the upstream SDK with
   `base_url: <api>/api/v2` after the same consent flow; each shop gets independent tokens.
4. **Buyers:** cookie-session `/api/v1` routes; orders, stock and vouchers are the same records the
   seller APIs read and mutate.

## Security notes

- Passwords: scrypt. Sessions: random 256-bit tokens, stored as SHA-256, `HttpOnly; SameSite=Lax`
  cookies; state-changing `/api/v1` requests require `X-Requested-With` (CSRF), CORS only for
  `WEB_APP_URL` and `SELLER_APP_URL`, including the `X-Huspee-Surface` header.
- Partner/shop auth: constant-time HMAC verification, ±5 min timestamps, opaque tokens hashed at rest,
  single-use codes and rotating refresh tokens (reuse revokes the family), grant revocation.
- Tenant isolation is enforced in queries (`shopId` / `buyerId` scoping); resources outside scope
  return "not found".
- The seller gateway serialises per-shop token refresh with an in-process lock, so running more than one API instance needs a database-level lock first.
- Not yet in scope: rate limiting, account lockout, email verification, audit logs.

## Configuration

API environment variables; `apps/api/.env.example` has working dev values.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `PORT`, `PUBLIC_BASE_URL` | Listen port and externally visible base URL (used for media URLs and the OAuth callback) |
| `WEB_APP_URL` | Buyer origin (CORS with credentials), default `http://localhost:3001` |
| `SELLER_APP_URL` | Seller origin (CORS and post-consent `/shops/:id` redirect), default `http://localhost:3002` |
| `BROWSER_PROXY_ENABLED` | Relative authorization/media URLs for same-origin proxy/tunnel deployments |
| `COOKIE_SECURE` | `true` in any HTTPS deployment |
| `HUSPEE_PARTNER_ID` | The single platform-managed Partner identity (default `2001001`) |
| `HUSPEE_PARTNER_KEY` | **Secret.** Partner key; referenced by the `PartnerApp.keyRef` DB column, never stored in the DB |
| `HUSPEE_TOKEN_ENCRYPTION_KEY` | **Secret.** 32-byte key (64 hex or base64) encrypting shop tokens held for the seller dashboard |
| `SIGNATURE_MAX_AGE_SECONDS`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `AUTH_CODE_TTL_SECONDS`, `SESSION_TTL_SECONDS` | Security timings (defaults: 300 s, 4 h, 30 d, 10 min, 7 d) |
| `PUSH_DELIVERY_ENABLED` | Deliver outbound push events (default `true`) |
| `HUSPEE_SEED_ON_START` | Docker only: reseed the database on every API start (compose default `true`; it wipes data) |
| `ASSISTANT_VOICE_ENABLED`, `ASSISTANT_CODEX_BIN`, `ASSISTANT_CODEX_HOME`, `ASSISTANT_MAX_VOICE_SESSIONS`, `ASSISTANT_VOICE_TRACE` | Voice assistant; see [`VOICE.md`](VOICE.md) |
| `ASSISTANT_TOOL_DEBUG` | Test-only debug route for assistant tools; never enable outside tests |

Never commit real secrets; `apps/api/.env` is git-ignored and `.env.example` holds dev placeholders.

## Browser session surfaces

`new HuspeeClient({ baseUrl, surface: 'seller' })` is a typed browser-client extension. It sends
`X-Huspee-Surface: seller` on every request and `surface: 'seller'` in login/signup bodies.
Seller signup still uses `account_type: 'seller'`. Omitting the client option keeps all original
method payloads and the buyer/default session behavior, including seller accounts that log in
through that legacy surface. No upstream Shopee SDK method or signed contract changes.

The API chooses `huspee_sid` by default and exclusively `huspee_seller_sid` for the seller header.
Login/signup reject mismatching header/body surfaces; a buyer-only account cannot log in on seller
surface and no session is created. `web_sessions.surface` is authoritative: copying a token to the
other cookie cannot authenticate or revoke that session. Migration
`20261031090000_session_surface` adds the column with BUYER default for all existing records.
`SessionGuard` rejects seller-surface sessions on routes marked `RequireRole('BUYER')`, independently
of account roles; public catalog/voice choices remain available. Logout revokes/clears only its surface.

HTML consent has no SDK headers. It prefers a valid seller cookie, then a legacy session; the form's
CSRF token binds to the exact selected session. Its login creates a seller-surface session. The callback
uses the same preference, validates the existing state cookie and ownership, consumes the single-use
code, and redirects to `SELLER_APP_URL/shops/:id?connected=1` (or `connect_error`).

Both Next.js proxies forward cookies and headers without renaming them. Seller proxy still localizes
absolute authorization URLs when `BROWSER_PROXY_ENABLED=false`, and API/seller redirect origins for
tunnels. With proxy mode enabled, relative URLs continue to work on either app's origin. Configure
API `WEB_APP_URL`/`SELLER_APP_URL` to the two public origins; neither CORS nor the surface header
replaces role or shop ownership checks.
