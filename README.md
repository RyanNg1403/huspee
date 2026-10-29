# Huspee — simulated Shopee-like marketplace (Phase 1)

Self-hosted, stateful multi-shop marketplace backend for the *Autonomous Voice Shopee Agent* hackathon
project. Phase 1 is the **commerce platform only** (no AI/voice). Huspee is unaffiliated with Shopee.

- **Shopee Open API v2-compatible seller API** (`/api/v2/*`): partner HMAC signing, signed shop
  authorization, opaque per-shop tokens with refresh rotation, products/variants/media, shop
  categories, vouchers, orders, logistics, returns and push — usable with the **unmodified**
  [`@congminh1254/shopee-sdk`](https://github.com/congminh1254/shopee-sdk).
- **Custom buyer & platform API** (`/api/v1/*`): cookie sessions, cross-shop marketplace, cart,
  checkout (vouchers, shipping, idempotency), buyer orders/tracking/returns/reviews, seller
  signup/shop onboarding, shop authorization and a trusted seller gateway.
- **Custom signed seller extensions** (`/api/v2/custom/*`): shop policies, sales summary, simulated
  carrier events.
- **`@huspee/sdk`**: browser-safe session client + server-only `HuspeeShopeeSDK` (upstream subclass).
- One shared PostgreSQL state, deterministic Vietnamese seed data (VND), 114 SDK-driven tests.

Docs: [`AGENTS.md`](AGENTS.md) (requirements) · [`PHASE1_ENDPOINTS.md`](PHASE1_ENDPOINTS.md) (endpoint
inventory with status/auth/SDK/tests) · [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) (faithful vs.
approximated vs. unsupported) · [`packages/sdk/README.md`](packages/sdk/README.md) (SDK delta).

## Repository layout

```
apps/api/            NestJS + Prisma backend (modular monolith)
  prisma/            schema, migrations, deterministic seed (seed-data.ts)
  src/compat/        Shopee-compatible dispatcher + operations (ops/*.ts)
  src/partner/       partner signing, consent pages, codes/tokens (OAuthService)
  src/domain/        shared commerce services: catalog, vouchers, orders, logistics, returns, push
  src/auth|buyer|seller|platform/   custom /api/v1 controllers, seller gateway, media
packages/sdk/        @huspee/sdk (browser) and @huspee/sdk/server
tests/               vitest suites: upstream/, extensions/, e2e/ (boot the real API)
docker-compose.yml   PostgreSQL + API
```

## Quick start

Requirements: Node ≥ 22, pnpm 10, PostgreSQL 16 (or Docker).

### Docker Compose

```bash
docker compose up --build
```

The API listens on http://localhost:3000. On start it applies migrations and (by default,
`HUSPEE_SEED_ON_START=true`) loads the demo seed, which **resets all data** — turn it off for
persistent data.

### Local development

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` (database URL, secrets), then:

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

`pnpm db:seed` truncates and reloads the deterministic demo dataset (refuses to run when
`NODE_ENV=production` unless `HUSPEE_ALLOW_SEED_RESET=true`). `pnpm db:reset` runs
`prisma migrate reset` (drops the dev database, then seeds).

### Tests

The suites start the built API on port 3999 against `postgresql://huspee:huspee@localhost:5432/huspee_test`
(override with `TEST_DATABASE_URL`, `TEST_API_PORT`). The role needs `CREATEDB` or the database must
exist. The test database is migrated and **reseeded on every run**.

```bash
pnpm test
```

```bash
pnpm test:upstream
```

`pnpm test` builds first; the per-suite scripts (`test:upstream`, `test:extensions`, `test:e2e`)
expect a prior `pnpm build`.

| Suite | What it proves |
|---|---|
| `tests/upstream` | Unmodified `ShopeeSDK` methods against our server: consent, code exchange/replay, refresh rotation, multi-shop tokens, bad signatures/timestamps/tokens, revocation, products/variants/media, shop categories, vouchers, orders, logistics, returns, push |
| `tests/extensions` | `@huspee/sdk` session client and `@huspee/sdk/server`: identity, CSRF, onboarding, dashboard authorization, gateway, custom signed routes, upstream-contract preservation, browser bundle purity, marketplace, cart, checkout |
| `tests/e2e` | Buyer ↔ seller flows over shared state, tenant isolation, last-unit race, idempotent concurrent checkout, push delivery |

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `PORT`, `PUBLIC_BASE_URL` | Listen port and externally visible base URL (used for media URLs and the OAuth callback) |
| `WEB_APP_URL` | Seller/buyer web app origin (CORS with credentials, post-authorization redirect) |
| `COOKIE_SECURE` | `true` in any HTTPS deployment |
| `HUSPEE_PARTNER_ID` | The single platform-managed Partner identity (default `2001001`) |
| `HUSPEE_PARTNER_KEY` | **Secret.** Partner key; referenced by the `PartnerApp.keyRef` DB column, never stored in the DB |
| `HUSPEE_TOKEN_ENCRYPTION_KEY` | **Secret.** 32-byte key (64 hex or base64) encrypting shop tokens held for the seller dashboard |
| `SIGNATURE_MAX_AGE_SECONDS`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `AUTH_CODE_TTL_SECONDS`, `SESSION_TTL_SECONDS` | Security timings (defaults: 300 s, 4 h, 30 d, 10 min, 7 d) |
| `PUSH_DELIVERY_ENABLED` | Deliver outbound push events (default `true`) |

Never commit real secrets; `apps/api/.env` is git-ignored and `.env.example` holds dev placeholders.

## Demo data

All demo accounts use the password `Password123!`.

| Role | Email | Shop |
|---|---|---|
| Buyer | `an.nguyen@example.com`, `binh.tran@example.com`, `cuong.le@example.com` | — |
| Seller | `huy.techzone@example.com` | 880001 TechZone Official (electronics) |
| Seller | `lan.glowup@example.com` | 880002 GlowUp Beauty (beauty) |
| Seller | `tuan.saigonstyle@example.com` | 880003 Saigon Style (fashion) |
| Seller | `trang.nhaxinh@example.com` | 880004 Nhà Xinh Home (home & living) |

15 products with variants, SVG product images, seeded discount promotions, public/hidden/expired
vouchers, five logistics channels, shop policies, historical completed orders and verified reviews.

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

## Security notes (Phase 1)

- Passwords: scrypt. Sessions: random 256-bit tokens, stored as SHA-256, `HttpOnly; SameSite=Lax`
  cookies; state-changing `/api/v1` requests require `X-Requested-With` (CSRF), CORS only for
  `WEB_APP_URL`.
- Partner/shop auth: constant-time HMAC verification, ±5 min timestamps, opaque tokens hashed at rest,
  single-use codes and rotating refresh tokens (reuse revokes the family), grant revocation.
- Tenant isolation is enforced in queries (`shopId` / `buyerId` scoping); resources outside scope
  return "not found".
- Not yet in scope: rate limiting, account lockout, email verification, audit logs.
