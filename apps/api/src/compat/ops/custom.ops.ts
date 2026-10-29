import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { validation } from '../../common/errors';
import { unix } from '../../common/time';
import { q } from '../../common/validation';
import { OrderService, SHIPMENT_EVENTS } from '../../domain/order.service';
import { ShopService } from '../../domain/shop.service';
import { CompatOperationProvider, op } from '../compat.types';

/**
 * Project-owned signed seller extensions under /api/v2/custom/*. NOT official Shopee APIs:
 * they reuse the shop access_token + HMAC contract so the same trusted client can call them.
 */
@Injectable()
export class CustomSignedOps implements CompatOperationProvider {
  constructor(
    private readonly shops: ShopService,
    private readonly orders: OrderService,
  ) {}

  operations() {
    return [
      op({
        path: '/custom/shop/get_policies',
        method: 'GET',
        auth: 'shop',
        provenance: 'custom-signed',
        input: z.object({}),
        handler: async (ctx) => this.shops.presentPolicy(await this.shops.policy(ctx.shopId)),
      }),
      op({
        path: '/custom/shop/update_policies',
        method: 'POST',
        auth: 'shop',
        provenance: 'custom-signed',
        input: z.object({
          shipping_policy: z.string().trim().min(1).max(5000).optional(),
          return_policy: z.string().trim().min(1).max(5000).optional(),
          warranty_policy: z.string().trim().min(1).max(5000).optional(),
          return_window_days: q.int().min(0).max(30).optional(),
          free_shipping_min_spend: q.num().min(0).nullable().optional(),
          expected_version: q.int().optional(),
        }),
        handler: async (ctx, input) => {
          const { expected_version: _v, ...fields } = input;
          if (Object.values(fields).every((v) => v === undefined)) throw validation('No policy field to update');
          return this.shops.presentPolicy(await this.shops.updatePolicy(ctx.shopId, input));
        },
      }),
      op({
        path: '/custom/shop/get_sales_summary',
        method: 'GET',
        auth: 'shop',
        provenance: 'custom-signed',
        input: z.object({ time_from: q.int().optional(), time_to: q.int().optional() }),
        handler: async (ctx, input) => {
          const to = input.time_to ? new Date(input.time_to * 1000) : new Date();
          const from = input.time_from ? new Date(input.time_from * 1000) : new Date(to.getTime() - 30 * 86400 * 1000);
          if (from > to) throw validation('time_from must be before time_to');
          return this.shops.salesSummary(ctx.shopId, from, to);
        },
      }),
      op({
        path: '/custom/logistics/simulate_shipment_event',
        method: 'POST',
        auth: 'shop',
        provenance: 'custom-signed',
        input: z.object({ order_sn: z.string().min(1), event: z.enum(SHIPMENT_EVENTS) }),
        handler: async (ctx, input) => {
          const order = await this.orders.advanceShipment(ctx.shopId, input.order_sn, input.event);
          return {
            order_sn: order.orderSn,
            order_status: order.status,
            logistics_status: order.package?.logisticsStatus,
            update_time: unix(order.updatedAt),
          };
        },
      }),
    ];
  }
}
