import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HuspeeClient } from '@huspee/sdk';
import { API, DEMO_PASSWORD, SEED } from '../helpers/env.js';
import { db } from '../helpers/fixtures.js';

const SELLER_ORIGIN = process.env.SELLER_APP_URL || 'http://localhost:3002';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
function cookie(header: string | undefined, name: string): string {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}

/** Both typed clients share the SDK's single cookie jar, like two tabs in one browser. */
function clients() {
  const buyer = new HuspeeClient({ baseUrl: API, cookieJar: true });
  let sellerCookies: string[] = [];
  const seller = new HuspeeClient({
    baseUrl: API, surface: 'seller',
    fetch: async (input, init) => {
      const response = await buyer.http.raw(input instanceof Request ? input.url : String(input), init);
      sellerCookies = response.headers.getSetCookie();
      return response;
    },
  });
  return { buyer, seller, sellerCookies: () => sellerCookies };
}
let pair: ReturnType<typeof clients>;
beforeEach(async () => {
  pair = clients();
  await pair.buyer.auth.login(SEED.buyers.an.email, DEMO_PASSWORD);
  await pair.seller.auth.login(SEED.sellers.techzone.email, DEMO_PASSWORD);
});
afterEach(async () => {
  await pair.seller.auth.logout();
  await pair.buyer.auth.logout();
});

function raw(path: string, headers: Record<string, string>, method = 'GET', body?: unknown) {
  return fetch(`${API}${path}`, {
    method, headers: { 'x-requested-with': 'test', 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
  });
}

describe('server-bound session surfaces through typed browser SDK', () => {
  it('keeps two identities and persisted surfaces in a single cookie jar', async () => {
    const header = pair.buyer.http.cookieHeader();
    const buyerToken = cookie(header, 'huspee_sid');
    const sellerToken = cookie(header, 'huspee_seller_sid');
    expect(buyerToken).not.toBe('');
    expect(sellerToken).not.toBe('');
    expect(pair.sellerCookies()).toEqual([expect.stringMatching(/^huspee_seller_sid=.*Path=\/.*HttpOnly.*SameSite=Lax/)]);
    expect((await pair.buyer.auth.me()).email).toBe(SEED.buyers.an.email);
    expect((await pair.seller.auth.me()).email).toBe(SEED.sellers.techzone.email);
    const result = await db().query('SELECT id, surface FROM web_sessions WHERE id = ANY($1::text[])', [[hash(buyerToken), hash(sellerToken)]]);
    expect(result.rows).toEqual(expect.arrayContaining([{ id: hash(buyerToken), surface: 'BUYER' }, { id: hash(sellerToken), surface: 'SELLER' }]));
  });
  it.each([
    ['/api/v1/auth/me', 'seller', 'huspee_sid', 'huspee_sid'],
    ['/api/v1/auth/me', 'buyer', 'huspee_seller_sid', 'huspee_seller_sid'],
    ['/api/v1/auth/me', 'buyer', 'huspee_sid', 'huspee_seller_sid'],
    ['/api/v1/auth/me', 'seller', 'huspee_seller_sid', 'huspee_sid'],
  ])('rejects wrong cookie/surface binding: %s %s %s <- %s', async (path, surface, name, source) => {
    const response = await raw(path, { 'X-Huspee-Surface': surface, cookie: `${name}=${cookie(pair.buyer.http.cookieHeader(), source)}` });
    expect(response.status).toBe(401);
  });
  it.each([
    ['GET', '/api/v1/cart'], ['POST', '/api/v1/cart/items'], ['POST', '/api/v1/checkout'],
    ['POST', '/api/v1/checkout/preview'], ['POST', '/api/v1/shipping/quote'],
    ['GET', '/api/v1/buyer/orders'], ['GET', '/api/v1/buyer/returns'],
    ['GET', '/api/v1/buyer/messages'], ['GET', '/api/v1/buyer/messages/unread-count'],
    ['POST', '/api/v1/assistant/text/sessions'], ['POST', '/api/v1/assistant/voice/sessions'],
    ['GET', '/api/v1/assistant/voice/sessions/unknown/events'],
    ['GET', '/api/v1/assistant/shops/880001/conversations'],
    ['POST', '/api/v1/assistant/actions/unknown/confirm'],
  ])('denies buyer-only %s %s despite seller account having BUYER role', async (method, path) => {
    await expect(pair.seller.http.request(method, path, method === 'POST' ? { body: {} } : {}))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
  it('still permits public voices and product reads from seller surface', async () => {
    expect((await pair.seller.assistant.voices()).voices.length).toBeGreaterThan(0);
    expect((await pair.seller.marketplace.getProduct(SEED.items.buds.itemId)).item_id).toBe(SEED.items.buds.itemId);
  });
  it('rejects a pure buyer seller login before creating a session or changing either cookie', async () => {
    const before = await db().query('SELECT count(*) FROM web_sessions WHERE user_id = $1', [SEED.buyers.an.id]);
    const cookies = pair.buyer.http.cookieHeader();
    await expect(pair.seller.auth.login(SEED.buyers.an.email, DEMO_PASSWORD)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(pair.sellerCookies()).toEqual([]);
    expect(pair.buyer.http.cookieHeader()).toBe(cookies);
    expect((await db().query('SELECT count(*) FROM web_sessions WHERE user_id = $1', [SEED.buyers.an.id])).rows).toEqual(before.rows);
  });
  it('registers a seller through the typed surface option and refuses a buyer signup there', async () => {
    const other = clients();
    await expect(other.seller.auth.signup({ email: `surface-buyer-${randomUUID()}@example.com`, password: DEMO_PASSWORD, name: 'Buyer', account_type: 'buyer' }))
      .rejects.toMatchObject({ status: 403 });
    const user = await other.seller.auth.signup({ email: `surface-seller-${randomUUID()}@example.com`, password: DEMO_PASSWORD, name: 'Seller', account_type: 'seller' });
    expect(user.roles).toContain('seller');
    expect((await other.seller.auth.me()).email).toBe(user.email);
    expect(cookie(other.buyer.http.cookieHeader(), 'huspee_sid')).toBe('');
    await other.seller.auth.logout();
  });
  it.each([
    [{ 'X-Huspee-Surface': 'seller' }, {}],
    [{}, { surface: 'seller' }],
    [{ 'X-Huspee-Surface': 'unknown' }, {}],
  ])('rejects missing/mismatched/unknown surface declarations', async (headers, body) => {
    const response = await raw('/api/v1/auth/login', headers, 'POST', { email: SEED.sellers.techzone.email, password: DEMO_PASSWORD, ...body });
    expect(response.status).toBe(400);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
  it('logs out only the selected surface in either direction', async () => {
    await pair.seller.auth.logout();
    expect(pair.sellerCookies()[0]).toMatch(/^huspee_seller_sid=;.*Expires=Thu, 01 Jan 1970/);
    expect((await pair.buyer.auth.me()).email).toBe(SEED.buyers.an.email);
    await expect(pair.seller.auth.me()).rejects.toMatchObject({ status: 401 });
    await pair.seller.auth.login(SEED.sellers.techzone.email, DEMO_PASSWORD);
    await pair.buyer.auth.logout();
    expect((await pair.seller.auth.me()).email).toBe(SEED.sellers.techzone.email);
    await expect(pair.buyer.auth.me()).rejects.toMatchObject({ status: 401 });
  });
  it('cannot revoke the other surface by copying its token into the logout cookie', async () => {
    const token = cookie(pair.buyer.http.cookieHeader(), 'huspee_seller_sid');
    expect((await raw('/api/v1/auth/logout', { cookie: `huspee_sid=${token}` }, 'POST')).status).toBe(200);
    expect((await pair.seller.auth.me()).email).toBe(SEED.sellers.techzone.email);
  });
  it('preserves legacy seller access and the database default for pre-surface sessions', async () => {
    const legacy = new HuspeeClient({ baseUrl: API, cookieJar: true });
    const user = await legacy.auth.login(SEED.sellers.techzone.email, DEMO_PASSWORD);
    expect(cookie(legacy.http.cookieHeader(), 'huspee_sid')).not.toBe('');
    expect((await legacy.seller.shops.get(880001)).shop_id).toBe(880001);
    const token = randomUUID();
    await db().query('INSERT INTO web_sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')', [hash(token), user.user_id]);
    const response = await raw('/api/v1/auth/me', { cookie: `huspee_sid=${token}` });
    expect(response.status).toBe(200);
    expect((await response.json()).data.email).toBe(user.email);
    await raw('/api/v1/auth/logout', { cookie: `huspee_sid=${token}` }, 'POST');
    await legacy.auth.logout();
  });
  it('keeps ownership checks authoritative for TechZone versus GlowUp', async () => {
    expect((await pair.seller.seller.shops.get(880001)).shop_id).toBe(880001);
    await expect(pair.seller.seller.shops.get(880002)).rejects.toMatchObject({ status: 404 });
  });
});

async function consentFlow(loginOnForm: boolean) {
  const { authorization_url } = await pair.seller.seller.shops.authorizationUrl(880001);
  const first = await pair.buyer.http.raw(authorization_url, { redirect: 'manual' });
  expect(first.status).toBe(302);
  const consentUrl = new URL(first.headers.get('location')!, API).href;
  if (loginOnForm) await pair.seller.auth.logout();
  let html = await (await pair.buyer.http.raw(consentUrl)).text();
  const requestId = new URL(consentUrl).searchParams.get('request_id')!;
  const form = (path: string, fields: Record<string, string>) => pair.buyer.http.raw(`${API}${path}`, {
    method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
  });
  if (loginOnForm) {
    expect(html).toContain('action="/api/v2/shop/auth_partner/login"');
    const login = await form('/api/v2/shop/auth_partner/login', { request_id: requestId, email: SEED.sellers.techzone.email, password: DEMO_PASSWORD });
    expect(login.status).toBe(303);
    expect(login.headers.getSetCookie()[0]).toMatch(/^huspee_seller_sid=/);
    html = await (await pair.buyer.http.raw(consentUrl)).text();
  }
  expect(html).toContain(SEED.sellers.techzone.email);
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  expect(csrf).toBeDefined();
  const approved = await form('/api/v2/shop/auth_partner/approve', { request_id: requestId, csrf: csrf!, shop_id: '880001', decision: 'approve' });
  expect(approved.status).toBe(303);
  const callback = approved.headers.get('location')!;
  const response = await pair.buyer.http.raw(callback, { redirect: 'manual' });
  expect(response.headers.get('location')).toBe(`${SELLER_ORIGIN}/shops/880001?connected=1`);
  expect((await pair.seller.seller.shops.connectionStatus(880001)).connected).toBe(true);
  const replay = await pair.buyer.http.raw(callback, { redirect: 'manual' });
  expect(replay.headers.get('location')).toContain(`${SELLER_ORIGIN}/shops/880001?connect_error=`);
  expect((await pair.buyer.auth.me()).email).toBe(SEED.buyers.an.email);
}

describe('Partner browser consent', () => {
  it('prefers an existing seller cookie over the buyer cookie, through callback and replay protection', () => consentFlow(false));
  it('HTML login creates a seller session and connects without replacing the buyer session', () => consentFlow(true));
  it('falls back to a valid legacy seller session when the seller cookie is expired or invalid', async () => {
    await pair.seller.auth.logout();
    await pair.buyer.auth.login(SEED.sellers.techzone.email, DEMO_PASSWORD);
    const { authorization_url } = await pair.buyer.seller.shops.authorizationUrl(880001);
    const first = await pair.buyer.http.raw(authorization_url, { redirect: 'manual' });
    const consentUrl = new URL(first.headers.get('location')!, API);
    const html = await (await raw(consentUrl.pathname + consentUrl.search, { cookie: `${pair.buyer.http.cookieHeader()}; huspee_seller_sid=invalid` })).text();
    expect(html).toContain('action="/api/v2/shop/auth_partner/approve"');
    expect(html).toContain(SEED.sellers.techzone.email);
  });
  it('does not accept a forged state or a CSRF token from the wrong session', async () => {
    const { authorization_url } = await pair.seller.seller.shops.authorizationUrl(880001);
    const first = await pair.buyer.http.raw(authorization_url, { redirect: 'manual' });
    const consentUrl = new URL(first.headers.get('location')!, API);
    const requestId = consentUrl.searchParams.get('request_id')!;
    const wrongCsrf = hash(`consent:${cookie(pair.buyer.http.cookieHeader(), 'huspee_sid')}:${requestId}`);
    const denied = await pair.buyer.http.raw(`${API}/api/v2/shop/auth_partner/approve`, {
      method: 'POST', body: new URLSearchParams({ request_id: requestId, csrf: wrongCsrf, shop_id: '880001', decision: 'approve' }), redirect: 'manual',
    });
    expect(denied.status).toBe(403);
    const callback = await pair.buyer.http.raw(`${API}/api/v1/integrations/shopee/callback?shop_id=880001&state=forged&code=x`, { redirect: 'manual' });
    expect(callback.headers.get('location')).toContain(`${SELLER_ORIGIN}/shops/880001?connect_error=`);
  });
});

describe('CORS for both browser surfaces', () => {
  it.each(['http://localhost:3001', SELLER_ORIGIN])('allows credentials and the surface header for %s', async (origin) => {
    const response = await fetch(`${API}/api/v1/auth/me`, { method: 'OPTIONS', headers: {
      origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'x-huspee-surface,x-requested-with',
    } });
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-huspee-surface');
  });
  it('does not allow an unrelated origin', async () => {
    const response = await fetch(`${API}/api/v1/auth/me`, { method: 'OPTIONS', headers: { origin: 'https://other.example', 'access-control-request-method': 'GET' } });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
