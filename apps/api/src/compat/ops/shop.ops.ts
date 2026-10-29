import { Injectable } from '@nestjs/common';
import { ShopCategoryStatus } from '@prisma/client';
import { z } from 'zod';
import { notFound, validation } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { unix } from '../../common/time';
import { q } from '../../common/validation';
import { mediaUrl } from '../../domain/catalog.service';
import { CompatOperationProvider, op } from '../compat.types';

const categoryStatusCode: Record<ShopCategoryStatus, number> = { DELETED: 0, NORMAL: 1, INACTIVE: 2 };

/** shop.* and shop_category.* operations, always scoped to ctx.shopId. */
@Injectable()
export class ShopOps implements CompatOperationProvider {
  constructor(private readonly prisma: PrismaService) {}

  operations() {
    return [
      op({
        path: '/shop/get_shop_info',
        method: 'GET',
        auth: 'shop',
        envelope: 'flat',
        input: z.object({}),
        handler: async (ctx) => {
          const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: ctx.shopId } });
          const grant = await this.prisma.shopAuthorization.findUnique({
            where: { partnerId_shopId: { partnerId: ctx.partnerId, shopId: ctx.shopId } },
          });
          const info = {
            shop_name: shop.name,
            region: shop.region,
            status: shop.status,
            sip_affi_shops: [],
            is_cb: false,
            is_cnsc: false,
            is_sip: false,
            is_upgraded_cbsc: false,
            merchant_id: null,
            shop_fulfillment_flag: 'Others',
            is_main_shop: false,
            is_direct_shop: false,
            is_one_awb: false,
            is_mart_shop: false,
            is_outlet_shop: false,
            auth_time: unix(grant?.authorizedAt),
            expire_time: unix(grant?.expiresAt),
          };
          return { ...info, response: info };
        },
      }),
      op({
        path: '/shop/get_profile',
        method: 'GET',
        auth: 'shop',
        input: z.object({}),
        handler: async (ctx) => {
          const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: ctx.shopId } });
          return { shop_logo: shop.logoUrl ? mediaUrl(shop.logoUrl) : '', description: shop.description, shop_name: shop.name, invoice_issuer: 'Other' };
        },
      }),
      op({
        path: '/shop/update_profile',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          shop_name: z.string().trim().min(1).max(80).optional(),
          shop_logo: z.string().url().optional(),
          description: z.string().max(3000).optional(),
        }),
        handler: async (ctx, input) => {
          if (input.shop_name === undefined && input.shop_logo === undefined && input.description === undefined) {
            throw validation('At least one of shop_name, shop_logo, description is required');
          }
          const shop = await this.prisma.shop.update({
            where: { id: ctx.shopId },
            data: { name: input.shop_name, logoUrl: input.shop_logo, description: input.description },
          });
          return { shop_logo: shop.logoUrl ? mediaUrl(shop.logoUrl) : '', description: shop.description, shop_name: shop.name };
        },
      }),
      op({
        path: '/shop/get_shop_holiday_mode',
        method: 'GET',
        auth: 'shop',
        input: z.object({}),
        handler: async (ctx) => {
          const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: ctx.shopId } });
          return { holiday_mode_on: shop.holidayMode, holiday_mode_mtime: unix(shop.holidayModeAt ?? shop.updatedAt) };
        },
      }),
      op({
        path: '/shop/set_shop_holiday_mode',
        method: 'POST',
        auth: 'shop',
        input: z.object({ holiday_mode_on: q.bool() }),
        handler: async (ctx, input) => {
          const shop = await this.prisma.shop.update({
            where: { id: ctx.shopId },
            data: { holidayMode: input.holiday_mode_on, holidayModeAt: new Date() },
          });
          return { holiday_mode_on: shop.holidayMode, holiday_mode_mtime: unix(shop.holidayModeAt) };
        },
      }),

      // ----- shop_category (seller-managed storefront collections) -----
      op({
        path: '/shop_category/get_shop_category_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({ page_size: q.int().min(1).max(100).default(20), page_no: q.int().min(1).default(1) }),
        handler: async (ctx, input) => {
          const where = { shopId: ctx.shopId, status: { not: 'DELETED' as const } };
          const [rows, total] = await Promise.all([
            this.prisma.shopCategory.findMany({
              where,
              orderBy: [{ sortWeight: 'desc' }, { id: 'asc' }],
              skip: (input.page_no - 1) * input.page_size,
              take: input.page_size,
            }),
            this.prisma.shopCategory.count({ where }),
          ]);
          return {
            shop_categorys: rows.map((c) => ({
              shop_category_id: c.id,
              status: categoryStatusCode[c.status],
              name: c.name,
              sort_weight: c.sortWeight,
              created_by: c.createdBy,
            })),
            total_count: total,
            more: input.page_no * input.page_size < total,
          };
        },
      }),
      op({
        path: '/shop_category/get_item_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          shop_category_id: q.int(),
          page_size: q.int().min(1).max(100).default(100),
          page_no: q.int().min(0).default(0),
        }),
        handler: async (ctx, input) => {
          await this.findCategory(ctx.shopId, input.shop_category_id);
          const where = { shopCategoryId: input.shop_category_id, item: { status: { not: 'DELETED' as const } } };
          // Shopee uses 0-based page_no here.
          const page = Math.max(input.page_no, 0);
          const [rows, total] = await Promise.all([
            this.prisma.shopCategoryItem.findMany({ where, orderBy: { itemId: 'asc' }, skip: page * input.page_size, take: input.page_size }),
            this.prisma.shopCategoryItem.count({ where }),
          ]);
          return { item_list: rows.map((r) => r.itemId), total_count: total, more: (page + 1) * input.page_size < total };
        },
      }),
      op({
        path: '/shop_category/add_shop_category',
        method: 'POST',
        auth: 'shop',
        input: z.object({ name: z.string().trim().min(1).max(40), sort_weight: q.int().min(0).max(2147483546).default(0) }),
        handler: async (ctx, input) => {
          const created = await this.prisma.shopCategory.create({
            data: { shopId: ctx.shopId, name: input.name, sortWeight: input.sort_weight },
          });
          return { shop_category_id: created.id };
        },
      }),
      op({
        path: '/shop_category/update_shop_category',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          shop_category_id: q.int(),
          name: z.string().trim().min(1).max(40).optional(),
          sort_weight: q.int().min(0).optional(),
          status: z.enum(['NORMAL', 'INACTIVE', 'DELETED']).optional(),
        }),
        handler: async (ctx, input) => {
          await this.findCategory(ctx.shopId, input.shop_category_id);
          const updated = await this.prisma.shopCategory.update({
            where: { id: input.shop_category_id },
            data: { name: input.name, sortWeight: input.sort_weight, status: input.status },
          });
          return { shop_category_id: updated.id, name: updated.name, sort_weight: updated.sortWeight, status: updated.status };
        },
      }),
      op({
        path: '/shop_category/delete_shop_category',
        method: 'POST',
        auth: 'shop',
        input: z.object({ shop_category_id: q.int() }),
        handler: async (ctx, input) => {
          await this.findCategory(ctx.shopId, input.shop_category_id);
          await this.prisma.shopCategory.update({ where: { id: input.shop_category_id }, data: { status: 'DELETED' } });
          return { shop_category_id: input.shop_category_id, msg: 'success' };
        },
      }),
      op({
        path: '/shop_category/add_item_list',
        method: 'POST',
        auth: 'shop',
        input: z.object({ shop_category_id: q.int(), item_list: z.array(q.int()).min(1).max(100) }),
        handler: async (ctx, input) => {
          await this.findCategory(ctx.shopId, input.shop_category_id);
          const owned = await this.prisma.item.findMany({
            where: { id: { in: input.item_list }, shopId: ctx.shopId, status: { not: 'DELETED' } },
            select: { id: true },
          });
          const ownedIds = new Set(owned.map((i) => i.id));
          const invalid = input.item_list.filter((id) => !ownedIds.has(id));
          await this.prisma.shopCategoryItem.createMany({
            data: [...ownedIds].map((itemId) => ({ shopCategoryId: input.shop_category_id, itemId })),
            skipDuplicates: true,
          });
          const current = await this.prisma.shopCategoryItem.count({ where: { shopCategoryId: input.shop_category_id } });
          return {
            invalid_item_id_list: invalid.map((item_id) => ({ item_id, fail_error: 'item not found', fail_message: 'Item does not belong to this shop' })),
            shop_category_id: input.shop_category_id,
            current_count: current,
          };
        },
      }),
      op({
        path: '/shop_category/delete_item_list',
        method: 'POST',
        auth: 'shop',
        input: z.object({ shop_category_id: q.int(), item_list: z.array(q.int()).min(1).max(100) }),
        handler: async (ctx, input) => {
          await this.findCategory(ctx.shopId, input.shop_category_id);
          await this.prisma.shopCategoryItem.deleteMany({
            where: { shopCategoryId: input.shop_category_id, itemId: { in: input.item_list } },
          });
          const current = await this.prisma.shopCategoryItem.count({ where: { shopCategoryId: input.shop_category_id } });
          return { invalid_item_id_list: [], shop_category_id: input.shop_category_id, current_count: current };
        },
      }),
    ];
  }

  private async findCategory(shopId: number, id: number) {
    const category = await this.prisma.shopCategory.findFirst({ where: { id, shopId, status: { not: 'DELETED' } } });
    if (!category) throw notFound('Shop category');
    return category;
  }
}
