/**
 * PLATFORM EXTENSIONS: @huspee/sdk/server — custom signed seller extensions and the guarantee
 * that extending the SDK does not alter upstream ShopeeSDK inputs, outputs or signing.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ShopeeSDK } from '@congminh1254/shopee-sdk';
import {
  buildAuthPartnerUrl,
  createShopClient,
  HuspeeShopeeApiError,
  HuspeeShopeeSDK,
  ShopTokenStore,
  signShopee,
  verifyPushSignature,
} from '@huspee/sdk/server';
import { API, API_V2, PARTNER_ID, PARTNER_KEY, PARTNER_REDIRECT, SEED } from '../helpers/env.js';
import { newSellerWithShop } from '../helpers/fixtures.js';
import { approveConsent, signedCall } from '../helpers/oauth.js';

const config = { partner_id: PARTNER_ID, partner_key: PARTNER_KEY, base_url: API_V2 };

async function connectHuspee(store: ShopTokenStore, shopId: number, sellerEmail: string) {
  const sdk = createShopClient(config, store, shopId);
  const { code } = await approveConsent({ authUrl: sdk.buildAuthPartnerUrl(PARTNER_REDIRECT), shopId, sellerEmail });
  await sdk.authenticateWithCode(code, shopId);
  return sdk;
}

describe('upstream contract is preserved by the extension', () => {
  it('inherited managers are the upstream implementations', () => {
    const ours = new HuspeeShopeeSDK(config);
    const upstream = new ShopeeSDK(config);
    expect(ours).toBeInstanceOf(ShopeeSDK);
    for (const manager of ['product', 'order', 'logistics', 'returns', 'voucher', 'shop', 'shopCategory', 'mediaSpace', 'push', 'public', 'auth'] as const) {
      const proto = Object.getPrototypeOf(upstream[manager]);
      for (const method of Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor')) {
        expect((ours[manager] as unknown as Record<string, unknown>)[method]).toBe((upstream[manager] as unknown as Record<string, unknown>)[method]);
      }
    }
    expect(Object.getOwnPropertyNames(HuspeeShopeeSDK.prototype).sort()).toEqual(['buildAuthPartnerUrl', 'constructor', 'signedCall']);
  });

  it('upstream request signing is byte-identical through the subclass', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url!);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ request_id: 'x', error: '', message: '', response: { item: [] } }));
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}/api/v2`;
    const token = { access_token: 'a'.repeat(32), refresh_token: 'b'.repeat(32), expire_in: 14400, request_id: '', error: '', message: '', shop_id: 42 };
    for (const SDK of [ShopeeSDK, HuspeeShopeeSDK]) {
      const sdk = new SDK({ ...config, base_url: base });
      await sdk['tokenStorage'].store(token);
      await sdk.product.getItemList({ offset: 0, page_size: 1, item_status: ['NORMAL'] as never });
    }
    server.close();
    for (const raw of seen) {
      const url = new URL(raw, base);
      const ts = url.searchParams.get('timestamp')!;
      expect(url.searchParams.get('sign')).toBe(signShopee(PARTNER_KEY, [PARTNER_ID, '/api/v2/product/get_item_list', ts, 'a'.repeat(32), 42]));
    }
    expect(seen).toHaveLength(2);
  });

  it('browser entry contains no Node built-ins, upstream SDK or secrets', () => {
    const dist = join(dirname(fileURLToPath(import.meta.url)), '../../packages/sdk/dist');
    for (const file of ['index.js', 'http.js', 'types.js']) {
      const src = readFileSync(join(dist, file), 'utf8');
      expect(src).not.toMatch(/from ['"]node:|require\(|shopee-sdk|partner_key|createHmac/);
    }
  });
});

describe('custom signed seller extensions (/api/v2/custom/*)', () => {
  const store = new ShopTokenStore();
  let sdk: HuspeeShopeeSDK;
  let shopId: number;

  beforeAll(async () => {
    const seller = await newSellerWithShop();
    shopId = seller.shopId;
    sdk = await connectHuspee(store, shopId, seller.email);
  });

  it('get_policies returns the shop default policy', async () => {
    const res = await sdk.custom.shop.getPolicies();
    expect(res).toMatchObject({ error: '', response: { shop_id: shopId, version: 1, return_window_days: 7 } });
  });

  it('update_policies persists, versions and enforces optimistic concurrency', async () => {
    const updated = await sdk.custom.shop.updatePolicies({ return_policy: 'Đổi trả trong 10 ngày.', return_window_days: 10, expected_version: 1 });
    expect(updated.response).toMatchObject({ version: 2, return_window_days: 10, return_policy: 'Đổi trả trong 10 ngày.' });
    await expect(sdk.custom.shop.updatePolicies({ return_window_days: 5, expected_version: 1 })).rejects.toMatchObject({
      data: { error: 'error_version_conflict' },
    });
    // Public marketplace reflects the persisted policy.
    const pub = await fetch(`${API}/api/v1/marketplace/shops/${shopId}/policies`).then((r) => r.json());
    expect(pub.data).toMatchObject({ version: 2, return_window_days: 10 });
  });

  it('get_sales_summary', async () => {
    const res = await sdk.custom.shop.getSalesSummary();
    expect(res.response).toMatchObject({ shop_id: shopId, order_count: 0, currency: 'VND' });
  });

  it('simulate_shipment_event validates state', async () => {
    const err = await sdk.custom.logistics.simulateShipmentEvent({ order_sn: 'NOPE', event: 'PICKED_UP' }).catch((e) => e);
    expect(err).toBeInstanceOf(HuspeeShopeeApiError);
    expect(err.data.error).toBe('error_not_found');
  });

  it('custom routes use the same signature/token checks and are labelled as custom', async () => {
    const token = (await store.forShop(shopId).get())!.access_token;
    const bad = await signedCall('/custom/shop/get_policies', { accessToken: token, shopId, sign: '0'.repeat(64) });
    expect(bad.body.error).toBe('error_sign');
    const crossShop = await signedCall('/custom/shop/get_policies', { accessToken: token, shopId: SEED.sellers.techzone.shopId });
    expect(crossShop.body.error).toBe('invalid_access_token');
    const res = await fetch(new URL(`${API_V2}/custom/shop/get_policies`));
    expect(res.headers.get('x-huspee-provenance')).toBe('custom-signed');
  });

  it('ShopTokenStore keeps independent tokens per shop', async () => {
    const other = await newSellerWithShop();
    const otherSdk = await connectHuspee(store, other.shopId, other.email);
    expect(store.shopIds().sort()).toEqual([shopId, other.shopId].sort());
    expect((await otherSdk.custom.shop.getPolicies()).response.shop_id).toBe(other.shopId);
    expect((await sdk.custom.shop.getPolicies()).response.shop_id).toBe(shopId);
  });
});

describe('helpers', () => {
  it('buildAuthPartnerUrl signs partner_id + path + timestamp', () => {
    const url = new URL(buildAuthPartnerUrl({ apiBase: API_V2, partnerId: PARTNER_ID, partnerKey: PARTNER_KEY, redirect: PARTNER_REDIRECT, timestamp: 1700000000 }));
    expect(url.searchParams.get('sign')).toBe(signShopee(PARTNER_KEY, [PARTNER_ID, '/api/v2/shop/auth_partner', 1700000000]));
  });

  it('verifyPushSignature matches url|body HMAC', () => {
    const body = '{"code":3}';
    const sig = signShopee(PARTNER_KEY, ['http://x/push|', body]);
    expect(verifyPushSignature(PARTNER_KEY, 'http://x/push', body, sig)).toBe(true);
    expect(verifyPushSignature(PARTNER_KEY, 'http://x/push', body + ' ', sig)).toBe(false);
  });
});
