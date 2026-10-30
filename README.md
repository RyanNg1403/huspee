# Huspee

A simulated Shopee-like marketplace with a buyer storefront, a seller dashboard and a per-shop voice
shopping assistant. Everything runs locally on mock data; no Shopee account or paid API is needed.
Huspee is unaffiliated with Shopee.

## Run it

You need Node 22+, pnpm 10 and PostgreSQL 16 (or Docker).

### Option A: Docker

```bash
docker compose up --build
```

Open http://localhost:3001. The API runs on http://localhost:3000, and the database is migrated and
reset to fresh mock data on every start, so changes do not survive a restart. Compose publishes Postgres on port 5432, so stop any local
Postgres first.

### Option B: local

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # dev defaults; edit DATABASE_URL if needed
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @huspee/sdk build             # the web app uses the built SDK
pnpm db:migrate                             # create tables
pnpm db:seed                                # load mock data (wipes existing data)
```

Then, in two terminals:

```bash
pnpm dev        # API  -> http://localhost:3000
pnpm dev:web    # Web  -> http://localhost:3001
```

`.env.example` expects a `huspee` user with password `huspee` and a `huspee` database on
localhost:5432:

```bash
createuser -s huspee && psql -c "alter user huspee password 'huspee'" postgres && createdb -O huspee huspee
```

To start over with fresh mock data at any time, run `pnpm db:seed` again.

## Mock data

Every account's password is `Password123!`.

| Role | Email | Shop |
|---|---|---|
| Buyer | `an.nguyen@example.com`, `binh.tran@example.com`, `cuong.le@example.com` | |
| Seller | `huy.techzone@example.com` | TechZone Official (electronics) |
| Seller | `lan.glowup@example.com` | GlowUp Beauty (beauty) |
| Seller | `tuan.saigonstyle@example.com` | Saigon Style (fashion) |
| Seller | `trang.nhaxinh@example.com` | Nhà Xinh Home (home and living) |

The seed has 4 shops and 15 products with variants, photos, reviews, vouchers, shipping options, shop
policies, past orders and assistant FAQs. Prices are in VND.

Things to try:

- As a buyer: search, open a product, add to cart, check out, then follow the order under your orders.
- As a seller: sign in, open `/seller/shops` and click Connect, then approve once; this links the
  shop to the platform's API app, as on Shopee. Then see the buyer's order, arrange shipment and
  advance it; the buyer's tracking updates.
- Change stock or price as a seller and watch the storefront update.

## Voice assistant (optional)

Each shop page has an assistant that answers from that shop's data and can add to cart, place orders
and open returns after confirmation. It runs on your own Codex login (`codex-cli 0.166.0`), not an
OpenAI API key.

**Requires a paid ChatGPT plan:** Plus or above (Plus, Pro). Codex voice (`/voice`) is not available on the Free
plan, so the assistant cannot start a voice session with a Free account.

It is off by default; to turn it on, log in with `codex login`, set
`ASSISTANT_VOICE_ENABLED=true` in `apps/api/.env` and restart the API. Each session uses your Codex
subscription. Without it, the rest of the app works normally. Details: [`docs/VOICE.md`](docs/VOICE.md).

## Tests

```bash
pnpm test   # builds, then runs all suites against a reseeded huspee_test database
WEB_URL=http://localhost:3001 API_URL=http://localhost:3000 pnpm smoke:ui   # browser smoke test, needs running servers and installed Chrome
```

The tests start the API on port 3999 and need a Postgres role that can create the `huspee_test`
database (override with `TEST_DATABASE_URL`). No test starts a real Codex session.

## Project layout

```
apps/api       NestJS + Prisma backend (prisma/ has the schema, migrations and seed)
apps/web       Next.js buyer storefront and seller dashboard
packages/sdk   @huspee/sdk: browser client and server-only Shopee-compatible client
tests          upstream SDK, extension and end-to-end suites
docs           design notes
```

## More docs

- [`AGENTS.md`](AGENTS.md): requirements and rules for contributors and coding agents
- [`BRIEF.md`](BRIEF.md): product brief
- [`PHASE1_ENDPOINTS.md`](PHASE1_ENDPOINTS.md): every API route, its auth, SDK method and tests
- [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md): how closely the seller API matches Shopee Open API v2
- [`docs/ASSISTANT.md`](docs/ASSISTANT.md), [`docs/VOICE.md`](docs/VOICE.md), [`docs/EVAL.md`](docs/EVAL.md): voice assistant contract, runtime and evaluation
- [`packages/sdk/README.md`](packages/sdk/README.md): SDK usage and changes from upstream
- [`docs/PLATFORM.md`](docs/PLATFORM.md): how the platform fits together, configuration and security notes
