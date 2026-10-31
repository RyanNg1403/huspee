import { HuspeeApiError, HuspeeClient } from '@huspee/sdk';
// Each app sets its surface at build time (seller-web: next.config `env`), so server and browser agree.
const surface = process.env.NEXT_PUBLIC_HUSPEE_SURFACE === 'seller' ? 'seller' : undefined;
let browserClient: HuspeeClient | undefined;
/** Browsers call their own app origin; server renders get a fresh client so no state is shared. */
export function getApiClient() {
  if (typeof window === 'undefined')
    return new HuspeeClient({
      baseUrl: process.env.API_INTERNAL_URL || 'http://127.0.0.1:3000',
      surface,
    });
  return (browserClient ??= new HuspeeClient({ baseUrl: window.location.origin, surface }));
}
export function isApiError(e: unknown): e is HuspeeApiError {
  return e instanceof HuspeeApiError;
}
export function errorMessageKey(
  e: unknown,
): 'unauthorized' | 'forbidden' | 'not_found' | 'validation' | 'conflict' | 'network' | 'unknown' {
  if (!isApiError(e)) return e instanceof TypeError ? 'network' : 'unknown';
  const code = e.code.toLowerCase();
  if (e.status === 401 || code.includes('unauthorized')) return 'unauthorized';
  if (e.status === 403 || code.includes('forbidden')) return 'forbidden';
  if (e.status === 404 || code.includes('not_found')) return 'not_found';
  if (e.status === 409 || code.includes('conflict')) return 'conflict';
  if (e.status === 400 || e.status === 422 || code.includes('validation')) return 'validation';
  return 'unknown';
}
