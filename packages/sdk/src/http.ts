/**
 * Browser-safe transport for Huspee custom (/api/v1) routes. Uses cookie sessions:
 * `credentials: 'include'` in browsers, and an optional in-memory cookie jar for Node/tests.
 * Never signs requests with Partner credentials.
 */

export type HuspeeSurface = 'buyer' | 'seller';

export interface HuspeeClientOptions {
  /** Explicit browser surface; omitted preserves the original buyer/default contract. */
  surface?: HuspeeSurface;
  /** API origin, e.g. `http://localhost:3000` (no trailing /api/v1). */
  baseUrl: string;
  /** Custom fetch implementation (defaults to globalThis.fetch). */
  fetch?: typeof fetch;
  /**
   * Keep session cookies in memory and replay them (for Node scripts/tests where the runtime
   * has no browser cookie store). Browsers should leave this off and rely on HttpOnly cookies.
   */
  cookieJar?: boolean;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
}

export class HuspeeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HuspeeApiError';
  }
}

export interface RequestOptions {
  query?: Record<
    string,
    string | number | boolean | Array<string | number | boolean> | undefined | null
  >;
  body?: unknown;
  headers?: Record<string, string>;
  /** Return the full JSON body instead of unwrapping `data`. */
  raw?: boolean;
  /** Do not throw on non-2xx; return the body. */
  allowError?: boolean;
}

export class HttpTransport {
  private readonly cookies = new Map<string, string>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HuspeeClientOptions) {
    const f = options.fetch ?? globalThis.fetch;
    if (!f) throw new Error('No fetch implementation available');
    this.fetchImpl = f.bind(globalThis);
  }

  get surface(): HuspeeSurface | undefined {
    return this.options.surface;
  }

  get baseUrl(): string {
    return this.options.baseUrl.replace(/\/+$/, '');
  }

  url(path: string, query?: RequestOptions['query']): string {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
      }
    }
    return url.toString();
  }

  /** Cookie header for the in-memory jar (useful when following redirects manually in Node). */
  cookieHeader(): string | undefined {
    if (!this.options.cookieJar || this.cookies.size === 0) return undefined;
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** Low-level fetch that applies session cookies and captures Set-Cookie into the jar. */
  async raw(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    for (const [k, v] of Object.entries(this.options.headers ?? {})) if (!headers.has(k)) headers.set(k, v);
    if (this.options.surface) headers.set('X-Huspee-Surface', this.options.surface);
    const cookie = this.cookieHeader();
    if (cookie && !headers.has('cookie')) headers.set('cookie', cookie);
    const res = await this.fetchImpl(url, { credentials: 'include', ...init, headers });
    if (this.options.cookieJar) this.capture(res);
    return res;
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
    let body: BodyInit | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      headers['X-Requested-With'] = 'huspee-sdk';
      if (opts.body instanceof FormData) {
        body = opts.body;
      } else if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body);
      }
    }
    const res = await this.raw(this.url(path, opts.query), { method, headers, body });
    const text = await res.text();
    const json = text ? safeParse(text) : {};
    // `allowError` only tolerates Shopee-style envelopes ({ error: "code" }); platform errors
    // ({ error: { code, message } }) always throw.
    const platformError = typeof (json as { error?: unknown }).error === 'object' && (json as { error?: unknown }).error !== null;
    if (!res.ok && (!opts.allowError || platformError)) {
      const err = (json as { error?: { code?: string; message?: string; details?: unknown } }).error;
      throw new HuspeeApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, err?.details);
    }
    if (opts.raw || opts.allowError) return json as T;
    return (json as { data: T }).data;
  }

  /** Private image bytes: preserve the normal session and surface transport. */
  async blob(path: string): Promise<Blob> {
    const res = await this.raw(this.url(path), { headers: { Accept: 'image/webp' } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
      throw new HuspeeApiError(res.status, body.error?.code ?? 'EVIDENCE_UNAVAILABLE', body.error?.message ?? 'Evidence is unavailable');
    }
    return res.blob();
  }

  private capture(res: Response): void {
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    const list = headers.getSetCookie?.() ?? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
    for (const line of list) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair!.indexOf('=');
      if (eq < 0) continue;
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      const expired = attrs.some((a) => /^\s*expires=/i.test(a) && new Date(a.split('=')[1]!) <= new Date()) || attrs.some((a) => /^\s*max-age=0/i.test(a));
      if (!value || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { code: 'INVALID_JSON', message: text.slice(0, 200) } };
  }
}
