# Web conventions

- Buyer routes belong under `src/app/(buyer)/`; seller routes belong under `src/app/seller/`. Keep feature components and messages next to their route.
- Add a feature `messages.ts` with `defineMessages({ vi: {...}, en: {...} })` from `@/i18n`. Both languages must have the same keys. Use `useT(messages)` in client components or `await getT(messages)` from `@/i18n/server` in server components. Interpolate with `t('key', {name: value})`.
- Prefer `useApi(fn, deps)` from `@/lib/use-api` for client requests; it exposes data, error, loading and reload and ignores stale responses. Provide explicit loading, empty, error and success states. Use `getApiClient()` from `@/lib/api`; use `errorMessageKey` and `common` for errors.
- UI components in `@/components/ui`: Button, Input, Select, Textarea, Card, Badge, Spinner, Skeleton, EmptyState, ErrorState, Pagination, Modal, Tabs, QuantityStepper, Price, Rating, ToastProvider and useToast.
- Seller pages call `useSelectedShop()` from `@/components/layout` and handle loading, error and missing selection. Call `getApiClient().seller.shopee.call(shopId, path, params)` for supported shop operations; inspect the returned error envelope. Call `refresh` on shop context after onboarding changes.
- After cart mutations, dispatch `window.dispatchEvent(new Event('huspee:cart-changed'))` to refresh the header count.
- Use `useSession()` for user state and `RequireRole` for protected routes. Do not import `@huspee/sdk/server` in web code.
- Format prices, dates and counts using `@/lib/format`. Preserve responsive layouts and keyboard labels.
