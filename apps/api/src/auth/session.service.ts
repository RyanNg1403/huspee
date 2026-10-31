import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { User } from '@prisma/client';
import { loadConfig } from '../config';
import { randomToken, sha256Hex } from '../common/crypto';
import { PrismaService } from '../common/prisma.service';
import { addSeconds } from '../common/time';

import { requestSurface, sessionCookie, type SessionSurface } from './session-surface';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, res: Response, surface: SessionSurface = 'buyer'): Promise<void> {
    const cfg = loadConfig();
    const token = randomToken(32);
    const expiresAt = addSeconds(new Date(), cfg.SESSION_TTL_SECONDS);
    await this.prisma.webSession.create({ data: { id: sha256Hex(token), userId, expiresAt, surface: surface === 'seller' ? 'SELLER' : 'BUYER' } });
    res.cookie(sessionCookie(surface), token, {
      httpOnly: true,
      secure: cfg.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  async resolve(req: Request, surface: SessionSurface = requestSurface(req)): Promise<User | null> {
    const token = req.cookies?.[sessionCookie(surface)];
    if (typeof token !== 'string' || token.length === 0) return null;
    const session = await this.prisma.webSession.findUnique({ where: { id: sha256Hex(token) }, include: { user: true } });
    if (!session || session.surface !== (surface === 'seller' ? 'SELLER' : 'BUYER') || session.revokedAt || session.expiresAt <= new Date()) return null;
    return session.user;
  }

  /** HTML navigation has no surface header; bind consent and its CSRF token to the same session. */
  async resolvePartner(req: Request): Promise<{ user: User; surface: SessionSurface } | null> {
    for (const surface of ['seller', 'buyer'] as const) {
      const user = await this.resolve(req, surface);
      if (user) return { user, surface };
    }
    return null;
  }

  async destroy(req: Request, res: Response, surface: SessionSurface = requestSurface(req)): Promise<void> {
    const token = req.cookies?.[sessionCookie(surface)];
    if (typeof token === 'string' && token.length > 0) {
      await this.prisma.webSession.updateMany({ where: { id: sha256Hex(token), surface: surface === 'seller' ? 'SELLER' : 'BUYER', revokedAt: null }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(sessionCookie(surface), { path: '/', httpOnly: true, secure: loadConfig().COOKIE_SECURE, sameSite: 'lax' });
  }
}
