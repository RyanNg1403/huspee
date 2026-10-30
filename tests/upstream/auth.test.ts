/**
 * UPSTREAM COMPATIBILITY: shop authorization, token exchange/refresh and request signing,
 * exercised through unmodified @congminh1254/shopee-sdk methods plus raw signed HTTP for
 * negative cases.
 */
import { describe, expect, it } from 'vitest';
import { InMemoryTokenStorage } from '@congminh1254/shopee-sdk/storage';
import { ShopeeSDK } from '@congminh1254/shopee-sdk';
import { API, API_V2, PARTNER_ID, PARTNER_KEY, SEED } from '../helpers/env.js';
import { connectUpstream, db, newSellerWithShop, sha256, upstreamSdk } from '../helpers/fixtures.js';
import { approveConsent, authPartnerUrl, Browser, signedCall } from '../helpers/oauth.js';

const apiError = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err as Error & { status?: number; data?: { error: string; message: string } };
  }
  throw new Error('Expected the SDK call to fail');
};

describe('shop authorization (shop.auth_partner)', () => {
  it('signed consent URL -> seller login + shop selection -> redirect with single-use code', async () => {
    const { code, shopId, location } = await approveConsent({
      authUrl: authPartnerUrl(),
      shopId: SEED.sellers.glowup.shopId,
      sellerEmail: SEED.sellers.glowup.email,
    });
    expect(location.origin).toBe('http://localhost:9');
    expect(code).toMatch(/^[0-9a-f]{32}$/);
    expect(shopId).toBe(SEED.sellers.glowup.shopId);
  });

  it('rejects a tampered signature, stale timestamp and unregistered redirect', async () => {
    const tampered = new URL(authPartnerUrl());
    tampered.searchParams.set('sign', '0'.repeat(64));
    expect((await fetch(tampered, { redirect: 'manual' })).status).toBe(403);

    const stale = authPartnerUrl(undefined, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await fetch(stale, { redirect: 'manual' })).status).toBe(403);

    const evil = authPartnerUrl('https://evil.example.com/steal');
    expect((await fetch(evil, { redirect: 'manual' })).status).toBe(400);
  });

  it('a seller cannot approve access to a shop they do not own', async () => {
    const browser = new Browser();
    const start = await browser.fetch(authPartnerUrl());
    const consentUrl = new URL(start.headers.get('location')!, API).toString();
    const loginPage = await (await browser.fetch(consentUrl)).text();
    const requestId = loginPage.match(/name="request_id" value="([^"]+)"/)![1]!;
    await browser.postForm(`${API}/api/v2/shop/auth_partner/login`, {
      request_id: requestId,
      email: SEED.sellers.glowup.email,
      password: 'Password123!',
    });
    const consent = await (await browser.fetch(consentUrl)).text();
    expect(consent).toContain('GlowUp Beauty');
    expect(consent).not.toContain('TechZone Official');
    const csrf = consent.match(/name="csrf" value="([^"]+)"/)![1]!;
    const res = await browser.postForm(`${API}/api/v2/shop/auth_partner/approve`, {
      request_id: requestId,
      csrf,
      shop_id: String(SEED.sellers.techzone.shopId),
      decision: 'approve',
    });
    expect(res.status).toBe(403);
  });

  it('a denied consent redirects with error=access_denied and no code', async () => {
    const { location, code } = await approveConsent({
      authUrl: authPartnerUrl(),
      shopId: SEED.sellers.glowup.shopId,
      sellerEmail: SEED.sellers.glowup.email,
      decision: 'deny',
    });
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(code).toBe('');
  });
});

describe('auth.token.get / auth.access_token.get', () => {
  it('exchanges a code once (authenticateWithCode) and rejects replay', async () => {
    const { code, shopId } = await approveConsent({
      authUrl: authPartnerUrl(),
      shopId: SEED.sellers.nhaXinh.shopId,
      sellerEmail: SEED.sellers.nhaXinh.email,
    });
    const sdk = upstreamSdk();
    const token = await sdk.authenticateWithCode(code, shopId);
    expect(token).toMatchObject({ error: '', shop_id: shopId, expire_in: 14400 });
    expect(token!.access_token).toMatch(/^[0-9a-f]{32}$/);
    expect(token!.refresh_token).toMatch(/^[0-9a-f]{32}$/);

    const info = await sdk.shop.getShopInfo();
    expect(info).toMatchObject({ error: '', shop_name: 'Nhà Xinh Home', region: 'VN', status: 'NORMAL' });

    const replay = await apiError(upstreamSdk().authenticateWithCode(code, shopId));
    expect(replay.data).toMatchObject({ error: 'error_auth', message: 'Code has already been used' });
  });

  it('binds the code to the approved shop_id', async () => {
    const { code } = await approveConsent({ authUrl: authPartnerUrl(), shopId: SEED.sellers.nhaXinh.shopId, sellerEmail: SEED.sellers.nhaXinh.email });
    const err = await apiError(upstreamSdk().authenticateWithCode(code, SEED.sellers.techzone.shopId));
    expect(err.data?.error).toBe('error_auth');
  });

  it('refreshes with single-use rotation; reusing a rotated refresh token revokes the token family', async () => {
    const sdk = await connectUpstream(SEED.sellers.saigonStyle.shopId, SEED.sellers.saigonStyle.email);
    const first = await sdk.getAuthToken();
    const refreshed = await sdk.refreshToken();
    expect(refreshed).toMatchObject({ error: '', shop_id: SEED.sellers.saigonStyle.shopId, partner_id: PARTNER_ID });
    expect(refreshed!.access_token).not.toBe(first!.access_token);
    expect(refreshed!.refresh_token).not.toBe(first!.refresh_token);

    // New token works
    expect((await sdk.shop.getProfile()).response.shop_name).toBe('Saigon Style');

    // Replay of the old refresh token is rejected and revokes the whole family.
    const replay = await signedCall('/auth/access_token/get', {
      method: 'POST',
      body: { refresh_token: first!.refresh_token, partner_id: PARTNER_ID, shop_id: SEED.sellers.saigonStyle.shopId },
    });
    expect(replay.status).toBe(403);
    expect(replay.body.error).toBe('error_param');
    const afterReplay = await signedCall('/shop/get_profile', { accessToken: refreshed!.access_token, shopId: SEED.sellers.saigonStyle.shopId });
    expect(afterReplay.body.error).toBe('invalid_access_token');
  });

  it('concurrent refresh requests with the same refresh token revoke the token family', async () => {
    const seller = await newSellerWithShop();
    const sdk = await connectUpstream(seller.shopId, seller.email);
    const token = (await sdk.getAuthToken())!;

    const [res1, res2] = await Promise.all([
      signedCall('/auth/access_token/get', {
        method: 'POST',
        body: { refresh_token: token.refresh_token, partner_id: PARTNER_ID, shop_id: seller.shopId },
      }),
      signedCall('/auth/access_token/get', {
        method: 'POST',
        body: { refresh_token: token.refresh_token, partner_id: PARTNER_ID, shop_id: seller.shopId },
      }),
    ]);

    const errors = [res1, res2].filter((r) => r.status === 403 && r.body.error === 'error_param');
    expect(errors.length).toBeGreaterThanOrEqual(1);

    const success = [res1, res2].find((r) => r.status === 200);
    if (success) {
      const probe = await signedCall('/shop/get_profile', {
        accessToken: success.body.access_token,
        shopId: seller.shopId,
      });
      expect(probe.body.error).toBe('invalid_access_token');
    }
  });

  it('issues independent tokens per shop for the one shared Partner', async () => {
    const a = await newSellerWithShop();
    const b = await newSellerWithShop();
    const sdkA = await connectUpstream(a.shopId, a.email);
    const sdkB = await connectUpstream(b.shopId, b.email);
    const tokenA = (await sdkA.getAuthToken())!;
    const tokenB = (await sdkB.getAuthToken())!;
    expect(tokenA.access_token).not.toBe(tokenB.access_token);

    // Shop A's token cannot be used for shop B even with a valid signature.
    const crossed = await signedCall('/shop/get_profile', { accessToken: tokenA.access_token, shopId: b.shopId });
    expect(crossed.status).toBe(403);
    expect(crossed.body.error).toBe('invalid_access_token');

    const shops = await upstreamSdk().public.getShopsByPartner({ page_size: 100, page_no: 1 });
    const ids = (shops as unknown as { authed_shop_list: Array<{ shop_id: number }> }).authed_shop_list.map((s) => s.shop_id);
    expect(ids).toEqual(expect.arrayContaining([a.shopId, b.shopId]));
  });

  it('works with a custom TokenStorage per shop (multi-shop server pattern)', async () => {
    const seller = await newSellerWithShop();
    const storage = new InMemoryTokenStorage();
    const sdk = new ShopeeSDK({ partner_id: PARTNER_ID, partner_key: PARTNER_KEY, base_url: API_V2 }, storage);
    const { code } = await approveConsent({ authUrl: authPartnerUrl(), shopId: seller.shopId, sellerEmail: seller.email });
    await sdk.authenticateWithCode(code, seller.shopId);
    expect((await storage.get())?.shop_id).toBe(seller.shopId);
  });
});

describe('request signing and token validation (negative cases)', () => {
  let token: string;
  const shopId = SEED.sellers.techzone.shopId;

  it('setup: authorize TechZone', async () => {
    const sdk = await connectUpstream(shopId, SEED.sellers.techzone.email);
    token = (await sdk.getAuthToken())!.access_token;
    const ok = await signedCall('/shop/get_profile', { accessToken: token, shopId });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ error: '', message: '', response: { shop_name: 'TechZone Official' } });
    expect(ok.body.request_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('wrong sign -> error_sign', async () => {
    const res = await signedCall('/shop/get_profile', { accessToken: token, shopId, sign: 'f'.repeat(64) });
    expect(res).toMatchObject({ status: 403, body: { error: 'error_sign' } });
  });

  it('signature made with another key -> error_sign', async () => {
    const res = await signedCall('/shop/get_profile', { accessToken: token, shopId, key: 'not-the-partner-key' });
    expect(res.body.error).toBe('error_sign');
  });

  it('stale timestamp -> error_param', async () => {
    const res = await signedCall('/shop/get_profile', { accessToken: token, shopId, timestamp: Math.floor(Date.now() / 1000) - 600 });
    expect(res).toMatchObject({ status: 403, body: { error: 'error_param', message: 'Timestamp is expired or invalid' } });
  });

  it('missing access_token on a shop-level API -> error_param', async () => {
    const res = await signedCall('/shop/get_profile', { query: { shop_id: shopId } });
    expect(res).toMatchObject({ status: 400, body: { error: 'error_param', message: 'Missing access_token' } });
  });

  it('unknown partner_id -> error_auth', async () => {
    const res = await signedCall('/shop/get_profile', { accessToken: token, shopId, partnerId: 9999999 });
    expect(res.body.error).toBe('error_auth');
  });

  it('unknown/garbage access token -> invalid_access_token', async () => {
    const res = await signedCall('/shop/get_profile', { accessToken: 'deadbeef'.repeat(4), shopId });
    expect(res).toMatchObject({ status: 403, body: { error: 'invalid_access_token' } });
  });

  it('expired access token -> invalid_access_token', async () => {
    const sdk = await connectUpstream(shopId, SEED.sellers.techzone.email);
    const expiring = (await sdk.getAuthToken())!.access_token;
    await db().query(`UPDATE access_tokens SET expires_at = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE token_hash = $1`, [sha256(expiring)]);
    const res = await signedCall('/shop/get_profile', { accessToken: expiring, shopId });
    expect(res.body.error).toBe('invalid_access_token');
  });

  it('upstream SDK transparently refreshes after invalid_access_token', async () => {
    const sdk = await connectUpstream(shopId, SEED.sellers.techzone.email);
    const before = (await sdk.getAuthToken())!.access_token;
    await db().query(`UPDATE access_tokens SET expires_at = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE token_hash = $1`, [sha256(before)]);
    const profile = await sdk.shop.getProfile();
    expect(profile.response.shop_name).toBe('TechZone Official');
    expect((await sdk.getAuthToken())!.access_token).not.toBe(before);
  });

  it('revoked grant -> tokens stop working', async () => {
    const seller = await newSellerWithShop();
    const sdk = await connectUpstream(seller.shopId, seller.email);
    const t = (await sdk.getAuthToken())!.access_token;
    await seller.client.seller.shops.disconnect(seller.shopId);
    const res = await signedCall('/shop/get_profile', { accessToken: t, shopId: seller.shopId });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('invalid_access_token');
    const shops = await upstreamSdk().public.getShopsByPartner({ page_size: 100, page_no: 1 });
    const ids = (shops as unknown as { authed_shop_list: Array<{ shop_id: number }> }).authed_shop_list.map((s) => s.shop_id);
    expect(ids).not.toContain(seller.shopId);
  });

  it('wrong HTTP method and unknown path follow the error envelope', async () => {
    const wrong = await signedCall('/shop/get_profile', { method: 'POST', accessToken: token, shopId, body: {} });
    expect(wrong).toMatchObject({ status: 405, body: { error: 'error_param' } });
    const unknown = await signedCall('/shop/does_not_exist', { accessToken: token, shopId });
    expect(unknown).toMatchObject({ status: 404, body: { error: 'error_not_found' } });
  });
});
