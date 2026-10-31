# Web conventions

- Buyer routes belong under `src/app/(buyer)/`; Seller Centre lives in `apps/seller-web/src/app/(seller)/`, without a `/seller` prefix. Keep feature components and messages next to their route.
- Add a feature `messages.ts` with `defineMessages({ vi: {...}, en: {...} })` from `@huspee/web-ui/i18n`. Both languages must have the same keys. Use `useT(messages)` in client components or `await getT(messages)` from `@huspee/web-ui/i18n/server` in server components. Interpolate with `t('key', {name: value})`.
- Prefer `useApi(fn, deps)` from `@huspee/web-ui/lib/use-api` for client requests; it exposes data, error, loading and reload and ignores stale responses. Provide explicit loading, empty, error and success states. Use `getApiClient()` from `@huspee/web-ui/lib/api`; use `errorMessageKey` and `common` for errors.
- UI components in `@huspee/web-ui/components/ui`: Button, Input, Select, Textarea, Card, Badge, Spinner, Skeleton, EmptyState, ErrorState, Pagination, Modal, Tabs, QuantityStepper, Price, Rating, ToastProvider and useToast.
- Seller pages call `useSelectedShop()` from `@/components/layout` and handle loading, error and missing selection. Call `getApiClient().seller.shopee.call(shopId, path, params)` for supported shop operations; inspect the returned error envelope. Call `refresh` on shop context after onboarding changes.
- After cart mutations, dispatch `window.dispatchEvent(new Event('huspee:cart-changed'))` to refresh the header count.
- Use `useSession()` for user state and `RequireRole` for protected routes. Do not import `@huspee/sdk/server` in web code.
- Format prices, dates and counts using `@huspee/web-ui/lib/format`. Preserve responsive layouts and keyboard labels.

- Shared primitives, icons/brand, session/auth, i18n, format/API helpers, assistant cards and base CSS live only in `packages/web-ui`. Import its explicit subpaths; `i18n/server` is the isolated Next server helper. Do not put Node-only code or credentials in this package.
- Each app transpiles `@huspee/web-ui` and includes its sources in Tailwind. Keep feature messages by their route.
- Browser API requests always use the current origin. Buyer proxy strips `huspee_seller_sid`; seller proxy swaps it with upstream `huspee_sid` and strips buyer cookies. Keep all cookie attributes on responses.
- `/seller/:path*` redirects through `src/proxy.ts`, reading `SELLER_APP_URL` at runtime. Header receives the same URL from its server layout. Codex setup stays in this app.
