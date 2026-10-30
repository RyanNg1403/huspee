/**
 * PLATFORM EXTENSIONS: custom session-authenticated identity, seller onboarding, dashboard shop
 * authorization and the trusted seller gateway, via the browser-safe @huspee/sdk client.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { HuspeeApiError, HuspeeClient } from '@huspee/sdk';
import { API, DEMO_PASSWORD, PARTNER_KEY, SEED } from '../helpers/env.js';
import { connectViaDashboard, db, loginAs, newBuyer, newSellerWithShop, sessionClient, uid } from '../helpers/fixtures.js';
import { approveConsent, Browser } from '../helpers/oauth.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const apiError = async (p: Promise<unknown>): Promise<HuspeeApiError> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof HuspeeApiError) return err;
    throw err;
  }
  throw new Error('Expected HuspeeApiError');
};

describe('identity: signup, login, sessions', () => {
  it('signup creates a session; me returns roles; logout ends it', async () => {
    const client = sessionClient();
    const email = `u-${uid()}@test.huspee.vn`;
    const user = await client.auth.signup({ email, password: DEMO_PASSWORD, name: 'Test', account_type: 'seller' });
    expect(user.roles).toEqual(['seller', 'buyer']);
    expect((await client.auth.me()).email).toBe(email);
    await client.auth.logout();
    expect((await apiError(client.auth.me())).status).toBe(401);
  });

  it('rejects duplicate email, wrong password and weak input', async () => {
    const client = sessionClient();
    expect((await apiError(client.auth.signup({ email: SEED.buyers.an.email, password: DEMO_PASSWORD, name: 'Dup' }))).code).toBe('CONFLICT');
    expect((await apiError(client.auth.login(SEED.buyers.an.email, 'wrong-password'))).status).toBe(401);
    const weak = await apiError(client.auth.signup({ email: `w-${uid()}@test.huspee.vn`, password: 'short', name: 'x' }));
    expect(weak).toMatchObject({ status: 400, code: 'VALIDATION' });
  });

  it('session cookie is HttpOnly + SameSite=Lax and state changes require X-Requested-With', async () => {
    const res = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'test' },
      body: JSON.stringify({ email: SEED.buyers.an.email, password: DEMO_PASSWORD }),
    });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('huspee_sid='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const csrf = await fetch(`${API}/api/v1/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookie.split(';')[0]! },
      body: JSON.stringify({ model_id: SEED.items.cocoon.modelId, quantity: 1 }),
    });
    expect(csrf.status).toBe(403);
  });

  it('buyer-only accounts cannot reach seller routes', async () => {
    const { client } = await newBuyer();
    expect((await apiError(client.seller.shops.list())).status).toBe(403);
  });
});

describe('seller onboarding and shop authorization (dashboard flow)', () => {
  let seller: { client: HuspeeClient; email: string; shopId: number };

  beforeAll(async () => {
    seller = await newSellerWithShop();
  });

  it('lists only the seller\'s own shops; other shops look nonexistent', async () => {
    const shops = await seller.client.seller.shops.list();
    expect(shops.map((s) => s.shop_id)).toEqual([seller.shopId]);
    expect(shops[0]!.connection.connected).toBe(false);
    expect((await apiError(seller.client.seller.shops.get(SEED.sellers.techzone.shopId))).status).toBe(404);
    expect((await apiError(seller.client.seller.shops.authorizationUrl(SEED.sellers.techzone.shopId))).status).toBe(404);
  });

  it('authorization URL is backend-signed and never exposes the partner key', async () => {
    const res = await seller.client.seller.shops.authorizationUrl(seller.shopId);
    const url = new URL(res.authorization_url);
    expect(url.pathname).toBe('/api/v2/shop/auth_partner');
    expect(url.searchParams.get('sign')).toMatch(/^[0-9a-f]{64}$/);
    expect(new URL(url.searchParams.get('redirect')!).pathname).toBe('/api/v1/integrations/shopee/callback');
    expect(JSON.stringify(res)).not.toContain(PARTNER_KEY);
  });

  it('callback rejects a missing/forged state', async () => {
    await seller.client.seller.shops.authorizationUrl(seller.shopId);
    const forged = `${API}/api/v1/integrations/shopee/callback?code=abc&shop_id=${seller.shopId}&state=forged`;
    expect((await apiError(seller.client.integrations.completeShopeeCallback(forged))).status).toBe(400);
  });

  it('consent + callback connects the shop; status shows token expiry but no tokens', async () => {
    await connectViaDashboard(seller.client, seller.shopId);
    const status = await seller.client.seller.shops.connectionStatus(seller.shopId);
    expect(status).toMatchObject({ connected: true, grant_status: 'ACTIVE', partner_name: 'Huspee Seller Center' });
    expect(status.access_token_expire_time).toBeGreaterThan(Date.now() / 1000);
    expect(JSON.stringify(status)).not.toMatch(/[0-9a-f]{32}/);
  });

  it('an authorization code is single-use even through the callback', async () => {
    const { authorization_url } = await seller.client.seller.shops.authorizationUrl(seller.shopId);
    const consent = await approveConsent({ authUrl: authorization_url, shopId: seller.shopId, browser: new Browser(seller.client.http.cookieHeader()) });
    expect((await seller.client.integrations.completeShopeeCallback(consent.location.toString())).connected).toBe(true);
    // Replaying the same redirect fails: state cookie consumed and code already used.
    expect((await apiError(seller.client.integrations.completeShopeeCallback(consent.location.toString()))).status).toBe(400);
  });

  it('trusted gateway calls shop-scoped operations with the server-held token', async () => {
    const list = await seller.client.seller.shopee.call<{ total_count: number }>(seller.shopId, '/product/get_item_list', {
      offset: 0,
      page_size: 10,
      item_status: ['NORMAL'],
    });
    expect(list).toMatchObject({ error: '', response: { total_count: 0 } });

    const upload = await seller.client.seller.shopee.uploadImage(seller.shopId, new Blob([PNG], { type: 'image/png' }), 'p.png');
    expect(upload.response!.image_info.image_id).toMatch(/^vn-/);

    const ops = await seller.client.seller.shopee.operations(seller.shopId);
    expect(ops.find((o) => o.path === '/custom/shop/get_policies')?.provenance).toBe('custom-signed');
    expect(ops.find((o) => o.path === '/auth/token/get')).toBeUndefined();

    const bad = await apiError(seller.client.seller.shopee.call(seller.shopId, '/auth/token/get', {}));
    expect(bad.status).toBe(400);
  });

  it('gateway refuses shops the seller is not a member of', async () => {
    const res = await apiError(seller.client.seller.shopee.call(SEED.sellers.techzone.shopId, '/shop/get_profile'));
    expect(res.status).toBe(404);
  });

  it('dashboard summary aggregates shop metrics', async () => {
    const summary = await seller.client.seller.dashboardSummary(seller.shopId);
    expect(summary).toMatchObject({ shop_id: seller.shopId, currency: 'VND', order_count: 0, connection: { connected: true } });
    const techzone = await loginAs(SEED.sellers.techzone.email);
    const tz = await techzone.seller.dashboardSummary(SEED.sellers.techzone.shopId);
    expect(tz.order_count).toBeGreaterThanOrEqual(2);
    expect(tz.low_stock_models.map((m) => m.model_id)).toContain(SEED.items.iphone.blueOutOfStock);
  });

  it('disconnect revokes the grant; gateway then reports error_auth', async () => {
    const res = await seller.client.seller.shops.disconnect(seller.shopId);
    expect(res).toMatchObject({ disconnected: true, connected: false, grant_status: 'REVOKED' });
    const call = await seller.client.seller.shopee.call(seller.shopId, '/shop/get_profile');
    expect(call.error).toBe('error_auth');
  });
});

describe('gateway token refresh', () => {
  it('concurrent calls after access-token expiry refresh once and keep the shop connected', async () => {
    const seller = await newSellerWithShop();
    await connectViaDashboard(seller.client, seller.shopId);
    await db().query(`UPDATE platform_shop_credentials SET access_expires_at = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE shop_id = $1`, [seller.shopId]);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => seller.client.seller.shopee.call(seller.shopId, '/shop/get_profile')),
    );
    expect(results.map((r) => r.error)).toEqual(Array(6).fill(''));
    const status = await seller.client.seller.shops.connectionStatus(seller.shopId);
    expect(status.connected).toBe(true);
    expect(status.access_token_expire_time).toBeGreaterThan(Date.now() / 1000);
    expect((await seller.client.seller.shopee.call(seller.shopId, '/shop/get_profile')).error).toBe('');
  });
});
