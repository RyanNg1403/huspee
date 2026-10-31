import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { localAuthorizationUrl, localLocation } from '../../packages/web-ui/src/lib/navigation.js';

type Handler = (request: Request) => Promise<Response>;
const { GET: buyerProxy } = await vi.importActual<{ GET: Handler }>('../../apps/web/src/app/api/[...path]/route.ts');
const { GET: sellerProxy } = await vi.importActual<{ GET: Handler }>('../../apps/seller-web/src/app/api/[...path]/route.ts');
const handlers = [['buyer', buyerProxy], ['seller', sellerProxy]] as const;

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api:4001');
  vi.stubEnv('API_PUBLIC_URL', 'http://localhost:4001');
  vi.stubEnv('WEB_APP_URL', 'http://localhost:4201');
  vi.stubEnv('SELLER_APP_URL', 'http://localhost:4202');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(handlers)('%s proxy forwards both cookies, surface and CSRF headers without translation', async (_name, handler) => {
  const cookie = 'huspee_sid=buyer; huspee_seller_sid=seller; huspee_oauth_state=state';
  const upstream = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    expect(headers.get('cookie')).toBe(cookie);
    expect(headers.get('x-huspee-surface')).toBe('seller');
    expect(headers.get('x-requested-with')).toBe('huspee-sdk');
    expect(init?.redirect).toBe('manual');
    return Response.json({ data: { roles: ['seller'] } }, { headers: {
      'set-cookie': 'huspee_seller_sid=value; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800',
    } });
  });
  vi.stubGlobal('fetch', upstream);
  const result = await handler(new Request('http://localhost:4202/api/v1/auth/login', {
    method: 'POST', headers: { cookie, 'x-huspee-surface': 'seller', 'x-requested-with': 'huspee-sdk' }, body: '{}',
  }));
  expect(upstream).toHaveBeenCalledOnce();
  expect(result.headers.getSetCookie()).toEqual(['huspee_seller_sid=value; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800']);
});
it.each(handlers)('%s proxy preserves each Set-Cookie, including deletion, unchanged', async (_name, handler) => {
  const cookies = ['huspee_sid=buyer; Path=/; HttpOnly; SameSite=Lax', 'huspee_seller_sid=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'huspee_oauth_state=state; Path=/api/v1/integrations/shopee/callback'];
  const headers = new Headers();
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { logged_out: true } }, { headers })));
  const result = await handler(new Request('http://localhost:4202/api/v1/auth/logout', { method: 'POST' }));
  expect(result.headers.getSetCookie()).toEqual(cookies);
});
it('leaves buyer-route authorization to the API and preserves its error envelope', async () => {
  const error = { error: { code: 'FORBIDDEN', message: 'Buyer routes require a buyer session' } };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(error, { status: 403 })));
  const result = await sellerProxy(new Request('http://localhost:4202/api/v1/cart', { headers: { 'x-huspee-surface': 'seller' } }));
  expect(result.status).toBe(403);
  expect(await result.json()).toEqual(error);
});
it.each(handlers)('%s proxy never forwards paths outside API/media/health', async (_name, handler) => {
  const upstream = vi.fn();
  vi.stubGlobal('fetch', upstream);
  expect((await handler(new Request('http://localhost:4202/private'))).status).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});
it('keeps API callback redirects on the forwarded seller origin', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://localhost:4202/shops/880001?connected=1' } })));
  const result = await sellerProxy(new Request('https://seller-tunnel.example/api/v1/integrations/shopee/callback?code=demo'));
  expect(result.headers.get('location')).toBe('/shops/880001?connected=1');
});
it.each([
  'http://localhost:4001/api/v2/shop/auth_partner?sign=a%2Bb',
  '/api/v2/shop/auth_partner?sign=a%2Bb',
])('keeps consent local for absolute and tunnel-mode authorization URLs: %s', async (url) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { authorization_url: url, expires_in: 300 } })));
  const result = await sellerProxy(new Request('https://seller-tunnel.example/api/v1/seller/shops/880001/authorization-url'));
  expect(await result.json()).toEqual({ data: { authorization_url: '/api/v2/shop/auth_partner?sign=a%2Bb', expires_in: 300 } });
});
it('localizes only known origins and preserves queries/fragments', () => {
  expect(localLocation('http://api:4001/path?code=x#ok', 'http://api:4001', [])).toBe('/path?code=x#ok');
  expect(localLocation('http://localhost:4202/shops/1?connected=1', 'http://api:4001', ['http://localhost:4202'])).toBe('/shops/1?connected=1');
  expect(localAuthorizationUrl('https://external.example/authorize', 'http://localhost:4001')).toBe('https://external.example/authorize');
  expect(localLocation('http://localhost:4201/setup/codex', 'http://api:4001', ['http://localhost:4202'])).toBe('http://localhost:4201/setup/codex');
});
