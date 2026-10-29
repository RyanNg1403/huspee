import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { User } from '@prisma/client';
import { z } from 'zod';
import { loadConfig } from '../config';
import { randomToken, sha256Hex, shopeeSign } from '../common/crypto';
import { DomainError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { nowUnix, unix } from '../common/time';
import { parseInput, q } from '../common/validation';
import { CurrentUser, Public, RequireRole, SessionGuard } from '../auth/session.guard';
import { mediaUrl } from '../domain/catalog.service';
import { DEFAULT_POLICY, ShopService } from '../domain/shop.service';
import { PushService } from '../domain/push.service';
import { OAuthService } from '../partner/oauth.service';
import { PartnerService } from '../partner/partner.service';
import { PlatformCredentialService } from './platform-credential.service';

const STATE_COOKIE = 'huspee_oauth_state';
const CALLBACK_PATH = '/api/v1/integrations/shopee/callback';

const addressSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^(\+84|0)\d{9,10}$/, 'must be a Vietnamese phone number'),
  state: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  town: z.string().trim().max(100).default(''),
  address: z.string().trim().min(1).max(300),
  zipcode: z.string().trim().max(20).default(''),
});

const createShopSchema = z.object({
  shop_name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(3000).default(''),
  logo_url: z.string().url().optional(),
  city: z.string().trim().max(100).optional(),
  pickup_address: addressSchema,
});

/** Seller onboarding (custom, session-authenticated). Only shops the seller is a member of are visible. */
@Controller('api/v1')
@UseGuards(SessionGuard)
export class SellerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopService,
    private readonly partners: PartnerService,
    private readonly oauth: OAuthService,
    private readonly credentials: PlatformCredentialService,
    private readonly push: PushService,
  ) {}

  @Post('seller/shops')
  @RequireRole('SELLER')
  async createShop(@CurrentUser() user: User, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseInput(createShopSchema, body);
    const taken = await this.prisma.shop.findFirst({ where: { name: { equals: input.shop_name, mode: 'insensitive' } } });
    if (taken) throw new DomainError('CONFLICT', 'Shop name is already taken');
    const shop = await this.prisma.shop.create({
      data: {
        name: input.shop_name,
        description: input.description,
        logoUrl: input.logo_url,
        city: input.city ?? input.pickup_address.city,
        members: { create: { userId: user.id, role: 'OWNER' } },
        policy: { create: DEFAULT_POLICY },
        addresses: { create: { ...input.pickup_address, isDefault: true, isPickup: true, isReturn: true } },
      },
    });
    res.status(201);
    return { data: await this.presentShop(shop.id) };
  }

  @Get('seller/shops')
  @RequireRole('SELLER')
  async listShops(@CurrentUser() user: User) {
    const memberships = await this.prisma.shopMember.findMany({ where: { userId: user.id }, orderBy: { shopId: 'asc' } });
    return { data: await Promise.all(memberships.map((m) => this.presentShop(m.shopId, m.role))) };
  }

  @Get('seller/shops/:shopId')
  @RequireRole('SELLER')
  async getShop(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number) {
    await this.shops.assertMember(user.id, shopId);
    const member = await this.prisma.shopMember.findUniqueOrThrow({ where: { userId_shopId: { userId: user.id, shopId } } });
    return { data: await this.presentShop(shopId, member.role) };
  }

  /**
   * Build the backend-signed Shopee-compatible consent URL for the shared platform Partner.
   * A short-lived state cookie binds the eventual callback to this browser and shop.
   */
  @Get('seller/shops/:shopId/authorization-url')
  @RequireRole('SELLER')
  async authorizationUrl(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number, @Res({ passthrough: true }) res: Response) {
    await this.shops.assertMember(user.id, shopId, true);
    const cfg = loadConfig();
    const { app, key } = await this.partners.getPlatformPartner();
    const state = randomToken(18);
    const redirect = `${cfg.PUBLIC_BASE_URL}${CALLBACK_PATH}?state=${encodeURIComponent(state)}`;
    const timestamp = nowUnix();
    const path = '/api/v2/shop/auth_partner';
    const url = new URL(`${cfg.PUBLIC_BASE_URL}${path}`);
    url.searchParams.set('partner_id', String(app.id));
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', shopeeSign(key, [app.id, path, timestamp]));
    url.searchParams.set('redirect', redirect);
    res.cookie(STATE_COOKIE, `${shopId}.${sha256Hex(state)}`, {
      httpOnly: true,
      secure: cfg.COOKIE_SECURE,
      sameSite: 'lax',
      path: CALLBACK_PATH,
      maxAge: 15 * 60 * 1000,
    });
    return { data: { authorization_url: url.toString(), partner_id: app.id, expires_in: cfg.SIGNATURE_MAX_AGE_SECONDS } };
  }

  /**
   * Browser redirect target after consent. Validates the state cookie, the shop membership and
   * the shop_id bound to the code, then exchanges the single-use code in-process and stores
   * the resulting tokens encrypted for the platform's trusted client.
   */
  @Get('integrations/shopee/callback')
  @Public()
  async callback(@Req() req: Request & { user?: User }, @Query() query: Record<string, string>, @Res() res: Response) {
    const cfg = loadConfig();
    const wantsJson = (req.get('accept') ?? '').includes('application/json');
    const finish = (status: number, payload: { connected: boolean; shop_id?: number; error?: string }) => {
      res.clearCookie(STATE_COOKIE, { path: CALLBACK_PATH });
      if (wantsJson) {
        res.status(status).json(payload.connected ? { data: payload } : { error: { code: 'AUTHORIZATION_FAILED', message: payload.error } });
        return;
      }
      const target = new URL(`${cfg.WEB_APP_URL}/seller/shops/${payload.shop_id ?? ''}`);
      target.searchParams.set(payload.connected ? 'connected' : 'connect_error', payload.connected ? '1' : (payload.error ?? 'failed'));
      res.redirect(302, target.toString());
    };

    const user = req.user;
    if (!user) return finish(401, { connected: false, error: 'Login required' });
    if (query.error) return finish(400, { connected: false, error: query.error });
    const shopId = Number(query.shop_id);
    const [cookieShop, cookieHash] = String(req.cookies?.[STATE_COOKIE] ?? '').split('.');
    if (!query.state || !cookieHash || sha256Hex(query.state) !== cookieHash || Number(cookieShop) !== shopId) {
      return finish(400, { connected: false, shop_id: shopId || undefined, error: 'Invalid or expired state' });
    }
    try {
      await this.shops.assertMember(user.id, shopId, true);
      const { app } = await this.partners.getPlatformPartner();
      const tokens = await this.oauth.exchangeCode(app.id, String(query.code ?? ''), shopId);
      await this.credentials.store(tokens, user.id);
      await this.push.emitForPartner(app.id, shopId, 'shop_authorization', { shop_id: shopId, success: 1, extra: '' });
      return finish(200, { connected: true, shop_id: shopId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authorization failed';
      return finish(400, { connected: false, shop_id: shopId, error: message });
    }
  }

  @Get('seller/shops/:shopId/connection-status')
  @RequireRole('SELLER')
  async connectionStatus(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number) {
    await this.shops.assertMember(user.id, shopId);
    return { data: await this.connection(shopId) };
  }

  @Post('seller/shops/:shopId/disconnect')
  @RequireRole('SELLER')
  @HttpCode(200)
  async disconnect(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number) {
    await this.shops.assertMember(user.id, shopId, true);
    const { app } = await this.partners.getPlatformPartner();
    const revoked = await this.oauth.revokeGrant(app.id, shopId);
    await this.credentials.remove(shopId, app.id);
    if (revoked) await this.push.emitForPartner(app.id, shopId, 'shop_authorization_canceled', { shop_id: shopId, success: 1, extra: '' });
    return { data: { disconnected: revoked, ...(await this.connection(shopId)) } };
  }

  @Get('seller/dashboard/summary')
  @RequireRole('SELLER')
  async summary(@CurrentUser() user: User, @Query() query: unknown) {
    const input = parseInput(z.object({ shop_id: q.int(), time_from: q.int().optional(), time_to: q.int().optional() }), query);
    await this.shops.assertMember(user.id, input.shop_id);
    const to = input.time_to ? new Date(input.time_to * 1000) : new Date();
    const from = input.time_from ? new Date(input.time_from * 1000) : new Date(to.getTime() - 30 * 86400 * 1000);
    return { data: { ...(await this.shops.salesSummary(input.shop_id, from, to)), connection: await this.connection(input.shop_id) } };
  }

  private async connection(shopId: number) {
    const { app } = await this.partners.getPlatformPartner();
    const [grant, cred] = await Promise.all([
      this.prisma.shopAuthorization.findUnique({ where: { partnerId_shopId: { partnerId: app.id, shopId } } }),
      this.prisma.platformShopCredential.findUnique({ where: { shopId_partnerId: { shopId, partnerId: app.id } } }),
    ]);
    const active = !!grant && grant.status === 'ACTIVE' && grant.expiresAt > new Date();
    return {
      shop_id: shopId,
      partner_id: app.id,
      partner_name: app.name,
      connected: active && !!cred && cred.refreshExpiresAt > new Date(),
      grant_status: grant ? (active ? 'ACTIVE' : grant.status === 'ACTIVE' ? 'EXPIRED' : grant.status) : 'NONE',
      authorized_time: grant ? unix(grant.authorizedAt) : null,
      grant_expire_time: grant ? unix(grant.expiresAt) : null,
      access_token_expire_time: cred ? unix(cred.accessExpiresAt) : null,
      refresh_token_expire_time: cred ? unix(cred.refreshExpiresAt) : null,
    };
  }

  private async presentShop(shopId: number, role?: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { _count: { select: { items: { where: { status: { not: 'DELETED' } } } } }, addresses: { orderBy: { id: 'asc' } } },
    });
    if (!shop) throw notFound('Shop');
    return {
      shop_id: shop.id,
      shop_name: shop.name,
      description: shop.description,
      logo_url: shop.logoUrl ? mediaUrl(shop.logoUrl) : null,
      region: shop.region,
      status: shop.status,
      city: shop.city,
      role: role?.toLowerCase() ?? 'owner',
      item_count: shop._count.items,
      addresses: shop.addresses.map((a) => ({
        address_id: a.id,
        name: a.name,
        phone: a.phone,
        state: a.state,
        city: a.city,
        district: a.district,
        town: a.town,
        address: a.address,
        is_default: a.isDefault,
        is_pickup: a.isPickup,
        is_return: a.isReturn,
      })),
      create_time: unix(shop.createdAt),
      connection: await this.connection(shop.id),
    };
  }
}
