import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { invalidState, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { addDays, unix } from '../../common/time';
import { q } from '../../common/validation';
import { LogisticsService } from '../../domain/logistics.service';
import { OrderService, SELLER_CANCEL_REASONS } from '../../domain/order.service';
import { CompatOperationProvider, op } from '../compat.types';

const ORDER_STATUSES = Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]];
const MAX_RANGE_SECONDS = 15 * 86400;

/** order.* and logistics.* operations. */
@Injectable()
export class OrderOps implements CompatOperationProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly logistics: LogisticsService,
  ) {}

  operations() {
    return [
      op({
        path: '/order/get_order_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          time_range_field: z.enum(['create_time', 'update_time']),
          time_from: q.int(),
          time_to: q.int(),
          page_size: q.int().min(1).max(100),
          cursor: z.string().optional(),
          order_status: z.enum(ORDER_STATUSES).optional(),
          response_optional_fields: z.string().optional(),
          logistics_channel_id: q.int().optional(),
        }),
        handler: async (ctx, input) => {
          if (input.time_to < input.time_from) throw validation('time_to must be >= time_from');
          if (input.time_to - input.time_from > MAX_RANGE_SECONDS) throw validation('Time range cannot exceed 15 days');
          const offset = input.cursor ? Number(input.cursor) || 0 : 0;
          const field = input.time_range_field === 'create_time' ? 'createdAt' : 'updatedAt';
          const where: Prisma.OrderWhereInput = {
            shopId: ctx.shopId,
            [field]: { gte: new Date(input.time_from * 1000), lte: new Date(input.time_to * 1000) },
            ...(input.order_status ? { status: input.order_status } : {}),
            ...(input.logistics_channel_id ? { logisticsChannelId: input.logistics_channel_id } : {}),
          };
          const rows = await this.prisma.order.findMany({
            where,
            orderBy: [{ [field]: 'desc' }, { orderSn: 'asc' }],
            skip: offset,
            take: input.page_size + 1,
            select: { orderSn: true, status: true },
          });
          const more = rows.length > input.page_size;
          const withStatus = (input.response_optional_fields ?? '').split(',').includes('order_status');
          return {
            more,
            next_cursor: more ? String(offset + input.page_size) : '',
            order_list: rows.slice(0, input.page_size).map((o) => ({ order_sn: o.orderSn, ...(withStatus ? { order_status: o.status } : {}) })),
          };
        },
      }),
      op({
        path: '/order/get_order_detail',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          order_sn_list: q.strList().pipe(z.array(z.string()).min(1).max(50)),
          response_optional_fields: q.strList().optional(),
          request_order_status_pending: q.bool().optional(),
        }),
        handler: async (ctx, input) => {
          const orders = await this.prisma.order.findMany({
            where: { orderSn: { in: input.order_sn_list }, shopId: ctx.shopId },
            include: { items: { orderBy: { id: 'asc' } }, package: true, shop: { select: { id: true, name: true } }, buyer: { select: { id: true, name: true } } },
          });
          const optional = new Set(input.response_optional_fields ?? []);
          const order = new Map(input.order_sn_list.map((sn, i) => [sn, i]));
          orders.sort((a, b) => (order.get(a.orderSn) ?? 0) - (order.get(b.orderSn) ?? 0));
          const found = new Set(orders.map((o) => o.orderSn));
          const missing = input.order_sn_list.filter((sn) => !found.has(sn));
          return {
            order_list: orders.map((o) => this.orders.presentForShopee({ ...o, package: o.package ? { ...o.package, events: [] } : null }, optional)),
            ...(missing.length ? { warning: missing.map((sn) => `order_sn ${sn} not found`) } : {}),
          };
        },
      }),
      op({
        path: '/order/cancel_order',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          order_sn: z.string().min(1),
          cancel_reason: z.enum(SELLER_CANCEL_REASONS),
          item_list: z.array(z.object({ item_id: q.int(), model_id: q.int() })).optional(),
        }),
        handler: async (ctx, input) => {
          const order = await this.orders.getForShop(ctx.shopId, input.order_sn);
          if (order.status !== 'UNPAID' && order.status !== 'READY_TO_SHIP') {
            throw invalidState(`Order in status ${order.status} cannot be cancelled by seller`);
          }
          if (input.cancel_reason === 'OUT_OF_STOCK') {
            if (!input.item_list?.length) throw validation('item_list is required when cancel_reason is OUT_OF_STOCK');
            const lines = new Set(order.items.map((i) => `${i.itemId}:${i.isDefaultModel ? 0 : i.modelId}`));
            if (input.item_list.some((i) => !lines.has(`${i.item_id}:${i.model_id}`))) throw validation('item_list contains items not in this order');
          }
          if (input.cancel_reason === 'COD_NOT_SUPPORTED' && !order.cod) throw validation('COD_NOT_SUPPORTED only applies to COD orders');
          await this.orders.cancel(order, 'seller', input.cancel_reason);
          const updated = await this.prisma.order.findUniqueOrThrow({ where: { orderSn: order.orderSn } });
          return { update_time: unix(updated.updatedAt) };
        },
      }),

      // ----- logistics -----
      op({
        path: '/logistics/get_channel_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({}),
        handler: async () => {
          const channels = await this.prisma.logisticsChannel.findMany({ orderBy: { id: 'asc' } });
          return {
            logistics_channel_list: channels.map((c) => ({
              logistics_channel_id: c.id,
              logistics_channel_name: c.name,
              cod_enabled: c.codEnabled,
              enabled: c.enabled,
              fee_type: 'SIZE_INPUT',
              size_list: [],
              weight_limit: { item_max_weight: 30, item_min_weight: 0.01 },
              item_max_dimension: { height: 100, width: 100, length: 100, unit: 'cm', dimension_sum: 300 },
              volume_limit: { item_max_volume: 1000000, item_min_volume: 0 },
              logistics_description: c.description,
              force_enable: false,
              mask_channel_id: c.maskChannel,
              block_seller_cover_shipping_fee: false,
              support_cross_border: false,
              seller_logistic_has_configuration: false,
              logistics_capability: { seller_logistics: false },
              preprint: false,
            })),
          };
        },
      }),
      op({
        path: '/logistics/get_address_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({}),
        handler: async (ctx) => {
          const addresses = await this.prisma.shopAddress.findMany({ where: { shopId: ctx.shopId }, orderBy: { id: 'asc' } });
          return {
            show_pickup_address: true,
            address_list: addresses.map((a) => ({
              address_id: a.id,
              region: a.region,
              state: a.state,
              city: a.city,
              district: a.district,
              town: a.town,
              address: a.address,
              zipcode: a.zipcode,
              address_type: [
                ...(a.isDefault ? ['DEFAULT_ADDRESS'] : []),
                ...(a.isPickup ? ['PICKUP_ADDRESS'] : []),
                ...(a.isReturn ? ['RETURN_ADDRESS'] : []),
              ],
            })),
          };
        },
      }),
      op({
        path: '/logistics/get_shipping_parameter',
        method: 'GET',
        auth: 'shop',
        input: z.object({ order_sn: z.string().min(1), package_number: z.string().optional() }),
        handler: async (ctx, input) => {
          const order = await this.orders.getForShop(ctx.shopId, input.order_sn);
          if (order.status !== 'READY_TO_SHIP') throw invalidState(`Order in status ${order.status} cannot be shipped`);
          const addresses = await this.prisma.shopAddress.findMany({ where: { shopId: ctx.shopId, isPickup: true }, orderBy: { id: 'asc' } });
          const slots = [1, 2, 3].flatMap((d) => {
            const day = addDays(startOfDayUtc(new Date()), d);
            const key = day.toISOString().slice(0, 10).replace(/-/g, '');
            return [
              { date: unix(day), time_text: '08:00 - 12:00', pickup_time_id: `${key}_AM`, flags: d === 1 ? ['recommended'] : [] },
              { date: unix(day), time_text: '13:00 - 17:00', pickup_time_id: `${key}_PM`, flags: [] },
            ];
          });
          return {
            info_needed: { pickup: ['address_id', 'pickup_time_id'], dropoff: [], non_integrated: [] },
            pickup: {
              address_list: addresses.map((a) => ({
                address_id: a.id,
                region: a.region,
                state: a.state,
                city: a.city,
                district: a.district,
                town: a.town,
                address: a.address,
                zipcode: a.zipcode,
                address_flag: [...(a.isDefault ? ['default_address'] : []), 'pickup_address'],
                time_slot_list: slots,
              })),
            },
            dropoff: { branch_list: [], slug_list: [] },
          };
        },
      }),
      op({
        path: '/logistics/ship_order',
        method: 'POST',
        auth: 'shop',
        input: z
          .object({
            order_sn: z.string().min(1),
            package_number: z.string().optional(),
            pickup: z.object({ address_id: q.int(), pickup_time_id: z.string().optional(), tracking_number: z.string().optional() }).optional(),
            dropoff: z.object({ branch_id: q.int().optional(), sender_real_name: z.string().optional(), tracking_number: z.string().optional() }).optional(),
            non_integrated: z.object({ tracking_number: z.string().optional() }).optional(),
          })
          .refine((v) => [v.pickup, v.dropoff].filter(Boolean).length === 1, { message: 'Exactly one of pickup or dropoff is required', path: ['pickup'] }),
        handler: async (ctx, input) => {
          await this.orders.ship(ctx.shopId, input.order_sn, {
            method: input.pickup ? 'pickup' : 'dropoff',
            addressId: input.pickup?.address_id,
            pickupTimeId: input.pickup?.pickup_time_id,
          });
          return {};
        },
      }),
      op({
        path: '/logistics/get_tracking_number',
        method: 'GET',
        auth: 'shop',
        input: z.object({ order_sn: z.string().min(1), package_number: z.string().optional(), response_optional_fields: z.string().optional() }),
        handler: async (ctx, input) => {
          const order = await this.orders.getForShop(ctx.shopId, input.order_sn);
          const tracking = order.package?.trackingNumber ?? '';
          return {
            tracking_number: tracking,
            plp_number: '',
            first_mile_tracking_number: '',
            last_mile_tracking_number: tracking,
            hint: tracking ? '' : 'Tracking number is generated after ship_order',
            pickup_code: '',
          };
        },
      }),
      op({
        path: '/logistics/get_tracking_info',
        method: 'GET',
        auth: 'shop',
        input: z.object({ order_sn: z.string().min(1), package_number: z.string().optional() }),
        handler: async (ctx, input) => {
          const order = await this.orders.getForShop(ctx.shopId, input.order_sn);
          return {
            order_sn: order.orderSn,
            package_number: order.package?.packageNumber ?? '',
            logistics_status: order.package?.logisticsStatus ?? 'LOGISTICS_NOT_START',
            tracking_info: (order.package?.events ?? [])
              .slice()
              .reverse()
              .map((e) => ({ update_time: unix(e.createdAt), description: e.description, logistics_status: e.logisticsStatus })),
          };
        },
      }),
    ];
  }
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
