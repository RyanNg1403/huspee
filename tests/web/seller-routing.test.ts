import { afterEach, expect, it, vi } from 'vitest';
import { createApiProxy } from '../../packages/web-ui/src/server/api-proxy.js';

type RouteProxy = (request: { nextUrl: URL }) => Response;
const { proxy } = await vi.importActual<{ proxy: RouteProxy }>('../../apps/web/src/proxy.ts');
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(['/seller', '/seller/login?next=%2Forders', '/seller/_next/static/chunk.js', '/seller/products/42?_rsc=test'])(
  'reverse-proxies %s without changing its path or query', (path) => {
    vi.stubEnv('SELLER_INTERNAL_URL', 'http://127.0.0.1:3003');
    const result = proxy({ nextUrl: new URL(path, 'https://shop.example') });
    expect(result.headers.get('x-middleware-rewrite')).toBe(`http://127.0.0.1:3003${path}`);
    expect(result.headers.get('location')).toBeNull();
  },
);
it('retains separate-origin seller redirects when no internal upstream is configured', () => {
  vi.stubEnv('SELLER_INTERNAL_URL', '');
  vi.stubEnv('SELLER_APP_URL', 'https://seller.example');
  expect(proxy({ nextUrl: new URL('https://shop.example/seller/orders?x=1') }).headers.get('location')).toBe('https://seller.example/orders?x=1');
});
it.each(['/healthz', '/api/v1/auth/me', '/media/example'])('seller base path forwards %s to the API root', async (path) => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api:3101');
  const upstream = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json({ ok: true }));
  vi.stubGlobal('fetch', upstream);
  const handler = createApiProxy(() => 'https://shop.example/seller', '/seller');
  await handler(new Request(`https://shop.example/seller${path}?x=1`, { headers: { cookie: 'huspee_sid=buyer; huspee_seller_sid=seller', 'X-Huspee-Surface': 'seller' } }));
  expect(String(upstream.mock.calls[0]![0])).toBe(`http://api:3101${path}?x=1`);
  const headers = new Headers((upstream.mock.calls[0]![1] as RequestInit).headers);
  expect(headers.get('cookie')).toContain('huspee_seller_sid=seller');
  expect(headers.get('x-huspee-surface')).toBe('seller');
});
it('preserves the seller prefix in an authorization callback through the buyer proxy', async () => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api:3101');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://shop.example/seller/shops/1?connected=1' } })));
  const handler = createApiProxy(() => 'https://shop.example');
  const result = await handler(new Request('https://shop.example/api/v1/integrations/shopee/callback?code=example'));
  expect(result.headers.get('location')).toBe('/seller/shops/1?connected=1');
});
