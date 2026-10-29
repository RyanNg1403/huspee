import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { notFound } from '../common/errors';
import { toNumber } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { unix } from '../common/time';
import { paging, parseInput, q } from '../common/validation';
import { Public, SessionGuard } from '../auth/session.guard';
import { maskName } from '../compat/ops/product.ops';
import {
  CatalogService,
  itemInclude,
  ItemWithRelations,
  mediaUrl,
  modelName,
  resolveModelPrice,
  sellableModels,
  tierVariations,
} from '../domain/catalog.service';
import { ShopService } from '../domain/shop.service';
import { DISPLAY_ALL_PAGES, voucherState, VoucherService } from '../domain/voucher.service';

const SORTS = ['relevance', 'price_asc', 'price_desc', 'newest', 'top_sales', 'rating'] as const;

const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category_id: q.int().optional(),
  shop_id: q.int().optional(),
  min_price: q.num().min(0).optional(),
  max_price: q.num().min(0).optional(),
  in_stock: q.bool().optional(),
  has_promotion: q.bool().optional(),
  min_rating: q.num().min(0).max(5).optional(),
  sort: z.enum(SORTS).default('relevance'),
  ...paging,
});

/**
 * Public, cross-shop marketplace API (project-defined, not a Shopee API). Only listed items
 * of active shops are visible; seller-only fields (SKU, reserved stock, cost data) are omitted.
 */
@Controller('api/v1/marketplace')
@UseGuards(SessionGuard)
@Public()
export class MarketplaceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly vouchers: VoucherService,
    private readonly shops: ShopService,
  ) {}

  @Get('categories')
  async categories() {
    const categories = await this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    type Node = { category_id: number; name: string; display_name: string; image_url: string | null; children: Node[] };
    const nodes = new Map<number, Node>(
      categories.map((c) => [c.id, { category_id: c.id, name: c.name, display_name: c.displayName, image_url: c.imageUrl, children: [] }]),
    );
    const roots: Node[] = [];
    for (const c of categories) (c.parentId ? nodes.get(c.parentId)?.children : roots)?.push(nodes.get(c.id)!);
    return { data: roots };
  }

  @Get('shops')
  async listShops(@Query() query: unknown) {
    const input = parseInput(z.object({ q: z.string().trim().max(100).optional(), ...paging }), query);
    const where: Prisma.ShopWhereInput = {
      status: 'NORMAL',
      ...(input.q ? { name: { contains: input.q, mode: 'insensitive' } } : {}),
    };
    const [shops, total] = await Promise.all([
      this.prisma.shop.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (input.page - 1) * input.page_size,
        take: input.page_size,
        include: { _count: { select: { items: { where: { status: 'NORMAL' } } } } },
      }),
      this.prisma.shop.count({ where }),
    ]);
    return {
      data: await Promise.all(shops.map((s) => this.presentShop(s, s._count.items))),
      page: pageInfo(input.page, input.page_size, total),
    };
  }

  @Get('shops/:shopId')
  async getShop(@Param('shopId', ParseIntPipe) shopId: number) {
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId, status: 'NORMAL' },
      include: {
        _count: { select: { items: { where: { status: 'NORMAL' } } } },
        shopCategories: { where: { status: 'NORMAL' }, orderBy: [{ sortWeight: 'desc' }, { id: 'asc' }], include: { _count: { select: { items: true } } } },
      },
    });
    if (!shop) throw notFound('Shop');
    return {
      data: {
        ...(await this.presentShop(shop, shop._count.items)),
        collections: shop.shopCategories.map((c) => ({ shop_category_id: c.id, name: c.name, item_count: c._count.items })),
      },
    };
  }

  @Get('shops/:shopId/vouchers')
  async shopVouchers(@Param('shopId', ParseIntPipe) shopId: number) {
    await this.assertPublicShop(shopId);
    const now = new Date();
    const vouchers = await this.prisma.voucher.findMany({
      where: { shopId, endTime: { gt: now }, displayChannels: { has: DISPLAY_ALL_PAGES } },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });
    return {
      data: vouchers.map((v) => ({
        voucher_code: v.code,
        voucher_name: v.name,
        voucher_type: v.voucherType === 2 ? 'product' : 'shop',
        reward_type: v.rewardType === 2 ? 'percentage' : 'fixed_amount',
        discount_amount: v.discountAmount ? toNumber(v.discountAmount) : null,
        percentage: v.percentage,
        max_discount: v.maxPrice ? toNumber(v.maxPrice) : null,
        min_spend: toNumber(v.minBasketPrice),
        item_id_list: v.itemIds,
        start_time: unix(v.startTime),
        end_time: unix(v.endTime),
        status: voucherState(v, now),
        fully_redeemed: v.currentUsage >= v.usageQuantity,
      })),
    };
  }

  @Get('shops/:shopId/policies')
  async shopPolicies(@Param('shopId', ParseIntPipe) shopId: number) {
    await this.assertPublicShop(shopId);
    const policy = this.shops.presentPolicy(await this.shops.policy(shopId));
    const channels = await this.prisma.logisticsChannel.findMany({ where: { enabled: true }, orderBy: { id: 'asc' } });
    return {
      data: {
        ...policy,
        shipping_channels: channels.map((c) => ({
          logistics_channel_id: c.id,
          name: c.name,
          base_fee: toNumber(c.baseFee),
          per_kg_fee: toNumber(c.perKgFee),
          estimated_days: `${c.minDays}-${c.maxDays}`,
          cod_enabled: c.codEnabled,
        })),
      },
    };
  }

  @Get('products')
  async searchProducts(@Query() query: unknown) {
    const input = parseInput(searchSchema, query);
    const categoryIds = input.category_id ? await this.descendants(input.category_id) : undefined;
    const terms = input.q ? input.q.split(/\s+/).filter(Boolean) : [];
    const where: Prisma.ItemWhereInput = {
      status: 'NORMAL',
      shop: { status: 'NORMAL' },
      ...(input.shop_id ? { shopId: input.shop_id } : {}),
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      ...(terms.length
        ? {
            AND: terms.map((t) => ({
              OR: [
                { name: { contains: t, mode: 'insensitive' as const } },
                { brand: { name: { contains: t, mode: 'insensitive' as const } } },
                { category: { displayName: { contains: t, mode: 'insensitive' as const } } },
              ],
            })),
          }
        : {}),
    };
    // Phase 1 dataset is small: price/rating filters use computed (promotion-aware) prices in memory.
    const items = await this.prisma.item.findMany({ where, include: { ...itemInclude, shop: { select: { id: true, name: true, city: true } } } });
    const ratings = await this.catalog.ratingSummary(items.map((i) => i.id));
    let rows = items.map((item) => ({ item, range: this.catalog.priceRange(item), stock: this.catalog.totalStock(item), rating: ratings.get(item.id) }));
    if (input.min_price !== undefined) rows = rows.filter((r) => r.range.max >= input.min_price!);
    if (input.max_price !== undefined) rows = rows.filter((r) => r.range.min <= input.max_price!);
    if (input.in_stock) rows = rows.filter((r) => r.stock > 0);
    if (input.has_promotion) rows = rows.filter((r) => r.range.hasPromotion);
    if (input.min_rating !== undefined) rows = rows.filter((r) => (r.rating?.avg ?? 0) >= input.min_rating!);
    const score = (r: (typeof rows)[number]) => {
      const name = r.item.name.toLowerCase();
      return terms.reduce((s, t) => s + (name.includes(t.toLowerCase()) ? 2 : 1), 0) + Math.log10(1 + r.item.sales) / 10;
    };
    const sorters: Record<(typeof SORTS)[number], (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
      relevance: (a, b) => score(b) - score(a) || b.item.sales - a.item.sales,
      price_asc: (a, b) => a.range.min - b.range.min,
      price_desc: (a, b) => b.range.min - a.range.min,
      newest: (a, b) => b.item.createdAt.getTime() - a.item.createdAt.getTime(),
      top_sales: (a, b) => b.item.sales - a.item.sales,
      rating: (a, b) => (b.rating?.avg ?? 0) - (a.rating?.avg ?? 0) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0),
    };
    rows.sort((a, b) => sorters[input.sort](a, b) || a.item.id - b.item.id);
    const total = rows.length;
    const page = rows.slice((input.page - 1) * input.page_size, input.page * input.page_size);
    return {
      data: page.map((r) => ({
        item_id: r.item.id,
        name: r.item.name,
        image_url: r.item.images[0] ? mediaUrl(r.item.images[0].url) : null,
        shop: { shop_id: r.item.shop.id, shop_name: r.item.shop.name, city: r.item.shop.city },
        category_id: r.item.categoryId,
        brand: r.item.brand?.name ?? null,
        price_min: r.range.min,
        price_max: r.range.max,
        original_price_min: r.range.minOriginal,
        original_price_max: r.range.maxOriginal,
        has_promotion: r.range.hasPromotion,
        discount_percent: r.range.minOriginal > r.range.min ? Math.round((1 - r.range.min / r.range.minOriginal) * 100) : 0,
        in_stock: r.stock > 0,
        sold: r.item.sales,
        rating_star: r.rating?.avg ?? 0,
        rating_count: r.rating?.count ?? 0,
        currency: 'VND',
      })),
      page: pageInfo(input.page, input.page_size, total),
    };
  }

  @Get('products/:itemId')
  async getProduct(@Param('itemId', ParseIntPipe) itemId: number) {
    const item = await this.catalog.getPublicItem(itemId);
    const [ratings, attrs] = await Promise.all([
      this.catalog.ratingSummary([item.id]),
      this.prisma.categoryAttribute.findMany({ where: { categoryId: item.categoryId } }),
    ]);
    const range = this.catalog.priceRange(item);
    const rating = ratings.get(item.id);
    return {
      data: {
        item_id: item.id,
        name: item.name,
        description: item.description,
        condition: item.condition,
        shop: { shop_id: item.shop.id, shop_name: item.shop.name, on_holiday: item.shop.holidayMode },
        category: { category_id: item.category.id, display_name: item.category.displayName },
        brand: item.brand ? { brand_id: item.brand.id, name: item.brand.name } : null,
        images: item.images.map((i) => mediaUrl(i.url)),
        attributes: this.presentAttributes(item, attrs),
        price_min: range.min,
        price_max: range.max,
        original_price_min: range.minOriginal,
        original_price_max: range.maxOriginal,
        has_promotion: range.hasPromotion,
        currency: 'VND',
        stock: this.catalog.totalStock(item),
        sold: item.sales,
        likes: item.likes,
        rating_star: rating?.avg ?? 0,
        rating_count: rating?.count ?? 0,
        days_to_ship: item.daysToShip,
        weight_kg: toNumber(item.weightKg),
        tier_variations: tierVariations(item).map((t) => ({
          name: t.name,
          options: t.option_list.map((o) => ({ option: o.option, image_url: o.image_id ? mediaUrl(`/media/${o.image_id}`) : null })),
        })),
        models: sellableModels(item).map((m) => {
          const p = resolveModelPrice(m);
          return {
            model_id: m.id,
            tier_index: m.tierIndex,
            name: modelName(item, m.tierIndex),
            price: p.currentPrice,
            original_price: p.originalPrice,
            promotion_end_time: p.promotionEnd ? unix(p.promotionEnd) : null,
            stock: m.status === 'MODEL_NORMAL' ? m.stock : 0,
            available: m.status === 'MODEL_NORMAL' && m.stock > 0,
          };
        }),
      },
    };
  }

  @Get('products/:itemId/reviews')
  async reviews(@Param('itemId', ParseIntPipe) itemId: number, @Query() query: unknown) {
    const input = parseInput(z.object({ rating: q.int().min(1).max(5).optional(), ...paging }), query);
    await this.catalog.getPublicItem(itemId);
    const where: Prisma.ReviewWhereInput = { itemId, hidden: false, ...(input.rating ? { rating: input.rating } : {}) };
    const [rows, total, dist] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: { buyer: { select: { name: true } }, item: { select: { tierVariation: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.page_size,
        take: input.page_size,
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({ by: ['rating'], where: { itemId, hidden: false }, _count: { _all: true } }),
    ]);
    const models = await this.prisma.model.findMany({ where: { id: { in: rows.map((r) => r.modelId).filter((x): x is number => !!x) } } });
    const modelById = new Map(models.map((m) => [m.id, m]));
    return {
      data: rows.map((r) => ({
        comment_id: r.id,
        rating: r.rating,
        comment: r.comment,
        buyer_name: maskName(r.buyer.name),
        model_name: r.modelId && modelById.get(r.modelId) ? modelName(r.item, modelById.get(r.modelId)!.tierIndex) : null,
        image_urls: r.imageUrls.map(mediaUrl),
        seller_reply: r.sellerReply,
        verified_purchase: !!r.orderSn,
        create_time: unix(r.createdAt),
      })),
      summary: Object.fromEntries([1, 2, 3, 4, 5].map((star) => [String(star), dist.find((d) => d.rating === star)?._count._all ?? 0])),
      page: pageInfo(input.page, input.page_size, total),
    };
  }

  private async presentShop(shop: { id: number; name: string; description: string; logoUrl: string | null; city: string | null; isOfficial: boolean; holidayMode: boolean; createdAt: Date }, itemCount: number) {
    const rating = await this.prisma.review.aggregate({ where: { item: { shopId: shop.id }, hidden: false }, _avg: { rating: true }, _count: { _all: true } });
    return {
      shop_id: shop.id,
      shop_name: shop.name,
      description: shop.description,
      logo_url: shop.logoUrl ? mediaUrl(shop.logoUrl) : null,
      city: shop.city,
      is_official: shop.isOfficial,
      on_holiday: shop.holidayMode,
      item_count: itemCount,
      rating_star: Math.round((rating._avg.rating ?? 0) * 10) / 10,
      rating_count: rating._count._all,
      join_time: unix(shop.createdAt),
    };
  }

  private presentAttributes(item: ItemWithRelations, defs: Array<{ id: number; displayName: string; values: Prisma.JsonValue }>) {
    const list = (Array.isArray(item.attributes) ? item.attributes : []) as Array<{
      attribute_id: number;
      attribute_value_list?: Array<{ value_id: number; original_value_name?: string; value_unit?: string }>;
    }>;
    return list
      .map((a) => {
        const def = defs.find((d) => d.id === a.attribute_id);
        if (!def) return null;
        const values = (def.values ?? []) as Array<{ value_id: number; name: string; display_name?: string }>;
        const text = (a.attribute_value_list ?? [])
          .map((v) => {
            const known = values.find((x) => x.value_id === v.value_id);
            return (known?.display_name ?? known?.name ?? v.original_value_name ?? '') + (v.value_unit ? ` ${v.value_unit}` : '');
          })
          .filter(Boolean)
          .join(', ');
        return { name: def.displayName, value: text };
      })
      .filter((x): x is { name: string; value: string } => !!x && !!x.value);
  }

  private async descendants(categoryId: number): Promise<number[]> {
    const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const result = [categoryId];
    for (let i = 0; i < result.length; i++) for (const c of all) if (c.parentId === result[i]) result.push(c.id);
    return result;
  }

  private async assertPublicShop(shopId: number) {
    const shop = await this.prisma.shop.findFirst({ where: { id: shopId, status: 'NORMAL' } });
    if (!shop) throw notFound('Shop');
  }
}

export function pageInfo(page: number, pageSize: number, total: number) {
  return { page, page_size: pageSize, total, has_next: page * pageSize < total };
}
