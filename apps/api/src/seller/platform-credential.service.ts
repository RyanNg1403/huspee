import { Injectable } from '@nestjs/common';
import { loadConfig } from '../config';
import { decryptSecret, encryptSecret } from '../common/crypto';
import { DomainError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { IssuedTokens, OAuthService } from '../partner/oauth.service';
import { ShopeeError } from '../compat/compat.types';

const REFRESH_SKEW_MS = 60_000;

/**
 * Token custody for the platform's own trusted seller client. Tokens obtained through the
 * standard consent + code exchange are encrypted at rest and refreshed (with rotation) on use.
 * Plaintext tokens never leave the backend.
 */
@Injectable()
export class PlatformCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: OAuthService,
  ) {}

  async store(tokens: IssuedTokens, userId: number): Promise<void> {
    const key = loadConfig().HUSPEE_TOKEN_ENCRYPTION_KEY;
    const data = {
      accessTokenEnc: encryptSecret(key, tokens.access_token),
      refreshTokenEnc: encryptSecret(key, tokens.refresh_token),
      accessExpiresAt: tokens.access_expires_at,
      refreshExpiresAt: tokens.refresh_expires_at,
      connectedByUserId: userId,
    };
    await this.prisma.platformShopCredential.upsert({
      where: { shopId_partnerId: { shopId: tokens.shop_id, partnerId: tokens.partner_id } },
      create: { shopId: tokens.shop_id, partnerId: tokens.partner_id, ...data },
      update: data,
    });
  }

  /** Returns a currently valid access token, refreshing (and rotating) when near expiry. */
  async accessToken(shopId: number, partnerId: number): Promise<string> {
    const cred = await this.prisma.platformShopCredential.findUnique({ where: { shopId_partnerId: { shopId, partnerId } } });
    if (!cred) throw new DomainError('INVALID_STATE', 'Shop is not connected. Authorize the shop first.', { shopee_error: 'error_auth' });
    const key = loadConfig().HUSPEE_TOKEN_ENCRYPTION_KEY;
    if (cred.accessExpiresAt.getTime() - REFRESH_SKEW_MS > Date.now()) return decryptSecret(key, cred.accessTokenEnc);
    try {
      const tokens = await this.oauth.refresh(partnerId, decryptSecret(key, cred.refreshTokenEnc), shopId);
      await this.store(tokens, cred.connectedByUserId);
      return tokens.access_token;
    } catch (err) {
      if (err instanceof ShopeeError) {
        throw new DomainError('INVALID_STATE', 'Shop connection expired or was revoked. Re-authorize the shop.', { shopee_error: 'error_auth' });
      }
      throw err;
    }
  }

  async remove(shopId: number, partnerId: number): Promise<void> {
    await this.prisma.platformShopCredential.deleteMany({ where: { shopId, partnerId } });
  }
}
