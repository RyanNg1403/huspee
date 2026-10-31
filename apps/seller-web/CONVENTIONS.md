# Seller Centre conventions

- Read `../web/CONVENTIONS.md` for shared UI and translation conventions. Site name: Huspee Kênh Người Bán. Preserve the existing interface in U1.
- Protected seller routes live in `src/app/(seller)/`; URLs have no `/seller` prefix. Login/signup are siblings outside the protected layout. SellerShell and selected-shop context are local to this app.
- Shared browser components come from `@huspee/web-ui`; never copy them. Never import `@huspee/sdk/server` or ship Partner credentials.
- Browser API requests use this origin. Root HTML declares `data-huspee-surface="seller"`; shared `getApiClient()` constructs the typed SDK with `surface: 'seller'`. This adds `X-Huspee-Surface: seller` on every request and the matching login/signup body field.
- Proxies preserve cookies and surface headers. Backend stores the session surface, rejects non-seller login before session creation, and blocks seller sessions on `RequireRole('BUYER')` routes. API ownership checks remain authoritative.
- Authorization URLs from the API public origin become local paths when necessary (`BROWSER_PROXY_ENABLED=false`). Known upstream/API/seller Location origins are localized for tunnels; cookie names are never translated. Callback goes to API `SELLER_APP_URL` at `/shops/:id`.
- `/storefront` and `/setup/codex` redirect to runtime `WEB_APP_URL`. Legacy buyer `/seller/*` links still redirect from the buyer app.
- Proxy tests belong in `tests/web`, session integration tests in `tests/extensions/session-surfaces.test.ts`, UI checks in `tests/ui`. Never start real Codex for frontend tests.
