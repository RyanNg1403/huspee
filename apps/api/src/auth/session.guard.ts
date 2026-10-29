import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { User, UserRole } from '@prisma/client';
import { DomainError } from '../common/errors';
import { SessionService } from './session.service';

const ROLE_KEY = 'huspee:role';
const PUBLIC_KEY = 'huspee:public';

/** Restrict a route to users holding the given role (in addition to an authenticated session). */
export const RequireRole = (role: UserRole) => SetMetadata(ROLE_KEY, role);
/** Mark a route as reachable without a session (the user is still attached if present). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export type SessionRequest = Request & { user?: User };

/**
 * Cookie-session guard for /api/v1 routes. Also enforces a simple CSRF rule: state-changing
 * requests must carry `X-Requested-With`, which cross-site forms cannot send and cross-origin
 * scripts cannot send without a CORS preflight that only the configured web origin passes.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SessionRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    const role = this.reflector.getAllAndOverride<UserRole | undefined>(ROLE_KEY, [ctx.getHandler(), ctx.getClass()]);

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.get('x-requested-with')) {
      throw new DomainError('FORBIDDEN', 'Missing X-Requested-With header (CSRF protection)');
    }

    const user = await this.sessions.resolve(req);
    if (user) req.user = user;
    if (isPublic) return true;
    if (!user) throw new DomainError('UNAUTHENTICATED', 'Login required');
    if (role && !user.roles.includes(role)) throw new DomainError('FORBIDDEN', `Requires ${role.toLowerCase()} account`);
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<SessionRequest>().user;
});
