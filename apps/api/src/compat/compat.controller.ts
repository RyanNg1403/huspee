import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import { OAuthService } from '../partner/oauth.service';
import { PartnerService } from '../partner/partner.service';
import { CompatDispatcher } from './compat.dispatcher';
import { CompatRegistry } from './compat.registry';
import { CompatContext, ShopeeError } from './compat.types';

const API_PREFIX = '/api/v2';
const COMMON_PARAMS = new Set(['partner_id', 'timestamp', 'sign', 'access_token', 'shop_id', 'merchant_id']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 9 } }).any();

/**
 * Generic Shopee Open API v2-compatible entry point. Each request is authenticated in the
 * documented order: partner -> timestamp freshness -> HMAC sign -> (shop calls) opaque token,
 * partner/shop binding and active grant. Handlers then re-check resource ownership by shop.
 */
@Controller('api/v2')
export class CompatController {
  constructor(
    private readonly registry: CompatRegistry,
    private readonly dispatcher: CompatDispatcher,
    private readonly partners: PartnerService,
    private readonly oauth: OAuthService,
  ) {}

  @All('*path')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const operation = this.registry.get(req.path.startsWith(API_PREFIX) ? req.path.slice(API_PREFIX.length) : req.path);
    try {
      if (!operation) throw new ShopeeError('error_not_found', `Api not found: ${req.path}`, 404);
      if (operation.method !== req.method) throw new ShopeeError('error_param', `Wrong HTTP method, expected ${operation.method}`, 405);
      res.setHeader('X-Huspee-Provenance', operation.provenance ?? 'shopee-compatible');

      const query = req.query as Record<string, unknown>;
      const accessToken = operation.auth === 'shop' ? query.access_token : undefined;
      const shopIdRaw = operation.auth === 'shop' ? query.shop_id : undefined;
      if (operation.auth === 'shop') {
        if (typeof accessToken !== 'string' || accessToken.length === 0) {
          throw new ShopeeError('error_param', 'Missing access_token', 400);
        }
        if (typeof shopIdRaw !== 'string' || !/^\d+$/.test(shopIdRaw)) throw new ShopeeError('error_param', 'Missing or invalid shop_id', 400);
      }
      const shopId = shopIdRaw ? Number(shopIdRaw) : 0;

      const { partnerId } = await this.partners.verify({
        partnerId: query.partner_id,
        timestamp: query.timestamp,
        sign: query.sign,
        path: req.path,
        accessToken: accessToken as string | undefined,
        shopId: operation.auth === 'shop' ? shopId : undefined,
      });
      if (operation.auth === 'shop') await this.oauth.validateAccessToken(partnerId, shopId, accessToken as string);

      const ctx: CompatContext = { partnerId, shopId, via: 'http' };
      if (req.is('multipart/form-data')) {
        await new Promise<void>((resolve, reject) => upload(req, res, (err: unknown) => (err ? reject(err) : resolve())));
        ctx.files = (req.files as Express.Multer.File[] | undefined) ?? [];
      }

      const input: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(query)) if (!COMMON_PARAMS.has(key)) input[key] = value;
      if (req.method === 'POST' && req.body && typeof req.body === 'object') Object.assign(input, req.body);

      const result = await this.dispatcher.run(operation, ctx, input);
      res.status(result.status).json(result.body);
    } catch (err) {
      const result = this.dispatcher.toError(
        err instanceof multer.MulterError ? new ShopeeError('error_param', err.message, 400) : err,
      );
      res.status(result.status).json(result.body);
    }
  }
}
