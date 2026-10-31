import type { WebSessionSurface } from '@prisma/client';
import type { Request } from 'express';
import { DomainError } from '../common/errors';

export type SessionSurface = 'buyer' | 'seller';
export const SESSION_COOKIE = 'huspee_sid';
export const SELLER_SESSION_COOKIE = 'huspee_seller_sid';

export function sessionCookie(surface: SessionSurface): string {
  return surface === 'seller' ? SELLER_SESSION_COOKIE : SESSION_COOKIE;
}

export function dbSurface(surface: SessionSurface): WebSessionSurface {
  return surface === 'seller' ? 'SELLER' : 'BUYER';
}

/** Absence preserves the original Phase 1 browser/SDK contract. */
export function requestSurface(req: Request): SessionSurface {
  const surface = req.get('X-Huspee-Surface');
  if (surface === undefined || surface === 'buyer') return 'buyer';
  if (surface === 'seller') return 'seller';
  throw new DomainError('VALIDATION', 'Invalid X-Huspee-Surface header');
}

/** Login/signup must agree on surface in the body and header. */
export function loginSurface(req: Request, bodySurface?: SessionSurface): SessionSurface {
  const surface = requestSurface(req);
  if (surface !== (bodySurface ?? 'buyer')) throw new DomainError('VALIDATION', 'Session surface does not match request header');
  return surface;
}
