import { Injectable } from '@nestjs/common';
import { PartnerApp } from '@prisma/client';
import { loadConfig, resolvePartnerKey } from '../config';
import { constantTimeEqualHex, shopeeSign } from '../common/crypto';
import { PrismaService } from '../common/prisma.service';
import { nowUnix } from '../common/time';
import { ShopeeError } from '../compat/compat.types';

export interface SignatureInput {
  partnerId: unknown;
  timestamp: unknown;
  sign: unknown;
  path: string;
  /** Present for shop-level calls. */
  accessToken?: string;
  shopId?: number;
}

/**
 * Partner application registry and Shopee v2 signature verification.
 * The base string is reconstructed from the received request:
 *   partner-level: partner_id + api_path + timestamp
 *   shop-level:    partner_id + api_path + timestamp + access_token + shop_id
 */
@Injectable()
export class PartnerService {
  constructor(private readonly prisma: PrismaService) {}

  async getPartner(partnerId: number): Promise<{ app: PartnerApp; key: string } | null> {
    const app = await this.prisma.partnerApp.findUnique({ where: { id: partnerId } });
    if (!app) return null;
    const key = resolvePartnerKey(app.keyRef);
    if (!key) return null;
    return { app, key };
  }

  /** Default platform-managed Partner identity (Phase 1 has exactly one). */
  async getPlatformPartner(): Promise<{ app: PartnerApp; key: string }> {
    const partner = await this.getPartner(loadConfig().HUSPEE_PARTNER_ID);
    if (!partner) throw new Error('Platform partner is not configured (seed PartnerApp and set its key secret)');
    return partner;
  }

  async verify(input: SignatureInput): Promise<{ app: PartnerApp; key: string; partnerId: number }> {
    const partnerId = Number(input.partnerId);
    if (input.partnerId === undefined || input.partnerId === '' || !Number.isSafeInteger(partnerId) || partnerId <= 0) {
      throw new ShopeeError('error_param', 'Missing or invalid partner_id', 400);
    }
    const timestamp = Number(input.timestamp);
    if (input.timestamp === undefined || input.timestamp === '' || !Number.isSafeInteger(timestamp)) {
      throw new ShopeeError('error_param', 'Missing or invalid timestamp', 400);
    }
    if (typeof input.sign !== 'string' || input.sign.length === 0) {
      throw new ShopeeError('error_param', 'Missing sign', 400);
    }
    const partner = await this.getPartner(partnerId);
    if (!partner) throw new ShopeeError('error_auth', 'Invalid partner_id', 403);

    const maxAge = loadConfig().SIGNATURE_MAX_AGE_SECONDS;
    if (Math.abs(nowUnix() - timestamp) > maxAge) {
      throw new ShopeeError('error_param', 'Timestamp is expired or invalid', 403);
    }

    const parts: Array<string | number> = [partnerId, input.path, timestamp];
    if (input.accessToken !== undefined) parts.push(input.accessToken, input.shopId ?? '');
    const expected = shopeeSign(partner.key, parts);
    if (!constantTimeEqualHex(expected, input.sign)) throw new ShopeeError('error_sign', 'Wrong sign.', 403);
    return { ...partner, partnerId };
  }

  isRedirectAllowed(app: PartnerApp, redirect: string): boolean {
    let url: URL;
    try {
      url = new URL(redirect);
    } catch {
      return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return app.redirectDomains.some((domain) => {
      const d = domain.toLowerCase();
      if (d.includes(':')) return url.host.toLowerCase() === d;
      return url.hostname.toLowerCase() === d || url.hostname.toLowerCase().endsWith('.' + d);
    });
  }
}
