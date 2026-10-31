import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  WEB_APP_URL: z.string().url().default('http://localhost:3001'),
  SELLER_APP_URL: z.string().url().default('http://localhost:3002'),
  // Opt in when Next.js proxies the API and media on the browser's origin.
  BROWSER_PROXY_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  HUSPEE_PARTNER_ID: z.coerce.number().int().positive().default(2001001),
  HUSPEE_TOKEN_ENCRYPTION_KEY: z.string().min(32),
  /** Signature timestamp tolerance (seconds), Shopee uses 5 minutes. */
  SIGNATURE_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(4 * 3600),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(30 * 24 * 3600),
  AUTH_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(7 * 24 * 3600),
  PUSH_DELIVERY_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Partner keys are runtime secrets referenced by name (PartnerApp.keyRef), never stored in the DB. */
export function resolvePartnerKey(keyRef: string): string | undefined {
  const value = process.env[keyRef];
  return value && value.length > 0 ? value : undefined;
}
