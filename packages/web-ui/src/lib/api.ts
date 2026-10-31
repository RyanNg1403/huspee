import { HuspeeApiError, HuspeeClient } from '@huspee/sdk';
let client: HuspeeClient | undefined;
export function getApiClient() {
  return (client ??= new HuspeeClient({
    baseUrl: typeof window === 'undefined' ? 'http://localhost:3001' : window.location.origin,
    // The app's server layout declares its surface before any client component runs.
    surface:
      typeof document !== 'undefined' && document.documentElement.dataset.huspeeSurface === 'seller'
        ? 'seller'
        : undefined,
  }));
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
