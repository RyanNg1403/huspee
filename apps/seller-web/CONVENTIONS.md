# Seller Centre conventions

- Read `../web/CONVENTIONS.md` for shared UI and translation conventions. Site name: Huspee Kênh Người Bán. Preserve the existing interface in U1.
- Protected seller routes live in `src/app/(seller)/`; URLs have no `/seller` prefix. Login/signup are siblings outside the protected layout. SellerShell and selected-shop context are local to this app.
- Shared browser components come from `@huspee/web-ui`; never copy them. Never import `@huspee/sdk/server` or ship Partner credentials.
- Browser API requests use this origin. `lib/proxy-policy.ts` allows seller SDK routes, consent/callback, studio voices and public product/review reads used by cards. New calls require review and a policy test. Buyer actions are blocked even for sellers who also have the buyer role.
- Proxy request cookies discard `huspee_sid`, rename `huspee_seller_sid` to `huspee_sid`, and preserve other cookies. Responses reverse the session name, including logout. Non-seller login is immediately revoked. API remains authoritative for ownership.
- Authorization URLs and known upstream Location origins become local paths. `/seller/:path*` redirects to `/:path*`; `/storefront` and `/setup/codex` redirect to runtime `WEB_APP_URL`.
- Unit/integration tests belong in `tests/web`, UI checks in `tests/ui`. Never start real Codex for frontend tests.
