import { HttpStatus } from '@nestjs/common';

/**
 * Domain error raised by shared commerce services. Each API surface maps it to its own
 * envelope: custom routes -> { error: { code, message } }, Shopee-compatible routes ->
 * { error: shopeeCode, message }.
 */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type DomainErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'OUT_OF_STOCK'
  | 'VOUCHER_INVALID';

export const domainHttpStatus: Record<DomainErrorCode, number> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  INVALID_STATE: HttpStatus.CONFLICT,
  OUT_OF_STOCK: HttpStatus.CONFLICT,
  VOUCHER_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
};

export const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} not found`);
export const invalidState = (message: string, details?: Record<string, unknown>) =>
  new DomainError('INVALID_STATE', message, details);
export const validation = (message: string, details?: Record<string, unknown>) =>
  new DomainError('VALIDATION', message, details);
export const forbidden = (message = 'Forbidden') => new DomainError('FORBIDDEN', message);
