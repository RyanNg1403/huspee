import { Injectable } from '@nestjs/common';
import { ShopAuthorization } from '@prisma/client';
import { loadConfig } from '../config';
import { randomHex, randomToken, sha256Hex } from '../common/crypto';
import { DomainError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { addDays, addSeconds } from '../common/time';
import { ShopeeError } from '../compat/compat.types';

const GRANT_TTL_DAYS = 365;
const AUTH_REQUEST_TTL_SECONDS = 15 * 60;

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  access_expires_at: Date;
  refresh_expires_at: Date;
  shop_id: number;
  partner_id: number;
}

/**
 * Shop authorization lifecycle for Partner applications:
 * consent request -> single-use code bound to (partner, shop, redirect) -> opaque access/refresh
 * tokens (stored only as SHA-256 hashes) -> single-use refresh rotation -> revocation.
 */
@Injectable()
export class OAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createAuthRequest(partnerId: number, redirectUri: string) {
    return this.prisma.authRequest.create({
      data: {
        id: randomToken(18),
        partnerId,
        redirectUri,
        expiresAt: addSeconds(new Date(), AUTH_REQUEST_TTL_SECONDS),
      },
    });
  }

  async getOpenAuthRequest(id: string) {
    const request = await this.prisma.authRequest.findUnique({ where: { id }, include: { partner: true } });
    if (!request || request.completedAt || request.expiresAt <= new Date()) return null;
    return request;
  }

  /**
   * Seller approves access for one shop they own. Creates/reactivates the Partner-shop grant and
   * returns the redirect URL carrying a short-lived single-use code and the shop_id.
   */
  async approve(requestId: string, userId: number, shopId: number): Promise<string> {
    const cfg = loadConfig();
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.authRequest.findUnique({ where: { id: requestId } });
      if (!request || request.completedAt || request.expiresAt <= new Date()) {
        throw new DomainError('INVALID_STATE', 'Authorization request expired or already completed');
      }
      const member = await tx.shopMember.findUnique({ where: { userId_shopId: { userId, shopId } } });
      if (!member || member.role !== 'OWNER') throw new DomainError('FORBIDDEN', 'You can only authorize shops you own');
      const shop = await tx.shop.findUnique({ where: { id: shopId } });
      if (!shop || shop.status !== 'NORMAL') throw new DomainError('INVALID_STATE', 'Shop cannot be authorized');

      const completed = await tx.authRequest.updateMany({
        where: { id: requestId, completedAt: null },
        data: { completedAt: new Date() },
      });
      if (completed.count !== 1) throw new DomainError('INVALID_STATE', 'Authorization request already completed');

      const grant = await tx.shopAuthorization.upsert({
        where: { partnerId_shopId: { partnerId: request.partnerId, shopId } },
        create: {
          partnerId: request.partnerId,
          shopId,
          authorizedByUserId: userId,
          expiresAt: addDays(new Date(), GRANT_TTL_DAYS),
        },
        update: {
          status: 'ACTIVE',
          authorizedByUserId: userId,
          authorizedAt: new Date(),
          expiresAt: addDays(new Date(), GRANT_TTL_DAYS),
          revokedAt: null,
        },
      });

      const code = randomHex(16);
      await tx.authCode.create({
        data: {
          codeHash: sha256Hex(code),
          authorizationId: grant.id,
          partnerId: request.partnerId,
          shopId,
          redirectUri: request.redirectUri,
          expiresAt: addSeconds(new Date(), cfg.AUTH_CODE_TTL_SECONDS),
        },
      });

      const url = new URL(request.redirectUri);
      url.searchParams.set('code', code);
      url.searchParams.set('shop_id', String(shopId));
      return url.toString();
    });
  }

  async deny(requestId: string): Promise<string | null> {
    const request = await this.prisma.authRequest.findUnique({ where: { id: requestId } });
    if (!request || request.completedAt) return null;
    await this.prisma.authRequest.update({ where: { id: requestId }, data: { completedAt: new Date() } });
    const url = new URL(request.redirectUri);
    url.searchParams.set('error', 'access_denied');
    return url.toString();
  }

  /** POST /api/v2/auth/token/get */
  async exchangeCode(partnerId: number, code: string, shopId: number | undefined): Promise<IssuedTokens> {
    if (!code) throw new ShopeeError('error_param', 'Missing code', 400);
    if (!shopId) throw new ShopeeError('error_param', 'shop_id is required (main_account_id flow is not supported)', 400);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.authCode.findUnique({
        where: { codeHash: sha256Hex(code) },
        include: { authorization: true },
      });
      if (!record || record.partnerId !== partnerId || record.shopId !== shopId) {
        throw new ShopeeError('error_auth', 'Invalid code', 403);
      }
      if (record.usedAt) throw new ShopeeError('error_auth', 'Code has already been used', 403);
      if (record.expiresAt <= new Date()) throw new ShopeeError('error_auth', 'Code has expired', 403);
      assertGrantUsable(record.authorization);

      const used = await tx.authCode.updateMany({ where: { codeHash: record.codeHash, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new ShopeeError('error_auth', 'Code has already been used', 403);
      return issueTokens(tx, record.authorization);
    });
  }

  /** POST /api/v2/auth/access_token/get — refresh tokens are single-use and rotate. */
  async refresh(partnerId: number, refreshToken: string, shopId: number | undefined): Promise<IssuedTokens> {
    if (!refreshToken) throw new ShopeeError('error_param', 'Missing refresh_token', 400);
    if (!shopId) throw new ShopeeError('error_param', 'shop_id is required (merchant_id flow is not supported)', 400);
    const tokenHash = sha256Hex(refreshToken);

    const result = await this.prisma.$transaction(async (tx) => {
      const record = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { authorization: true },
      });
      if (!record || record.partnerId !== partnerId || record.shopId !== shopId) {
        return { kind: 'error' as const, error: new ShopeeError('error_param', 'Invalid refresh_token', 403) };
      }
      if (record.revokedAt) {
        return { kind: 'error' as const, error: new ShopeeError('error_param', 'refresh_token has been revoked', 403) };
      }
      if (record.usedAt) {
        return { kind: 'compromise' as const, authorizationId: record.authorizationId };
      }
      if (record.expiresAt <= new Date()) {
        return { kind: 'error' as const, error: new ShopeeError('error_param', 'refresh_token has expired', 403) };
      }
      if (record.authorization.status !== 'ACTIVE' || record.authorization.expiresAt <= new Date()) {
        return { kind: 'error' as const, error: new ShopeeError('error_auth', 'Shop authorization has been revoked or expired', 403) };
      }

      const used = await tx.refreshToken.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) {
        return { kind: 'compromise' as const, authorizationId: record.authorizationId };
      }

      const issued = await issueTokens(tx, record.authorization);
      return { kind: 'success' as const, tokens: issued };
    });

    if (result.kind === 'error') {
      throw result.error;
    }
    if (result.kind === 'compromise') {
      // Reuse of a rotated refresh token: treat as compromise and revoke the whole token family.
      await this.prisma.$transaction((tx) => revokeTokens(tx, result.authorizationId));
      throw new ShopeeError('error_param', 'refresh_token has already been used', 403);
    }
    return result.tokens;
  }

  /**
   * Validate an opaque access token for a protected shop-level call. Returns a Shopee error
   * on failure; never trusts shop_id or partner_id without matching the stored token record.
   */
  async validateAccessToken(partnerId: number, shopId: number, accessToken: string): Promise<void> {
    const record = await this.prisma.accessToken.findUnique({
      where: { tokenHash: sha256Hex(accessToken) },
      include: { authorization: { include: { shop: true } } },
    });
    if (!record || record.revokedAt || record.expiresAt <= new Date()) {
      throw new ShopeeError('invalid_access_token', 'Invalid access_token.', 403);
    }
    if (record.partnerId !== partnerId || record.shopId !== shopId) {
      throw new ShopeeError('invalid_access_token', 'Invalid access_token.', 403);
    }
    const grant = record.authorization;
    if (grant.status !== 'ACTIVE' || grant.expiresAt <= new Date()) {
      throw new ShopeeError('error_auth', 'Shop authorization has been revoked or expired', 403);
    }
    if (grant.shop.status !== 'NORMAL') throw new ShopeeError('error_permission', 'Shop is not active', 403);
  }

  async revokeGrant(partnerId: number, shopId: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const grant = await tx.shopAuthorization.findUnique({ where: { partnerId_shopId: { partnerId, shopId } } });
      if (!grant) return false;
      await tx.shopAuthorization.update({ where: { id: grant.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await revokeTokens(tx, grant.id);
      return true;
    });
  }

  async listGrants(partnerId: number, pageNo: number, pageSize: number) {
    const where = { partnerId, status: 'ACTIVE' as const, expiresAt: { gt: new Date() } };
    const [grants, total] = await Promise.all([
      this.prisma.shopAuthorization.findMany({
        where,
        include: { shop: true },
        orderBy: { shopId: 'asc' },
        skip: (pageNo - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.shopAuthorization.count({ where }),
    ]);
    return { grants, more: pageNo * pageSize < total };
  }
}

function assertGrantUsable(grant: ShopAuthorization): void {
  if (grant.status !== 'ACTIVE' || grant.expiresAt <= new Date()) {
    throw new ShopeeError('error_auth', 'Shop authorization has been revoked or expired', 403);
  }
}

type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

async function revokeTokens(tx: TxClient, authorizationId: number): Promise<void> {
  const now = new Date();
  await tx.accessToken.updateMany({ where: { authorizationId, revokedAt: null }, data: { revokedAt: now } });
  await tx.refreshToken.updateMany({ where: { authorizationId, revokedAt: null }, data: { revokedAt: now } });
}

async function issueTokens(tx: TxClient, grant: ShopAuthorization): Promise<IssuedTokens> {
  const cfg = loadConfig();
  const accessToken = randomHex(16);
  const refreshToken = randomHex(16);
  const now = new Date();
  const accessExpiresAt = addSeconds(now, cfg.ACCESS_TOKEN_TTL_SECONDS);
  const refreshExpiresAt = addSeconds(now, cfg.REFRESH_TOKEN_TTL_SECONDS);
  await tx.accessToken.create({
    data: {
      tokenHash: sha256Hex(accessToken),
      authorizationId: grant.id,
      partnerId: grant.partnerId,
      shopId: grant.shopId,
      expiresAt: accessExpiresAt,
    },
  });
  await tx.refreshToken.create({
    data: {
      tokenHash: sha256Hex(refreshToken),
      authorizationId: grant.id,
      partnerId: grant.partnerId,
      shopId: grant.shopId,
      expiresAt: refreshExpiresAt,
    },
  });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expire_in: cfg.ACCESS_TOKEN_TTL_SECONDS,
    access_expires_at: accessExpiresAt,
    refresh_expires_at: refreshExpiresAt,
    shop_id: grant.shopId,
    partner_id: grant.partnerId,
  };
}
