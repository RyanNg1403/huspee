import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { API, DEMO_PASSWORD, SEED } from '../helpers/env.js';

type Handler = (request: Request) => Promise<Response>;
// Load Next source via Vite, preserving each app's bundler resolution rather than NodeNext's.
const { GET: buyerProxy } = await vi.importActual<{ GET: Handler }>('../../apps/web/src/app/api/[...path]/route.ts');
const { GET: sellerProxy } = await vi.importActual<{ GET: Handler }>('../../apps/seller-web/src/app/api/[...path]/route.ts');
function call(proxy: Handler, path: string, cookie = '', method = 'GET', body?: unknown) {
  return proxy(new Request(`http://localhost:4202${path}`, {
    method, headers: { cookie, 'content-type': 'application/json', 'x-requested-with': 'huspee-sdk' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}
function session(response: Response, name: string) {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  expect(cookie).toBeDefined();
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Lax');
  return cookie!.split(';')[0];
}

beforeAll(() => {
  vi.stubEnv('API_INTERNAL_URL', API);
  vi.stubEnv('API_PUBLIC_URL', API);
  vi.stubEnv('WEB_APP_URL', 'http://localhost:3001');
});
afterAll(() => vi.unstubAllEnvs());

describe.sequential('real API through both Next route handlers', () => {
  let buyer = '';
  let seller = '';
  it('issues distinct HttpOnly browser cookies for buyer and seller login', async () => {
    const b = await call(buyerProxy, '/api/v1/auth/login', '', 'POST', { email: SEED.buyers.an.email, password: DEMO_PASSWORD });
    expect(b.status).toBe(200);
    buyer = session(b, 'huspee_sid');
    const s = await call(sellerProxy, '/api/v1/auth/login', '', 'POST', { email: SEED.sellers.techzone.email, password: DEMO_PASSWORD });
    expect(s.status).toBe(200);
    seller = session(s, 'huspee_seller_sid');
    expect(s.headers.getSetCookie().some((cookie) => cookie.startsWith('huspee_sid='))).toBe(false);
  });
  it('selects the correct identity with both cookies, regardless of header order', async () => {
    for (const cookie of [`${buyer}; ${seller}`, `${seller}; ${buyer}`]) {
      const b = await call(buyerProxy, '/api/v1/auth/me', cookie);
      const s = await call(sellerProxy, '/api/v1/auth/me', cookie);
      expect((await b.json()).data.email).toBe(SEED.buyers.an.email);
      expect((await s.json()).data.email).toBe(SEED.sellers.techzone.email);
    }
  });
  it('cannot use the other surface cookie to authenticate', async () => {
    expect((await call(sellerProxy, '/api/v1/auth/me', buyer)).status).toBe(401);
    expect((await call(buyerProxy, '/api/v1/auth/me', seller)).status).toBe(401);
  });
  it('blocks buyer routes even when a seller also has the buyer role', async () => {
    for (const path of ['/api/v1/cart', '/api/v1/checkout', '/api/v1/buyer/orders', '/api/v1/buyer/returns', '/api/v1/buyer/messages', '/api/v1/assistant/text/sessions']) {
      const response = await call(sellerProxy, path, `${buyer}; ${seller}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
  });
  it('revokes a buyer login at Seller Centre and clears only the seller cookie', async () => {
    const response = await call(sellerProxy, '/api/v1/auth/login', '', 'POST', { email: SEED.buyers.an.email, password: DEMO_PASSWORD });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
    expect(session(response, 'huspee_seller_sid')).toBe('huspee_seller_sid=');
    expect(response.headers.get('set-cookie')).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
    expect((await call(buyerProxy, '/api/v1/auth/me', buyer)).status).toBe(200);
  });
  it('preserves API shop ownership checks for TechZone versus GlowUp', async () => {
    expect((await call(sellerProxy, '/api/v1/seller/shops/880001', seller)).status).toBe(200);
    expect((await call(sellerProxy, '/api/v1/seller/shops/880002', seller)).status).toBe(404);
  });
  it('returns the signed consent URL on the seller origin without changing its signature', async () => {
    const response = await call(sellerProxy, '/api/v1/seller/shops/880001/authorization-url', seller);
    expect(response.status).toBe(200);
    const url: string = (await response.json()).data.authorization_url;
    expect(url).toMatch(/^\/api\/v2\/shop\/auth_partner\?/);
    const consent = await call(sellerProxy, url, seller);
    expect(consent.status).toBe(302);
    expect(consent.headers.get('location')).toMatch(/^\/api\/v2\/shop\/auth_partner\/consent\?/);
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('huspee_oauth_state='))).toBe(true);
    const state = response.headers.getSetCookie().find((cookie) => cookie.startsWith('huspee_oauth_state='))!.split(';')[0];
    const consentPath = consent.headers.get('location')!;
    const loginHtml = await (await call(sellerProxy, consentPath, buyer)).text();
    expect(loginHtml).toContain('action="/api/v2/shop/auth_partner/login"');
    const requestId = new URL(consentPath, API).searchParams.get('request_id')!;
    const form = (path: string, cookie: string, values: Record<string, string>) => sellerProxy(new Request(`http://localhost:4202${path}`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
    }));
    const login = await form('/api/v2/shop/auth_partner/login', buyer, {
      request_id: requestId, email: SEED.sellers.techzone.email, password: DEMO_PASSWORD,
    });
    expect(login.status).toBe(303);
    seller = session(login, 'huspee_seller_sid');
    const html = await (await call(sellerProxy, consentPath, `${buyer}; ${seller}`)).text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
    expect(csrf).toBeDefined();
    const approved = await form('/api/v2/shop/auth_partner/approve', `${buyer}; ${seller}`, {
      request_id: requestId, csrf: csrf!, shop_id: '880001', decision: 'approve',
    });
    expect(approved.status).toBe(303);
    const callbackPath = approved.headers.get('location')!;
    expect(callbackPath).toMatch(/^\/api\/v1\/integrations\/shopee\/callback\?/);
    const callback = await call(sellerProxy, callbackPath, `${buyer}; ${seller}; ${state}`);
    expect(callback.headers.get('location')).toBe('/seller/shops/880001?connected=1');
    expect((await (await call(sellerProxy, '/api/v1/seller/shops/880001/connection-status', seller)).json()).data.connected).toBe(true);

  });
  it('seller logout leaves the buyer session alive', async () => {
    const response = await call(sellerProxy, '/api/v1/auth/logout', `${buyer}; ${seller}`, 'POST');
    expect(response.status).toBe(200);
    expect(session(response, 'huspee_seller_sid')).toBe('huspee_seller_sid=');
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith('huspee_sid='))).toBe(false);
    expect((await call(sellerProxy, '/api/v1/auth/me', seller)).status).toBe(401);
    expect((await call(buyerProxy, '/api/v1/auth/me', buyer)).status).toBe(200);
  });
  it('buyer logout leaves a new seller session alive', async () => {
    const response = await call(sellerProxy, '/api/v1/auth/login', '', 'POST', { email: SEED.sellers.techzone.email, password: DEMO_PASSWORD });
    seller = session(response, 'huspee_seller_sid');
    const logout = await call(buyerProxy, '/api/v1/auth/logout', `${buyer}; ${seller}`, 'POST');
    expect(session(logout, 'huspee_sid')).toBe('huspee_sid=');
    expect((await call(sellerProxy, '/api/v1/auth/me', seller)).status).toBe(200);
    await call(sellerProxy, '/api/v1/auth/logout', seller, 'POST');
  });
});
