/**
 * Test drivers for the Shopee-compatible authorization flow, written against raw HTTP so the
 * upstream suite does not depend on Huspee's SDK extensions.
 */
import { createHmac } from 'node:crypto';
import { API, API_V2, DEMO_PASSWORD, PARTNER_ID, PARTNER_KEY, PARTNER_REDIRECT } from './env.js';

export function sign(parts: Array<string | number>, key = PARTNER_KEY): string {
  return createHmac('sha256', key).update(parts.map(String).join('')).digest('hex');
}

export function authPartnerUrl(redirect = PARTNER_REDIRECT, opts: { timestamp?: number; key?: string; partnerId?: number } = {}): string {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const partnerId = opts.partnerId ?? PARTNER_ID;
  const path = '/api/v2/shop/auth_partner';
  const url = new URL(`${API}${path}`);
  url.searchParams.set('partner_id', String(partnerId));
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', sign([partnerId, path, timestamp], opts.key));
  url.searchParams.set('redirect', redirect);
  return url.toString();
}

/** Minimal cookie-aware fetch for browser-like flows. */
export class Browser {
  private cookies = new Map<string, string>();

  constructor(seed?: string) {
    seed?.split(';').forEach((c) => {
      const [k, ...v] = c.trim().split('=');
      if (k) this.cookies.set(k, v.join('='));
    });
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await fetch(url, { ...init, headers, redirect: 'manual' });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq);
      const value = pair!.slice(eq + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    return res;
  }

  async postForm(url: string, form: Record<string, string>): Promise<Response> {
    return this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
  }
}

function hidden(html: string, name: string): string {
  const match = html.match(new RegExp(`name="${name}" value="([^"]*)"`));
  if (!match) throw new Error(`Hidden field ${name} not found in consent page:\n${html.slice(0, 500)}`);
  return match[1]!;
}

export interface ConsentResult {
  location: URL;
  code: string;
  shopId: number;
}

/**
 * Drive the browser consent flow from a signed auth_partner URL: optional seller login,
 * shop selection and approval. Returns the redirect target with `code` and `shop_id`.
 */
export async function approveConsent(opts: {
  authUrl: string;
  shopId: number;
  sellerEmail?: string;
  password?: string;
  browser?: Browser;
  decision?: 'approve' | 'deny';
}): Promise<ConsentResult> {
  const browser = opts.browser ?? new Browser();
  const start = await browser.fetch(opts.authUrl);
  if (start.status !== 302) throw new Error(`auth_partner returned ${start.status}: ${await start.text()}`);
  const consentUrl = new URL(start.headers.get('location')!, API).toString();
  let page = await browser.fetch(consentUrl);
  let html = await page.text();
  if (html.includes('action="/api/v2/shop/auth_partner/login"')) {
    if (!opts.sellerEmail) throw new Error('Consent requires login but no seller credentials were provided');
    const login = await browser.postForm(`${API}/api/v2/shop/auth_partner/login`, {
      request_id: hidden(html, 'request_id'),
      email: opts.sellerEmail,
      password: opts.password ?? DEMO_PASSWORD,
    });
    if (login.status !== 303) throw new Error(`Consent login failed (${login.status}): ${await login.text()}`);
    page = await browser.fetch(new URL(login.headers.get('location')!, API).toString());
    html = await page.text();
  }
  const approve = await browser.postForm(`${API}/api/v2/shop/auth_partner/approve`, {
    request_id: hidden(html, 'request_id'),
    csrf: hidden(html, 'csrf'),
    shop_id: String(opts.shopId),
    decision: opts.decision ?? 'approve',
  });
  if (approve.status !== 303) throw new Error(`Consent approval failed (${approve.status}): ${await approve.text()}`);
  const location = new URL(approve.headers.get('location')!);
  return { location, code: location.searchParams.get('code') ?? '', shopId: Number(location.searchParams.get('shop_id')) };
}

/** Independent signed HTTP call (bypasses any SDK) for negative/contract assertions. */
export async function signedCall(
  path: string,
  opts: {
    method?: 'GET' | 'POST';
    query?: Record<string, string | number | Array<string | number>>;
    body?: unknown;
    accessToken?: string;
    shopId?: number;
    timestamp?: number;
    sign?: string;
    key?: string;
    partnerId?: number;
  } = {},
): Promise<{ status: number; body: Record<string, any> }> {
  const apiPath = `/api/v2${path}`;
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const partnerId = opts.partnerId ?? PARTNER_ID;
  const parts: Array<string | number> = [partnerId, apiPath, timestamp];
  if (opts.accessToken !== undefined) parts.push(opts.accessToken, opts.shopId ?? '');
  const url = new URL(`${API_V2}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
    else url.searchParams.set(k, String(v));
  }
  url.searchParams.set('partner_id', String(partnerId));
  url.searchParams.set('timestamp', String(timestamp));
  if (opts.accessToken !== undefined) {
    url.searchParams.set('access_token', opts.accessToken);
    url.searchParams.set('shop_id', String(opts.shopId));
  }
  url.searchParams.set('sign', opts.sign ?? sign(parts, opts.key));
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
