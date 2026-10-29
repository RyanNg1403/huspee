import { Injectable, Logger } from '@nestjs/common';
import { DomainError, DomainErrorCode } from '../common/errors';
import { randomHex } from '../common/crypto';
import { CompatContext, CompatOperation, ShopeeError } from './compat.types';

const domainToShopee: Record<DomainErrorCode, { error: string; status: number }> = {
  VALIDATION: { error: 'error_param', status: 400 },
  UNAUTHENTICATED: { error: 'error_auth', status: 403 },
  FORBIDDEN: { error: 'error_permission', status: 403 },
  NOT_FOUND: { error: 'error_not_found', status: 404 },
  CONFLICT: { error: 'error_duplicate', status: 409 },
  INVALID_STATE: { error: 'error_invalid_status', status: 400 },
  OUT_OF_STOCK: { error: 'error_stock', status: 400 },
  VOUCHER_INVALID: { error: 'error_param', status: 400 },
};

export interface CompatResult {
  status: number;
  body: Record<string, unknown>;
}

/** Runs a compat operation and produces the Shopee response envelope. Shared by HTTP and gateway. */
@Injectable()
export class CompatDispatcher {
  private readonly logger = new Logger('ShopeeCompat');

  async run(operation: CompatOperation, ctx: CompatContext, rawInput: unknown): Promise<CompatResult> {
    const requestId = randomHex(16);
    try {
      const parsed = operation.input.safeParse(rawInput ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new ShopeeError('error_param', issue ? `Invalid ${issue.path.join('.') || 'request'}: ${issue.message}` : 'Invalid request', 400);
      }
      const result = (await operation.handler(ctx, parsed.data)) ?? {};
      if (operation.envelope === 'flat') {
        return { status: 200, body: { request_id: requestId, error: '', message: '', ...(result as object) } };
      }
      return { status: 200, body: { request_id: requestId, error: '', message: '', response: result } };
    } catch (err) {
      return this.toError(err, requestId);
    }
  }

  toError(err: unknown, requestId = randomHex(16)): CompatResult {
    if (err instanceof ShopeeError) {
      return { status: err.httpStatus, body: { request_id: requestId, error: err.error, message: err.message } };
    }
    if (err instanceof DomainError) {
      const mapped = domainToShopee[err.code];
      const error = typeof err.details?.shopee_error === 'string' ? err.details.shopee_error : mapped.error;
      return { status: mapped.status, body: { request_id: requestId, error, message: err.message } };
    }
    this.logger.error(err instanceof Error ? err.stack : String(err));
    return { status: 500, body: { request_id: requestId, error: 'error_server', message: 'Internal server error' } };
  }
}
