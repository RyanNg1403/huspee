import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { User } from '@prisma/client';
import { loadConfig } from '../config';
import { randomToken, sha256Hex } from '../common/crypto';
import { PrismaService } from '../common/prisma.service';
import { addSeconds } from '../common/time';

export const SESSION_COOKIE = 'huspee_sid';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, res: Response): Promise<void> {
    const cfg = loadConfig();
    const token = randomToken(32);
    const expiresAt = addSeconds(new Date(), cfg.SESSION_TTL_SECONDS);
    await this.prisma.webSession.create({ data: { id: sha256Hex(token), userId, expiresAt } });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: cfg.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  async resolve(req: Request): Promise<User | null> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) return null;
    const session = await this.prisma.webSession.findUnique({ where: { id: sha256Hex(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
    return session.user;
  }

  async destroy(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 0) {
      await this.prisma.webSession.updateMany({ where: { id: sha256Hex(token), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: loadConfig().COOKIE_SECURE, sameSite: 'lax' });
  }
}
