import type { ZodTypeAny, z } from 'zod';

/**
 * Shopee-compatible operation definition. Every /api/v2 route is declared once here and
 * served by the generic dispatcher, which performs partner signature checks, token/shop
 * authorization and the Shopee response envelope.
 */
export type CompatAuth =
  /** partner_id + path + timestamp signature only (auth/public endpoints) */
  | 'partner'
  /** partner_id + path + timestamp + access_token + shop_id, plus token/grant validation */
  | 'shop';

export interface CompatContext {
  partnerId: number;
  /** Authorized shop for `shop` operations. */
  shopId: number;
  /** `http` for signed external calls, `gateway` for the seller dashboard's trusted in-process calls. */
  via: 'http' | 'gateway';
  files?: Array<{ fieldname: string; buffer: Buffer; mimetype: string; originalname: string; size: number }>;
}

export interface CompatOperation<S extends ZodTypeAny = ZodTypeAny> {
  /** Path below /api/v2, e.g. `/product/get_item_list`. */
  path: string;
  method: 'GET' | 'POST';
  auth: CompatAuth;
  input: S;
  /**
   * `response` (default) wraps the result as { request_id, error, message, response }.
   * `flat` spreads the result at top level, as Shopee does for auth/token and a few shop endpoints.
   */
  envelope?: 'response' | 'flat';
  /** Provenance tag surfaced in docs and the X-Huspee-Provenance header. */
  provenance?: 'shopee-compatible' | 'custom-signed';
  handler: (ctx: CompatContext, input: z.infer<S>) => Promise<unknown>;
}

export interface CompatOperationProvider {
  operations(): CompatOperation[];
}

export function op<S extends ZodTypeAny>(def: CompatOperation<S>): CompatOperation {
  return def as unknown as CompatOperation;
}

/** Shopee-style error. `error` is the machine code returned in the envelope. */
export class ShopeeError extends Error {
  constructor(
    readonly error: string,
    message: string,
    readonly httpStatus = 400,
  ) {
    super(message);
  }
}
