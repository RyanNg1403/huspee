import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { HuspeeClient } from '@huspee/sdk';
import { ShopeeSDK } from '@congminh1254/shopee-sdk';
import { API, API_V2, DATABASE_URL, DEMO_PASSWORD, PARTNER_ID, PARTNER_KEY } from './env.js';
import { approveConsent, authPartnerUrl, Browser } from './oauth.js';

export const uid = () => randomBytes(4).toString('hex');

let pool: pg.Pool | undefined;
/** Direct DB access for fixture manipulation only (e.g. forcing token expiry). */
export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: DATABASE_URL.replace('?schema=public', ''), max: 2 });
  return pool;
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function sessionClient(): HuspeeClient {
  return new HuspeeClient({ baseUrl: API, cookieJar: true });
}

export async function loginAs(email: string): Promise<HuspeeClient> {
  const client = sessionClient();
  await client.auth.login(email, DEMO_PASSWORD);
  return client;
}

export async function newBuyer(): Promise<{ client: HuspeeClient; email: string; addressId: number }> {
  const client = sessionClient();
  const email = `buyer-${uid()}@test.huspee.vn`;
  await client.auth.signup({ email, password: DEMO_PASSWORD, name: 'Khách Hàng Test', account_type: 'buyer' });
  const address = await client.buyer.addresses.create({
    name: 'Khách Hàng Test',
    phone: '0909000111',
    state: 'TP. Hồ Chí Minh',
    city: 'TP. Hồ Chí Minh',
    district: 'Quận 10',
    town: 'Phường 12',
    address: '1 Đường Ba Tháng Hai',
  });
  return { client, email, addressId: address.address_id };
}

export async function newSellerWithShop(): Promise<{ client: HuspeeClient; email: string; shopId: number }> {
  const client = sessionClient();
  const email = `seller-${uid()}@test.huspee.vn`;
  await client.auth.signup({ email, password: DEMO_PASSWORD, name: 'Người Bán Test', account_type: 'seller' });
  const shop = await client.seller.shops.create({
    shop_name: `Shop Test ${uid()}`,
    description: 'Shop dùng cho kiểm thử tự động',
    pickup_address: { name: 'Kho Test', phone: '0909000222', state: 'Hà Nội', city: 'Hà Nội', district: 'Quận Ba Đình', address: '1 Hoàng Hoa Thám' },
  });
  return { client, email, shopId: shop.shop_id };
}

/** Upstream SDK client (unmodified ShopeeSDK) pointed at the self-hosted compatible API. */
export function upstreamSdk(): ShopeeSDK {
  return new ShopeeSDK({ partner_id: PARTNER_ID, partner_key: PARTNER_KEY, base_url: API_V2 });
}

/** Authorize a shop for the shared Partner via the consent flow and return an authenticated upstream SDK. */
export async function connectUpstream(shopId: number, sellerEmail: string): Promise<ShopeeSDK> {
  const sdk = upstreamSdk();
  const { code } = await approveConsent({ authUrl: authPartnerUrl(), shopId, sellerEmail });
  await sdk.authenticateWithCode(code, shopId);
  return sdk;
}

/** Seller dashboard flow: backend-signed URL -> consent with the existing session -> callback. */
export async function connectViaDashboard(client: HuspeeClient, shopId: number): Promise<void> {
  const { authorization_url } = await client.seller.shops.authorizationUrl(shopId);
  const browser = new Browser(client.http.cookieHeader());
  const consent = await approveConsent({ authUrl: authorization_url, shopId, browser });
  // The state cookie was set on the client's jar by authorizationUrl(); finish the callback with it.
  const result = await client.integrations.completeShopeeCallback(consent.location.toString());
  if (!result.connected) throw new Error('Dashboard connection failed');
}
