import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { unix } from '../../common/time';
import { q } from '../../common/validation';
import { OAuthService } from '../../partner/oauth.service';
import { CompatOperationProvider, op, ShopeeError } from '../compat.types';

/** auth.token.get, auth.access_token.get, public.get_shops_by_partner */
@Injectable()
export class AuthOps implements CompatOperationProvider {
  constructor(private readonly oauth: OAuthService) {}

  operations() {
    return [
      op({
        path: '/auth/token/get',
        method: 'POST',
        auth: 'partner',
        envelope: 'flat',
        input: z.object({
          code: z.string().min(1),
          partner_id: q.int(),
          shop_id: q.int().optional(),
          main_account_id: q.int().optional(),
        }),
        handler: async (ctx, input) => {
          if (input.partner_id !== ctx.partnerId) throw new ShopeeError('error_param', 'partner_id in body does not match query', 400);
          if (input.main_account_id) throw new ShopeeError('error_param', 'main_account_id authorization is not supported by Huspee', 400);
          const tokens = await this.oauth.exchangeCode(ctx.partnerId, input.code, input.shop_id);
          return { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expire_in: tokens.expire_in };
        },
      }),
      op({
        path: '/auth/access_token/get',
        method: 'POST',
        auth: 'partner',
        envelope: 'flat',
        input: z.object({
          refresh_token: z.string().min(1),
          partner_id: q.int(),
          shop_id: q.int().optional(),
          merchant_id: q.int().optional(),
        }),
        handler: async (ctx, input) => {
          if (input.partner_id !== ctx.partnerId) throw new ShopeeError('error_param', 'partner_id in body does not match query', 400);
          if (input.merchant_id) throw new ShopeeError('error_param', 'merchant_id refresh is not supported by Huspee', 400);
          const tokens = await this.oauth.refresh(ctx.partnerId, input.refresh_token, input.shop_id);
          return {
            partner_id: tokens.partner_id,
            shop_id: tokens.shop_id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expire_in: tokens.expire_in,
          };
        },
      }),
      op({
        path: '/public/get_shops_by_partner',
        method: 'GET',
        auth: 'partner',
        envelope: 'flat',
        input: z.object({
          page_size: q.int().min(1).max(100).default(100),
          page_no: q.int().min(1).default(1),
        }),
        handler: async (ctx, input) => {
          const { grants, more } = await this.oauth.listGrants(ctx.partnerId, input.page_no, input.page_size);
          const authed_shop_list = grants.map((g) => ({
            region: g.shop.region,
            shop_id: g.shopId,
            auth_time: unix(g.authorizedAt),
            expire_time: unix(g.expiresAt),
            sip_affi_shops: [],
          }));
          // Shopee returns these at top level; mirrored under `response` for typed SDK consumers.
          return { authed_shop_list, more, response: { authed_shop_list, more } };
        },
      }),
    ];
  }
}
