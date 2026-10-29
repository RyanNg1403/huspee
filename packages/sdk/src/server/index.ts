/**
 * @huspee/sdk/server — SERVER-ONLY. Never bundle into browser code: it holds the Partner key
 * and shop access tokens.
 *
 * Extends the upstream `@congminh1254/shopee-sdk` without changing any upstream method:
 *   - `HuspeeShopeeSDK` subclasses `ShopeeSDK`; every inherited manager/method is untouched.
 *   - `sdk.custom.*` adds typed methods for Huspee's project-owned signed seller extensions
 *     (/api/v2/custom/*), which reuse the Shopee access_token + HMAC contract.
 *   - `buildAuthPartnerUrl()` builds the signed v2 `shop/auth_partner` consent URL.
 *   - `ShopTokenStore` keeps independent tokens per shop for one shared Partner identity.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ShopeeSDK, type ShopeeConfig } from '@congminh1254/shopee-sdk';
import type { AccessToken } from '@congminh1254/shopee-sdk/schemas/access-token';
import type { TokenStorage } from '@congminh1254/shopee-sdk/storage';

export { ShopeeSDK };
export type { ShopeeConfig, AccessToken, TokenStorage };

/** hex(HMAC-SHA256(partner_key, parts.join(''))) — Shopee Open API v2 signature. */
export function signShopee(partnerKey: string, parts: Array<string | number>): string {
  return createHmac('sha256', partnerKey).update(parts.map(String).join('')).digest('hex');
}

/** Verify a Huspee/Shopee push: Authorization = hex(HMAC-SHA256(partner_key, url + '|' + body)). */
export function verifyPushSignature(partnerKey: string, callbackUrl: string, rawBody: string, authorization: string | undefined): boolean {
  if (!authorization) return false;
  const expected = Buffer.from(createHmac('sha256', partnerKey).update(`${callbackUrl}|${rawBody}`).digest('hex'));
  const actual = Buffer.from(authorization.trim().toLowerCase());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Build the signed consent URL: GET {apiBase}/shop/auth_partner?partner_id&timestamp&sign&redirect.
 * `apiBase` is the SDK base_url (e.g. http://localhost:3000/api/v2).
 */
export function buildAuthPartnerUrl(opts: { apiBase: string; partnerId: number; partnerKey: string; redirect: string; timestamp?: number }): string {
  const url = new URL(`${opts.apiBase.replace(/\/+$/, '')}/shop/auth_partner`);
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  url.searchParams.set('partner_id', String(opts.partnerId));
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', signShopee(opts.partnerKey, [opts.partnerId, url.pathname, timestamp]));
  url.searchParams.set('redirect', opts.redirect);
  return url.toString();
}

/** Error thrown by custom signed methods (mirrors upstream ShopeeApiError's status/data). */
export class HuspeeShopeeApiError extends Error {
  constructor(
    readonly status: number,
    readonly data: { request_id?: string; error: string; message: string },
  ) {
    super(`${data.error}: ${data.message}`);
    this.name = 'HuspeeShopeeApiError';
  }
}

export interface ShopPolicies {
  shop_id: number;
  version: number;
  shipping_policy: string;
  return_policy: string;
  warranty_policy: string;
  return_window_days: number;
  free_shipping_min_spend: number | null;
  update_time: number;
}

export interface UpdatePoliciesInput {
  shipping_policy?: string;
  return_policy?: string;
  warranty_policy?: string;
  return_window_days?: number;
  free_shipping_min_spend?: number | null;
  /** Optimistic concurrency: fails with error_version_conflict if the stored version differs. */
  expected_version?: number;
}

export interface SalesSummary {
  shop_id: number;
  time_from: number;
  time_to: number;
  currency: string;
  order_count: number;
  order_count_by_status: Record<string, number>;
  paid_order_count: number;
  gross_merchandise_value: number;
  voucher_discount_total: number;
  total_revenue: number;
  refunded_amount: number;
  items_sold: number;
  active_item_count: number;
  to_ship_count: number;
  open_return_count: number;
  low_stock_models: Array<{ item_id: number; item_name: string; model_id: number; stock: number }>;
}

export type ShipmentEvent = 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED';

export interface CustomEnvelope<T> {
  request_id: string;
  error: string;
  message: string;
  response: T;
}

/**
 * ShopeeSDK + Huspee custom signed extensions. Upstream behaviour (paths, payloads,
 * signing, token refresh) is inherited unchanged.
 */
export class HuspeeShopeeSDK extends ShopeeSDK {
  private readonly huspeeConfig: ShopeeConfig;

  constructor(config: ShopeeConfig, tokenStorage?: TokenStorage) {
    super(config, tokenStorage);
    this.huspeeConfig = config;
  }

  /** Signed consent URL for this SDK's partner (uses the configured base_url). */
  buildAuthPartnerUrl(redirect: string): string {
    const cfg = this.getConfig();
    return buildAuthPartnerUrl({ apiBase: cfg.base_url!, partnerId: cfg.partner_id, partnerKey: this.huspeeConfig.partner_key, redirect });
  }

  /** Project-owned signed seller extensions — NOT official Shopee APIs. */
  readonly custom = {
    shop: {
      getPolicies: () => this.signedCall<ShopPolicies>('GET', '/custom/shop/get_policies'),
      updatePolicies: (input: UpdatePoliciesInput) => this.signedCall<ShopPolicies>('POST', '/custom/shop/update_policies', input),
      getSalesSummary: (range: { time_from?: number; time_to?: number } = {}) =>
        this.signedCall<SalesSummary>('GET', '/custom/shop/get_sales_summary', range),
    },
    logistics: {
      /** Simulate carrier progress for a shipped order (pickup, transit, delivery or failure). */
      simulateShipmentEvent: (input: { order_sn: string; event: ShipmentEvent }) =>
        this.signedCall<{ order_sn: string; order_status: string; logistics_status: string; update_time: number }>(
          'POST',
          '/custom/logistics/simulate_shipment_event',
          input,
        ),
    },
  };

  private async signedCall<T>(method: 'GET' | 'POST', path: string, payload: object = {}, retried = false): Promise<CustomEnvelope<T>> {
    const cfg = this.getConfig();
    let token = await this.getAuthToken();
    if (token?.expired_at && token.expired_at < Date.now()) token = await this.refreshToken();
    if (!token || typeof token.shop_id !== 'number') throw new Error('No shop access token available; authenticate first');
    const url = new URL(`${cfg.base_url}${path}`);
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = signShopee(this.huspeeConfig.partner_key, [cfg.partner_id, url.pathname, timestamp, token.access_token, token.shop_id]);
    const query: Record<string, string> = {
      partner_id: String(cfg.partner_id),
      timestamp: String(timestamp),
      access_token: token.access_token,
      shop_id: String(token.shop_id),
      sign,
    };
    if (method === 'GET') {
      for (const [k, v] of Object.entries(payload)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'huspee-sdk-server' },
      body: method === 'POST' ? JSON.stringify(payload) : undefined,
    });
    const body = (await res.json()) as CustomEnvelope<T>;
    if (body.error) {
      if (!retried && (body.error === 'invalid_access_token' || body.error === 'error_auth')) {
        await this.refreshToken();
        return this.signedCall<T>(method, path, payload, true);
      }
      throw new HuspeeShopeeApiError(res.status, body);
    }
    return body;
  }
}

/**
 * In-memory multi-shop token store. One shared Partner identity can hold independent tokens
 * for many shops; `forShop(id)` adapts it to the upstream single-token `TokenStorage`.
 * Persist tokens encrypted in production (the Huspee backend does this itself).
 */
export class ShopTokenStore {
  private readonly tokens = new Map<number, AccessToken>();

  forShop(shopId: number): TokenStorage {
    return {
      store: async (token) => {
        this.tokens.set(shopId, { ...token, shop_id: shopId });
      },
      get: async () => this.tokens.get(shopId) ?? null,
      clear: async () => {
        this.tokens.delete(shopId);
      },
    };
  }

  shopIds(): number[] {
    return [...this.tokens.keys()];
  }
}

/** Convenience: an SDK instance bound to one shop's token slot in a shared store. */
export function createShopClient(config: ShopeeConfig, store: ShopTokenStore, shopId: number): HuspeeShopeeSDK {
  return new HuspeeShopeeSDK({ ...config, shop_id: shopId }, store.forShop(shopId));
}
