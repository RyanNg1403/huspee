import { Injectable } from '@nestjs/common';
import { ItemStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { DomainError, invalidState, notFound, validation } from '../../common/errors';
import { CURRENCY, dec, toNumber } from '../../common/money';
import { PrismaService, Tx } from '../../common/prisma.service';
import { unix } from '../../common/time';
import { q } from '../../common/validation';
import {
  CatalogService,
  externalModelId,
  ItemWithRelations,
  mediaUrl,
  ModelWithDiscounts,
  resolveModelPrice,
  sellableModels,
  TierVariation,
  tierVariations,
} from '../../domain/catalog.service';
import { PushService } from '../../domain/push.service';
import { CompatContext, CompatOperationProvider, op } from '../compat.types';

const MIN_PRICE = 1000;
const MAX_PRICE = 1_000_000_000;
const MAX_STOCK = 999_999;

const toExternalStatus = (s: ItemStatus) => (s === 'DELETED' ? 'SELLER_DELETE' : s);
const fromExternalStatus = (s: string): ItemStatus | undefined =>
  ({ NORMAL: 'NORMAL', UNLIST: 'UNLIST', BANNED: 'BANNED', REVIEWING: 'REVIEWING', SELLER_DELETE: 'DELETED', DELETED: 'DELETED' } as const)[
    s.toUpperCase() as 'NORMAL'
  ];

const sellerStock = z.array(z.object({ location_id: z.string().optional(), stock: q.int().min(0).max(MAX_STOCK) })).min(1);
const price = q.num().min(MIN_PRICE).max(MAX_PRICE);
const attributeList = z
  .array(
    z.object({
      attribute_id: q.int(),
      attribute_value_list: z
        .array(z.object({ value_id: q.int().default(0), original_value_name: z.string().optional(), value_unit: z.string().optional() }))
        .default([]),
    }),
  )
  .optional();
const dimension = z.object({ package_length: q.int().min(1), package_width: q.int().min(1), package_height: q.int().min(1) });
const logisticInfo = z
  .array(z.object({ logistic_id: q.int(), enabled: q.bool(), is_free: q.bool().optional(), shipping_fee: q.num().optional(), size_id: q.int().optional() }))
  .min(1);
const tierVariationInput = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(20),
      option_list: z
        .array(z.object({ option: z.string().trim().min(1).max(30), image: z.object({ image_id: z.string() }).optional() }))
        .min(1)
        .max(50),
    }),
  )
  .min(1)
  .max(2);
const standardiseTierVariationInput = z
  .array(
    z.object({
      variation_id: q.int().optional(),
      variation_name: z.string().trim().min(1).max(20),
      variation_option_list: z
        .array(z.object({ variation_option_id: q.int().optional(), variation_option_name: z.string().trim().min(1).max(30), image_id: z.string().optional() }))
        .min(1)
        .max(50),
    }),
  )
  .min(1)
  .max(2);
const modelInput = z.object({
  tier_index: z.array(q.int().min(0)).min(1).max(2),
  original_price: price,
  model_sku: z.string().max(100).optional(),
  seller_stock: sellerStock,
  weight: q.num().positive().optional(),
});

@Injectable()
export class ProductOps implements CompatOperationProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly push: PushService,
  ) {}

  operations() {
    return [
      op({
        path: '/product/get_item_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          offset: q.int().min(0).default(0),
          page_size: q.int().min(1).max(100),
          item_status: q.strList(),
          update_time_from: q.int().optional(),
          update_time_to: q.int().optional(),
        }),
        handler: async (ctx, input) => {
          const statuses = input.item_status.map((s) => fromExternalStatus(s));
          if (statuses.some((s) => !s)) throw validation('Invalid item_status');
          const where: Prisma.ItemWhereInput = {
            shopId: ctx.shopId,
            status: { in: statuses as ItemStatus[] },
            updatedAt: {
              ...(input.update_time_from ? { gte: new Date(input.update_time_from * 1000) } : {}),
              ...(input.update_time_to ? { lte: new Date(input.update_time_to * 1000) } : {}),
            },
          };
          const [items, total] = await Promise.all([
            this.prisma.item.findMany({ where, orderBy: { id: 'asc' }, skip: input.offset, take: input.page_size }),
            this.prisma.item.count({ where }),
          ]);
          const hasNext = input.offset + items.length < total;
          return {
            item: items.map((i) => ({ item_id: i.id, item_status: toExternalStatus(i.status), update_time: unix(i.updatedAt) })),
            total_count: total,
            has_next_page: hasNext,
            ...(hasNext ? { next_offset: input.offset + items.length } : { next_offset: 0 }),
          };
        },
      }),
      op({
        path: '/product/search_item',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          offset: z.string().optional(),
          page_size: q.int().min(1).max(100),
          item_name: z.string().optional(),
          item_sku: z.string().optional(),
          item_status: q.strList().optional(),
          attribute_status: q.int().optional(),
        }),
        handler: async (ctx, input) => {
          const offset = input.offset ? Number(input.offset) || 0 : 0;
          const statuses = (input.item_status ?? ['NORMAL']).map(fromExternalStatus);
          if (statuses.some((s) => !s)) throw validation('Invalid item_status');
          const where: Prisma.ItemWhereInput = {
            shopId: ctx.shopId,
            status: { in: statuses as ItemStatus[] },
            ...(input.item_name ? { name: { contains: input.item_name, mode: 'insensitive' } } : {}),
            ...(input.item_sku ? { itemSku: { contains: input.item_sku, mode: 'insensitive' } } : {}),
          };
          const [items, total] = await Promise.all([
            this.prisma.item.findMany({ where, orderBy: { id: 'asc' }, skip: offset, take: input.page_size, select: { id: true } }),
            this.prisma.item.count({ where }),
          ]);
          const next = offset + items.length;
          return { item_id_list: items.map((i) => i.id), total_count: total, next_offset: next < total ? String(next) : '' };
        },
      }),
      op({
        path: '/product/get_item_base_info',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          item_id_list: q.intList().pipe(z.array(z.number()).min(1).max(50)),
          need_tax_info: q.bool().optional(),
          need_complaint_policy: q.bool().optional(),
        }),
        handler: async (ctx, input) => {
          const items = await this.catalog.getShopItems(ctx.shopId, input.item_id_list);
          const attrs = await this.attributeNames(items.map((i) => i.categoryId));
          const order = new Map(input.item_id_list.map((id, idx) => [id, idx]));
          items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
          return { item_list: items.map((i) => this.presentBaseInfo(i, attrs)) };
        },
      }),
      op({
        path: '/product/get_model_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({ item_id: q.int() }),
        handler: async (ctx, input) => {
          const item = await this.catalog.getShopItem(ctx.shopId, input.item_id);
          return this.presentModels(item);
        },
      }),
      op({
        path: '/product/get_item_extra_info',
        method: 'GET',
        auth: 'shop',
        input: z.object({ item_id_list: q.intList().pipe(z.array(z.number()).min(1).max(50)) }),
        handler: async (ctx, input) => {
          const items = await this.prisma.item.findMany({ where: { id: { in: input.item_id_list }, shopId: ctx.shopId, status: { not: 'DELETED' } } });
          const ratings = await this.catalog.ratingSummary(items.map((i) => i.id));
          return {
            item_list: items.map((i) => ({
              item_id: i.id,
              sale: i.sales,
              views: i.views,
              likes: i.likes,
              rating_star: ratings.get(i.id)?.avg ?? 0,
              comment_count: ratings.get(i.id)?.count ?? 0,
            })),
          };
        },
      }),
      op({
        path: '/product/get_comment',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          item_id: q.int().optional(),
          comment_id: q.int().optional(),
          cursor: z.string().default(''),
          page_size: q.int().min(1).max(100),
        }),
        handler: async (ctx, input) => {
          const offset = Number(input.cursor) || 0;
          const where: Prisma.ReviewWhereInput = {
            item: { shopId: ctx.shopId },
            ...(input.item_id ? { itemId: input.item_id } : {}),
            ...(input.comment_id ? { id: input.comment_id } : {}),
          };
          const rows = await this.prisma.review.findMany({
            where,
            include: { buyer: { select: { name: true } } },
            orderBy: { id: 'desc' },
            skip: offset,
            take: input.page_size + 1,
          });
          const more = rows.length > input.page_size;
          const page = rows.slice(0, input.page_size);
          return {
            item_comment_list: page.map((r) => ({
              order_sn: r.orderSn ?? '',
              comment_id: r.id,
              comment: r.comment,
              buyer_username: maskName(r.buyer.name),
              item_id: r.itemId,
              model_id: r.modelId ?? 0,
              model_id_list: r.modelId ? [r.modelId] : [],
              rating_star: r.rating,
              editable: 'EDITABLE',
              hidden: r.hidden,
              create_time: unix(r.createdAt),
              comment_reply: r.sellerReply ? { reply: r.sellerReply, hidden: false, create_time: unix(r.repliedAt) } : undefined,
              media: { image_url_list: r.imageUrls.map(mediaUrl), video_url_list: [] },
            })),
            more,
            next_cursor: more ? String(offset + input.page_size) : '',
          };
        },
      }),
      op({
        path: '/product/reply_comment',
        method: 'POST',
        auth: 'shop',
        input: z.object({ comment_list: z.array(z.object({ comment_id: q.int(), comment: z.string().trim().min(1).max(500) })).min(1).max(100) }),
        handler: async (ctx, input) => {
          const result = [];
          for (const c of input.comment_list) {
            const updated = await this.prisma.review.updateMany({
              where: { id: c.comment_id, item: { shopId: ctx.shopId } },
              data: { sellerReply: c.comment, repliedAt: new Date() },
            });
            result.push(updated.count ? { comment_id: c.comment_id } : { comment_id: c.comment_id, fail_error: 'error_not_found', fail_message: 'Comment not found' });
          }
          return { result_list: result };
        },
      }),
      op({
        path: '/product/get_item_promotion',
        method: 'GET',
        auth: 'shop',
        input: z.object({ item_id_list: q.intList().pipe(z.array(z.number()).min(1).max(50)) }),
        handler: async (ctx, input) => {
          const items = await this.catalog.getShopItems(ctx.shopId, input.item_id_list);
          const found = new Set(items.map((i) => i.id));
          const now = new Date();
          return {
            success_list: items.map((item) => ({
              item_id: item.id,
              promotion: sellableModels(item).flatMap((m) =>
                m.discountModels
                  .filter((dm) => dm.discount.endTime > now)
                  .map((dm) => ({
                    promotion_type: 'Discount Promotions',
                    promotion_id: dm.discountId,
                    model_id: externalModelId(m),
                    start_time: unix(dm.discount.startTime),
                    end_time: unix(dm.discount.endTime),
                    promotion_price_info: [{ promotion_price: toNumber(dm.promotionPrice) }],
                    promotion_staging: dm.discount.startTime <= now ? 'ongoing' : 'upcoming',
                    promotion_stock_info_v2: { summary_info: { total_reserved_stock: 0 } },
                  })),
              ),
            })),
            failure_list: input.item_id_list.filter((id) => !found.has(id)).map((item_id) => ({ item_id, failed_reason: 'item not found' })),
          };
        },
      }),
      op({
        path: '/product/get_category',
        method: 'GET',
        auth: 'shop',
        input: z.object({ language: z.string().optional() }),
        handler: async (_ctx, input) => {
          const categories = await this.prisma.category.findMany({ include: { _count: { select: { children: true } } }, orderBy: { id: 'asc' } });
          const english = input.language?.toLowerCase().startsWith('en');
          return {
            category_list: categories.map((c) => ({
              category_id: c.id,
              parent_category_id: c.parentId ?? 0,
              original_category_name: c.name,
              display_category_name: english ? c.name : c.displayName,
              has_children: c._count.children > 0,
            })),
          };
        },
      }),
      op({
        path: '/product/get_attribute_tree',
        method: 'GET',
        auth: 'shop',
        input: z.object({ category_id_list: q.intList().pipe(z.array(z.number()).min(1).max(20)), language: z.string().optional() }),
        handler: async (_ctx, input) => {
          const attributes = await this.prisma.categoryAttribute.findMany({
            where: { categoryId: { in: input.category_id_list } },
            orderBy: { id: 'asc' },
          });
          return {
            list: input.category_id_list.map((categoryId) => ({
              category_id: categoryId,
              attribute_tree: attributes
                .filter((a) => a.categoryId === categoryId)
                .map((a) => ({
                  attribute_id: a.id,
                  mandatory: a.isMandatory,
                  name: a.name,
                  attribute_value_list: (a.values as Array<{ value_id: number; name: string; display_name?: string }>).map((v) => ({
                    value_id: v.value_id,
                    name: v.name,
                    multi_lang: v.display_name ? [{ language: 'vi', value: v.display_name }] : [],
                  })),
                  attribute_info: { input_type: a.inputType === 'TEXT_FILED' ? 2 : 1, max_value_count: 1 },
                  multi_lang: [{ language: 'vi', value: a.displayName }],
                })),
            })),
          };
        },
      }),
      op({
        path: '/product/get_brand_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          offset: q.int().min(0).default(0),
          page_size: q.int().min(1).max(100),
          category_id: q.int(),
          status: q.int().default(1),
          language: z.string().optional(),
        }),
        handler: async (_ctx, input) => {
          const categoryIds = await this.categoryLineage(input.category_id);
          const where: Prisma.BrandWhereInput = { OR: [{ categoryId: null }, { categoryId: { in: categoryIds } }] };
          const [brands, total] = await Promise.all([
            this.prisma.brand.findMany({ where, orderBy: { id: 'asc' }, skip: input.offset, take: input.page_size }),
            this.prisma.brand.count({ where }),
          ]);
          const hasNext = input.offset + brands.length < total;
          return {
            brand_list: brands.map((b) => ({ brand_id: b.id, original_brand_name: b.name, display_brand_name: b.name })),
            has_next_page: hasNext,
            next_offset: hasNext ? input.offset + brands.length : 0,
            is_mandatory: false,
            input_type: 'DROP_DOWN',
          };
        },
      }),
      op({
        path: '/product/add_item',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          original_price: price,
          description: z.string().trim().min(1).max(5000),
          weight: q.num().positive().max(1000),
          item_name: z.string().trim().min(1).max(120),
          item_status: z.enum(['NORMAL', 'UNLIST']).default('NORMAL'),
          dimension: dimension.optional(),
          logistic_info: logisticInfo,
          attribute_list: attributeList,
          category_id: q.int(),
          image: z.object({ image_id_list: z.array(z.string()).min(1).max(9), image_ratio: z.string().optional() }),
          pre_order: z.object({ is_pre_order: q.bool().default(false), days_to_ship: q.int().min(1).max(30).optional() }).optional(),
          item_sku: z.string().max(100).optional(),
          condition: z.enum(['NEW', 'USED']).default('NEW'),
          brand: z.object({ brand_id: q.int(), original_brand_name: z.string().optional() }).optional(),
          seller_stock: sellerStock,
        }),
        handler: async (ctx, input) => {
          await this.assertLeafCategory(input.category_id);
          await this.assertBrand(input.brand?.brand_id);
          await this.assertImages(ctx.shopId, input.image.image_id_list);
          const logistics = await this.normalizeLogistics(input.logistic_info);
          const stock = input.seller_stock.reduce((s, x) => s + x.stock, 0);
          const item = await this.prisma.$transaction(async (tx) => {
            const created = await tx.item.create({
              data: {
                shopId: ctx.shopId,
                categoryId: input.category_id,
                brandId: input.brand?.brand_id || null,
                name: input.item_name,
                description: input.description,
                itemSku: input.item_sku ?? '',
                status: input.item_status,
                condition: input.condition,
                weightKg: dec(input.weight),
                lengthCm: input.dimension?.package_length ?? 10,
                widthCm: input.dimension?.package_width ?? 10,
                heightCm: input.dimension?.package_height ?? 10,
                daysToShip: input.pre_order?.days_to_ship ?? 2,
                attributes: (input.attribute_list ?? []) as Prisma.InputJsonValue,
                logistics: logistics as Prisma.InputJsonValue,
                images: {
                  create: input.image.image_id_list.map((imageId, idx) => ({ imageId, url: `/media/${imageId}`, sortOrder: idx })),
                },
                models: { create: { isDefault: true, tierIndex: [], originalPrice: dec(input.original_price), stock, sku: input.item_sku ?? '' } },
              },
            });
            return this.catalog.getShopItem(ctx.shopId, created.id, tx);
          });
          const attrs = await this.attributeNames([item.categoryId]);
          const base = this.presentBaseInfo(item, attrs);
          return {
            ...base,
            images: base.image,
            attribute: base.attribute_list,
            price_info: { original_price: input.original_price, current_price: input.original_price },
            weight: input.weight,
            seller_stock: [{ location_id: '', stock }],
          };
        },
      }),
      op({
        path: '/product/update_item',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          item_id: q.int(),
          description: z.string().trim().min(1).max(5000).optional(),
          weight: q.num().positive().max(1000).optional(),
          item_name: z.string().trim().min(1).max(120).optional(),
          item_status: z.enum(['NORMAL', 'UNLIST']).optional(),
          dimension: dimension.optional(),
          logistic_info: logisticInfo.optional(),
          attribute_list: attributeList,
          category_id: q.int().optional(),
          image: z.object({ image_id_list: z.array(z.string()).min(1).max(9) }).optional(),
          pre_order: z.object({ is_pre_order: q.bool().default(false), days_to_ship: q.int().min(1).max(30).optional() }).optional(),
          item_sku: z.string().max(100).optional(),
          condition: z.enum(['NEW', 'USED']).optional(),
          brand: z.object({ brand_id: q.int(), original_brand_name: z.string().optional() }).optional(),
        }),
        handler: async (ctx, input) => {
          const existing = await this.catalog.getShopItem(ctx.shopId, input.item_id);
          if (existing.status === 'BANNED') throw invalidState('Banned items cannot be edited');
          if (input.category_id) await this.assertLeafCategory(input.category_id);
          if (input.brand) await this.assertBrand(input.brand.brand_id);
          if (input.image) await this.assertImages(ctx.shopId, input.image.image_id_list);
          const logistics = input.logistic_info ? await this.normalizeLogistics(input.logistic_info) : undefined;
          await this.prisma.$transaction(async (tx) => {
            await tx.item.update({
              where: { id: existing.id },
              data: {
                name: input.item_name,
                description: input.description,
                weightKg: input.weight !== undefined ? dec(input.weight) : undefined,
                status: input.item_status,
                lengthCm: input.dimension?.package_length,
                widthCm: input.dimension?.package_width,
                heightCm: input.dimension?.package_height,
                logistics: logistics as Prisma.InputJsonValue | undefined,
                attributes: input.attribute_list as Prisma.InputJsonValue | undefined,
                categoryId: input.category_id,
                daysToShip: input.pre_order?.days_to_ship,
                itemSku: input.item_sku,
                condition: input.condition,
                brandId: input.brand ? input.brand.brand_id || null : undefined,
              },
            });
            if (input.image) {
              await tx.itemImage.deleteMany({ where: { itemId: existing.id } });
              await tx.itemImage.createMany({
                data: input.image.image_id_list.map((imageId, idx) => ({ itemId: existing.id, imageId, url: `/media/${imageId}`, sortOrder: idx })),
              });
            }
          });
          const item = await this.catalog.getShopItem(ctx.shopId, existing.id);
          const attrs = await this.attributeNames([item.categoryId]);
          const base = this.presentBaseInfo(item, attrs);
          return { ...base, images: base.image, attribute: base.attribute_list };
        },
      }),
      op({
        path: '/product/delete_item',
        method: 'POST',
        auth: 'shop',
        input: z.object({ item_id: q.int() }),
        handler: async (ctx, input) => {
          const item = await this.catalog.getShopItem(ctx.shopId, input.item_id);
          await this.prisma.$transaction([
            this.prisma.item.update({ where: { id: item.id }, data: { status: 'DELETED' } }),
            this.prisma.cartItem.deleteMany({ where: { model: { itemId: item.id } } }),
          ]);
          return {};
        },
      }),
      op({
        path: '/product/unlist_item',
        method: 'POST',
        auth: 'shop',
        input: z.object({ item_list: z.array(z.object({ item_id: q.int(), unlist: q.bool() })).min(1).max(50) }),
        handler: async (ctx, input) => {
          const success_list: Array<{ item_id: number; unlist: boolean }> = [];
          const failure_list: Array<{ item_id: number; failed_reason: string }> = [];
          for (const entry of input.item_list) {
            const item = await this.prisma.item.findFirst({ where: { id: entry.item_id, shopId: ctx.shopId, status: { in: ['NORMAL', 'UNLIST'] } } });
            if (!item) {
              failure_list.push({ item_id: entry.item_id, failed_reason: 'item not found or not editable' });
              continue;
            }
            await this.prisma.item.update({ where: { id: item.id }, data: { status: entry.unlist ? 'UNLIST' : 'NORMAL' } });
            success_list.push({ item_id: entry.item_id, unlist: entry.unlist });
          }
          return { success_list, failure_list };
        },
      }),
      op({
        path: '/product/init_tier_variation',
        method: 'POST',
        auth: 'shop',
        input: z
          .object({
            item_id: q.int(),
            tier_variation: tierVariationInput.optional(),
            standardise_tier_variation: standardiseTierVariationInput.optional(),
            model: z.array(modelInput).min(1).max(200),
          })
          .refine((v) => v.tier_variation || v.standardise_tier_variation, { message: 'tier_variation is required', path: ['tier_variation'] }),
        handler: async (ctx, input) => {
          const item = await this.catalog.getShopItem(ctx.shopId, input.item_id);
          if (item.hasModel) throw invalidState('Item already has a tier variation; use add_model / update_tier_variation');
          const tiers: TierVariation[] =
            input.tier_variation?.map((t) => ({
              name: t.name,
              option_list: t.option_list.map((o) => ({ option: o.option, ...(o.image ? { image_id: o.image.image_id } : {}) })),
            })) ??
            input.standardise_tier_variation!.map((t) => ({
              name: t.variation_name,
              option_list: t.variation_option_list.map((o) => ({ option: o.variation_option_name, ...(o.image_id ? { image_id: o.image_id } : {}) })),
            }));
          this.assertTierIndexes(tiers, input.model.map((m) => m.tier_index));
          const models = await this.prisma.$transaction(async (tx) => {
            await tx.item.update({ where: { id: item.id }, data: { hasModel: true, tierVariation: tiers as unknown as Prisma.InputJsonValue } });
            // The default model is replaced by real variants; carts holding it are cleared.
            await tx.model.deleteMany({ where: { itemId: item.id, isDefault: true } });
            return this.createModels(tx, item.id, input.model);
          });
          return {
            item_id: item.id,
            tier_variation: tiers.map((t) => ({ name: t.name, option_list: t.option_list.map((o) => ({ option: o.option })) })),
            model: models,
          };
        },
      }),
      op({
        path: '/product/update_tier_variation',
        method: 'POST',
        auth: 'shop',
        input: z.object({ item_id: q.int(), tier_variation: tierVariationInput }),
        handler: async (ctx, input) => {
          const item = await this.catalog.getShopItem(ctx.shopId, input.item_id);
          if (!item.hasModel) throw invalidState('Item has no tier variation; call init_tier_variation first');
          const current = tierVariations(item);
          if (input.tier_variation.length !== current.length) throw validation('Number of tiers cannot change');
          input.tier_variation.forEach((t, i) => {
            if (t.option_list.length < current[i]!.option_list.length) throw validation('Options can only be renamed or appended');
          });
          const tiers: TierVariation[] = input.tier_variation.map((t) => ({
            name: t.name,
            option_list: t.option_list.map((o) => ({ option: o.option, ...(o.image ? { image_id: o.image.image_id } : {}) })),
          }));
          await this.prisma.item.update({ where: { id: item.id }, data: { tierVariation: tiers as unknown as Prisma.InputJsonValue } });
          return {};
        },
      }),
      op({
        path: '/product/add_model',
        method: 'POST',
        auth: 'shop',
        input: z.object({ item_id: q.int(), model_list: z.array(modelInput).min(1).max(50) }),
        handler: async (ctx, input) => {
          const item = await this.catalog.getShopItem(ctx.shopId, input.item_id);
          if (!item.hasModel) throw invalidState('Item has no tier variation; call init_tier_variation first');
          const tiers = tierVariations(item);
          const existing = sellableModels(item).map((m) => m.tierIndex);
          this.assertTierIndexes(tiers, [...existing, ...input.model_list.map((m) => m.tier_index)]);
          const models = await this.prisma.$transaction((tx) => this.createModels(tx, item.id, input.model_list));
          return { model: models };
        },
      }),
      op({
        path: '/product/update_model',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          item_id: q.int(),
          model: z
            .array(
              z.object({
                model_id: q.int(),
                model_sku: z.string().max(100).optional(),
                model_status: z.enum(['NORMAL', 'UNAVAILABLE', 'MODEL_NORMAL', 'MODEL_UNAVAILABLE']).optional(),
                weight: q.num().positive().optional(),
              }),
            )
            .min(1)
            .max(50),
        }),
        handler: async (ctx, input) => {
          const item = await this.catalog.getShopItem(ctx.shopId, input.item_id);
          for (const m of input.model) {
            const model = this.findModel(item, m.model_id);
            if (!model) throw notFound(`Model ${m.model_id}`);
            await this.prisma.model.update({
              where: { id: model.id },
              data: {
                sku: m.model_sku,
                weightKg: m.weight !== undefined ? dec(m.weight) : undefined,
                status: m.model_status ? (m.model_status.endsWith('UNAVAILABLE') ? 'MODEL_UNAVAILABLE' : 'MODEL_NORMAL') : undefined,
              },
            });
          }
          await this.prisma.item.update({ where: { id: item.id }, data: { updatedAt: new Date() } });
          return {};
        },
      }),
      op({
        path: '/product/delete_model',
        method: 'POST',
        auth: 'shop',
        input: z.object({ item_id: q.int(), model_id: q.int() }),
        handler: async (ctx, input) => {
          const item = await this.catalog.getShopItem(ctx.shopId, input.item_id);
          const model = this.findModel(item, input.model_id);
          if (!model || model.isDefault) throw notFound(`Model ${input.model_id}`);
          if (sellableModels(item).length <= 1) throw invalidState('Cannot delete the last model of an item');
          await this.prisma.model.delete({ where: { id: model.id } });
          return {};
        },
      }),
      op({
        path: '/product/update_stock',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          item_id: q.int(),
          stock_list: z.array(z.object({ model_id: q.int().default(0), seller_stock: sellerStock })).min(1).max(50),
        }),
        handler: async (ctx, input) => this.updateModels(ctx, input.item_id, input.stock_list, 'stock'),
      }),
      op({
        path: '/product/update_price',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          item_id: q.int(),
          price_list: z.array(z.object({ model_id: q.int().default(0), original_price: price })).min(1).max(50),
        }),
        handler: async (ctx, input) => this.updateModels(ctx, input.item_id, input.price_list, 'price'),
      }),
    ];
  }

  // ---------------------------------------------------------------------------

  private async updateModels(
    ctx: CompatContext,
    itemId: number,
    entries: Array<{ model_id: number; seller_stock?: Array<{ stock: number }>; original_price?: number }>,
    kind: 'stock' | 'price',
  ) {
    const item = await this.catalog.getShopItem(ctx.shopId, itemId);
    const success_list: Array<Record<string, unknown>> = [];
    const failure_list: Array<{ model_id: number; failed_reason: string }> = [];
    await this.prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        const model = this.findModel(item, entry.model_id);
        if (!model || (item.hasModel && model.isDefault)) {
          failure_list.push({ model_id: entry.model_id, failed_reason: 'model not found' });
          continue;
        }
        if (kind === 'stock') {
          const stock = entry.seller_stock!.reduce((s, x) => s + x.stock, 0);
          await tx.model.update({ where: { id: model.id }, data: { stock } });
          success_list.push({ model_id: entry.model_id, location_id: '', stock });
        } else {
          await tx.model.update({ where: { id: model.id }, data: { originalPrice: dec(entry.original_price!) } });
          success_list.push({ model_id: entry.model_id, original_price: entry.original_price });
        }
      }
      await tx.item.update({ where: { id: item.id }, data: { updatedAt: new Date() } });
    });
    if (kind === 'stock' && success_list.length) {
      await this.push.emit(ctx.shopId, 'stock_update', { item_id: item.id, models: success_list });
    }
    return { success_list, failure_list };
  }

  private findModel(item: ItemWithRelations, externalId: number): ModelWithDiscounts | undefined {
    return externalId === 0 ? item.models.find((m) => m.isDefault) : item.models.find((m) => m.id === externalId && !m.isDefault);
  }

  private async createModels(tx: Tx, itemId: number, models: Array<z.infer<typeof modelInput>>) {
    const created = [];
    for (const m of models) {
      const stock = m.seller_stock.reduce((s, x) => s + x.stock, 0);
      const row = await tx.model.create({
        data: {
          itemId,
          tierIndex: m.tier_index,
          sku: m.model_sku ?? '',
          originalPrice: dec(m.original_price),
          stock,
          weightKg: m.weight !== undefined ? dec(m.weight) : undefined,
        },
      });
      created.push({
        tier_index: row.tierIndex,
        model_id: row.id,
        model_sku: row.sku,
        price_info: [{ original_price: m.original_price, current_price: m.original_price }],
        seller_stock: [{ location_id: '', stock }],
        weight: m.weight,
      });
    }
    return created;
  }

  private assertTierIndexes(tiers: TierVariation[], indexes: number[][]) {
    const seen = new Set<string>();
    for (const idx of indexes) {
      if (idx.length !== tiers.length) throw validation('tier_index length must equal number of tiers');
      idx.forEach((optionIdx, tierIdx) => {
        if (optionIdx >= tiers[tierIdx]!.option_list.length) throw validation(`tier_index ${JSON.stringify(idx)} is out of range`);
      });
      const key = idx.join(',');
      if (seen.has(key)) throw new DomainError('VALIDATION', `Duplicate tier_index ${JSON.stringify(idx)}`);
      seen.add(key);
    }
  }

  private async assertLeafCategory(categoryId: number) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId }, include: { _count: { select: { children: true } } } });
    if (!category) throw validation(`Invalid category_id ${categoryId}`);
    if (category._count.children > 0) throw validation('category_id must be a leaf category');
  }

  private async categoryLineage(categoryId: number): Promise<number[]> {
    const ids: number[] = [];
    let current = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!current) throw validation(`Invalid category_id ${categoryId}`);
    while (current) {
      ids.push(current.id);
      current = current.parentId ? await this.prisma.category.findUnique({ where: { id: current.parentId } }) : null;
    }
    return ids;
  }

  private async assertBrand(brandId: number | undefined) {
    if (!brandId) return;
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw validation(`Invalid brand_id ${brandId}`);
  }

  private async assertImages(shopId: number, imageIds: string[]) {
    const images = await this.prisma.mediaImage.findMany({
      where: { imageId: { in: imageIds }, OR: [{ shopId }, { shopId: null }] },
      select: { imageId: true },
    });
    const found = new Set(images.map((i) => i.imageId));
    const missing = imageIds.filter((id) => !found.has(id));
    if (missing.length) throw validation(`Unknown image_id: ${missing.join(', ')} (upload via media_space/upload_image first)`);
  }

  private async normalizeLogistics(list: Array<{ logistic_id: number; enabled: boolean; is_free?: boolean; shipping_fee?: number }>) {
    const channels = await this.prisma.logisticsChannel.findMany({ where: { id: { in: list.map((l) => l.logistic_id) } } });
    const known = new Set(channels.map((c) => c.id));
    const unknown = list.filter((l) => !known.has(l.logistic_id));
    if (unknown.length) throw validation(`Invalid logistic_id: ${unknown.map((u) => u.logistic_id).join(', ')}`);
    if (!list.some((l) => l.enabled)) throw validation('At least one logistics channel must be enabled');
    return list.map((l) => ({ logistic_id: l.logistic_id, enabled: l.enabled, is_free: l.is_free ?? false }));
  }

  private async attributeNames(categoryIds: number[]) {
    const attrs = await this.prisma.categoryAttribute.findMany({ where: { categoryId: { in: categoryIds } } });
    return new Map(attrs.map((a) => [a.id, a]));
  }

  private presentBaseInfo(item: ItemWithRelations, attrs: Map<number, { name: string; isMandatory: boolean; values: Prisma.JsonValue }>) {
    const defaultModel = item.models.find((m) => m.isDefault);
    const price = !item.hasModel && defaultModel ? resolveModelPrice(defaultModel) : null;
    const logistics = (Array.isArray(item.logistics) ? item.logistics : []) as Array<{ logistic_id: number; enabled: boolean; is_free: boolean }>;
    const attributeList = (Array.isArray(item.attributes) ? item.attributes : []) as Array<{
      attribute_id: number;
      attribute_value_list?: Array<{ value_id: number; original_value_name?: string; value_unit?: string }>;
    }>;
    return {
      item_id: item.id,
      category_id: item.categoryId,
      item_name: item.name,
      description: item.description,
      description_type: 'normal',
      item_sku: item.itemSku,
      create_time: unix(item.createdAt),
      update_time: unix(item.updatedAt),
      attribute_list: attributeList.map((a) => {
        const def = attrs.get(a.attribute_id);
        const values = (def?.values ?? []) as Array<{ value_id: number; name: string }>;
        return {
          attribute_id: a.attribute_id,
          original_attribute_name: def?.name ?? '',
          is_mandatory: def?.isMandatory ?? false,
          attribute_value_list: (a.attribute_value_list ?? []).map((v) => ({
            value_id: v.value_id,
            original_value_name: v.original_value_name ?? values.find((x) => x.value_id === v.value_id)?.name ?? '',
            value_unit: v.value_unit ?? '',
          })),
        };
      }),
      ...(price ? { price_info: [{ currency: CURRENCY, original_price: price.originalPrice, current_price: price.currentPrice }] } : {}),
      image: {
        image_url_list: item.images.map((i) => mediaUrl(i.url)),
        image_id_list: item.images.map((i) => i.imageId),
        image_ratio: '1:1',
      },
      weight: toNumber(item.weightKg).toFixed(3),
      dimension: { package_length: item.lengthCm, package_width: item.widthCm, package_height: item.heightCm },
      logistic_info: logistics.map((l) => ({ logistic_id: l.logistic_id, enabled: l.enabled, is_free: l.is_free })),
      pre_order: { is_pre_order: item.daysToShip > 2, days_to_ship: item.daysToShip },
      condition: item.condition,
      size_chart: '',
      item_status: toExternalStatus(item.status),
      deboost: false,
      has_model: item.hasModel,
      has_promotion: sellableModels(item).some((m) => resolveModelPrice(m).promotionId !== null),
      brand: { brand_id: item.brand?.id ?? 0, original_brand_name: item.brand?.name ?? 'NoBrand' },
      item_dangerous: 0,
      ...(!item.hasModel && defaultModel
        ? {
            stock_info_v2: {
              summary_info: { total_reserved_stock: defaultModel.reservedStock, total_available_stock: defaultModel.stock },
              seller_stock: [{ location_id: '', stock: defaultModel.stock, if_saleable: defaultModel.status === 'MODEL_NORMAL' }],
            },
          }
        : {}),
    };
  }

  private presentModels(item: ItemWithRelations) {
    const tiers = tierVariations(item);
    if (!item.hasModel) return { tier_variation: [], model: [], standardise_tier_variation: [] };
    return {
      tier_variation: tiers.map((t) => ({
        name: t.name,
        option_list: t.option_list.map((o) => ({
          option: o.option,
          ...(o.image_id ? { image: { image_id: o.image_id, image_url: mediaUrl(`/media/${o.image_id}`) } } : {}),
        })),
      })),
      model: sellableModels(item).map((m) => {
        const p = resolveModelPrice(m);
        return {
          model_id: m.id,
          tier_index: m.tierIndex,
          promotion_id: p.promotionId ?? 0,
          has_promotion: p.promotionId !== null,
          model_sku: m.sku,
          model_status: m.status,
          price_info: [
            {
              currency: CURRENCY,
              current_price: p.currentPrice,
              original_price: p.originalPrice,
              inflated_price_of_original_price: p.originalPrice,
              inflated_price_of_current_price: p.currentPrice,
            },
          ],
          stock_info_v2: {
            summary_info: { total_reserved_stock: m.reservedStock, total_available_stock: m.stock },
            seller_stock: [{ location_id: '', stock: m.stock, if_saleable: m.status === 'MODEL_NORMAL' }],
          },
          pre_order: { is_pre_order: item.daysToShip > 2, days_to_ship: item.daysToShip },
          weight: m.weightKg ? toNumber(m.weightKg).toFixed(3) : toNumber(item.weightKg).toFixed(3),
        };
      }),
      standardise_tier_variation: [],
    };
  }
}

export function maskName(name: string): string {
  const compact = name.replace(/\s+/g, '');
  if (compact.length <= 2) return compact[0] + '*';
  return `${compact[0]}*****${compact[compact.length - 1]}`;
}
