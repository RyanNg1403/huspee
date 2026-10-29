import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { User } from '@prisma/client';
import multer from 'multer';
import { z } from 'zod';
import { validation } from '../common/errors';
import { parseInput } from '../common/validation';
import { CurrentUser, RequireRole, SessionGuard } from '../auth/session.guard';
import { CompatDispatcher } from '../compat/compat.dispatcher';
import { CompatRegistry } from '../compat/compat.registry';
import { CompatContext } from '../compat/compat.types';
import { ShopService } from '../domain/shop.service';
import { OAuthService } from '../partner/oauth.service';
import { PartnerService } from '../partner/partner.service';
import { PlatformCredentialService } from './platform-credential.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 9 } }).any();

const callSchema = z.object({
  path: z.string().regex(/^\/[a-z_]+(\/[a-z_]+)+$/, 'path must look like /product/get_item_list'),
  params: z.record(z.unknown()).default({}),
});

/**
 * Trusted seller-dashboard gateway: the browser authenticates with its session; the backend
 * checks shop membership, uses the shop's platform-held token (refreshing it when needed),
 * validates it exactly like an external call, and invokes the shop-scoped compat operation
 * in-process (no self-HTTP hop, no partner_key or token ever sent to the browser).
 */
@Controller('api/v1/seller/shops/:shopId/shopee')
@UseGuards(SessionGuard)
@RequireRole('SELLER')
export class SellerGatewayController {
  constructor(
    private readonly registry: CompatRegistry,
    private readonly dispatcher: CompatDispatcher,
    private readonly shops: ShopService,
    private readonly partners: PartnerService,
    private readonly oauth: OAuthService,
    private readonly credentials: PlatformCredentialService,
  ) {}

  @Get('operations')
  async listOperations(@CurrentUser() user: User, @Param('shopId', ParseIntPipe) shopId: number) {
    await this.shops.assertMember(user.id, shopId);
    return {
      data: this.registry
        .list()
        .filter((o) => o.auth === 'shop')
        .map((o) => ({ path: o.path, method: o.method, provenance: o.provenance ?? 'shopee-compatible' })),
    };
  }

  @Post()
  async call(
    @CurrentUser() user: User,
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() _body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.shops.assertMember(user.id, shopId);
    let files: CompatContext['files'];
    let payload: unknown = req.body;
    if (req.is('multipart/form-data')) {
      await new Promise<void>((resolve, reject) => upload(req, res, (err: unknown) => (err ? reject(validation(String(err))) : resolve())));
      files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const body = req.body as Record<string, string>;
      payload = { path: body.path, params: body.params ? safeJson(body.params) : {} };
    }
    const input = parseInput(callSchema, payload);
    const operation = this.registry.get(input.path);
    if (!operation || operation.auth !== 'shop') throw validation(`Unsupported shop operation ${input.path}`);

    const { app } = await this.partners.getPlatformPartner();
    try {
      const token = await this.credentials.accessToken(shopId, app.id);
      await this.oauth.validateAccessToken(app.id, shopId, token);
    } catch (err) {
      const result = this.dispatcher.toError(err);
      res.status(result.status).json(result.body);
      return;
    }
    res.setHeader('X-Huspee-Provenance', operation.provenance ?? 'shopee-compatible');
    const result = await this.dispatcher.run(operation, { partnerId: app.id, shopId, via: 'gateway', files }, input.params);
    res.status(result.status).json(result.body);
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw validation('params must be a JSON object');
  }
}
