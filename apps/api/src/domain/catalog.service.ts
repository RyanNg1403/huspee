import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { loadConfig } from '../config';
import { notFound } from '../common/errors';
import { toNumber } from '../common/money';
import { PrismaService, Tx } from '../common/prisma.service';

export const itemInclude = {
  images: { orderBy: { sortOrder: 'asc' } },
  models: {
    orderBy: { id: 'asc' },
    include: {
      discountModels: { include: { discount: true } },
    },
  },
  brand: true,
  category: true,
} satisfies Prisma.ItemInclude;

export type ItemWithRelations = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;
export type ModelWithDiscounts = ItemWithRelations['models'][number];

export interface TierVariation {
  name: string;
  option_list: Array<{ option: string; image_id?: string }>;
}

export interface ModelPrice {
  originalPrice: number;
  currentPrice: number;
  promotionId: number | null;
  promotionEnd: Date | null;
  promotionStart: Date | null;
}

export function mediaUrl(pathOrUrl: string): string {
  const config = loadConfig();
  if (config.BROWSER_PROXY_ENABLED && pathOrUrl.startsWith(`${config.PUBLIC_BASE_URL}/media/`)) {
    return pathOrUrl.slice(config.PUBLIC_BASE_URL.length);
  }
  return pathOrUrl.startsWith('/') && !config.BROWSER_PROXY_ENABLED ? `${config.PUBLIC_BASE_URL}${pathOrUrl}` : pathOrUrl;
}

export function mediaPath(imageId: string): string {
  return `/media/${imageId}`;
}

/** Deterministic price resolution: lowest active discount price wins, never above original. */
export function resolveModelPrice(model: ModelWithDiscounts, at: Date = new Date()): ModelPrice {
  const originalPrice = toNumber(model.originalPrice);
  let best: ModelPrice = { originalPrice, currentPrice: originalPrice, promotionId: null, promotionEnd: null, promotionStart: null };
  for (const dm of model.discountModels) {
    if (dm.discount.startTime <= at && dm.discount.endTime > at) {
      const price = toNumber(dm.promotionPrice);
      if (price < best.currentPrice) {
        best = { originalPrice, currentPrice: price, promotionId: dm.discountId, promotionEnd: dm.discount.endTime, promotionStart: dm.discount.startTime };
      }
    }
  }
  return best;
}

export function tierVariations(item: { tierVariation: Prisma.JsonValue }): TierVariation[] {
  return Array.isArray(item.tierVariation) ? (item.tierVariation as unknown as TierVariation[]) : [];
}

export function modelName(item: { tierVariation: Prisma.JsonValue }, tierIndex: number[]): string {
  const tiers = tierVariations(item);
  return tierIndex
    .map((optionIdx, tierIdx) => tiers[tierIdx]?.option_list?.[optionIdx]?.option)
    .filter((x): x is string => !!x)
    .join(', ');
}

/** Selected variant media is authoritative; unillustrated variants retain the product hero. */
export function modelImage(item: { tierVariation: Prisma.JsonValue; images: ReadonlyArray<{ url: string }> }, tierIndex: number[] = []): string | null {
  const options = tierVariations(item).map((tier, index) => ({
    name: tier.name,
    imageId: tier.option_list?.[tierIndex[index] ?? -1]?.image_id,
  }));
  const color = options.find((option) => /màu|colou?r/i.test(option.name) && option.imageId);
  const imageId = color?.imageId ?? options.find((option) => option.imageId)?.imageId;
  return imageId ? mediaUrl(mediaPath(imageId)) : item.images[0] ? mediaUrl(item.images[0].url) : null;
}

/** Sellable models: the default model for items without variations, otherwise the real variants. */
export function sellableModels(item: ItemWithRelations): ModelWithDiscounts[] {
  return item.models.filter((m) => (item.hasModel ? !m.isDefault : m.isDefault));
}

/** Shopee exposes model_id 0 for an item without variations. */
export function externalModelId(model: { id: number; isDefault: boolean }): number {
  return model.isDefault ? 0 : model.id;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Seller-scoped lookup: the item must belong to the shop and not be deleted. */
  async getShopItem(shopId: number, itemId: number, db: Tx = this.prisma): Promise<ItemWithRelations> {
    const item = await db.item.findFirst({ where: { id: itemId, shopId, status: { not: 'DELETED' } }, include: itemInclude });
    if (!item) throw notFound(`Item ${itemId}`);
    return item;
  }

  async getShopItems(shopId: number, itemIds: number[]): Promise<ItemWithRelations[]> {
    return this.prisma.item.findMany({
      where: { id: { in: itemIds }, shopId, status: { not: 'DELETED' } },
      include: itemInclude,
    });
  }

  /** Public lookup: only listed items in active shops. */
  async getPublicItem(itemId: number): Promise<ItemWithRelations & { shop: { id: number; name: string; status: string; holidayMode: boolean } }> {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, status: 'NORMAL', shop: { status: 'NORMAL' } },
      include: { ...itemInclude, shop: { select: { id: true, name: true, status: true, holidayMode: true } } },
    });
    if (!item) throw notFound('Product');
    return item;
  }

  priceRange(item: ItemWithRelations, at = new Date()) {
    const prices = sellableModels(item).map((m) => resolveModelPrice(m, at));
    if (prices.length === 0) return { min: 0, max: 0, minOriginal: 0, maxOriginal: 0, hasPromotion: false };
    return {
      min: Math.min(...prices.map((p) => p.currentPrice)),
      max: Math.max(...prices.map((p) => p.currentPrice)),
      minOriginal: Math.min(...prices.map((p) => p.originalPrice)),
      maxOriginal: Math.max(...prices.map((p) => p.originalPrice)),
      hasPromotion: prices.some((p) => p.promotionId !== null),
    };
  }

  totalStock(item: ItemWithRelations): number {
    return sellableModels(item).reduce((sum, m) => sum + (m.status === 'MODEL_NORMAL' ? m.stock : 0), 0);
  }

  async ratingSummary(itemIds: number[]): Promise<Map<number, { count: number; avg: number }>> {
    const rows = await this.prisma.review.groupBy({
      by: ['itemId'],
      where: { itemId: { in: itemIds }, hidden: false },
      _count: { _all: true },
      _avg: { rating: true },
    });
    return new Map(rows.map((r) => [r.itemId, { count: r._count._all, avg: Math.round((r._avg.rating ?? 0) * 10) / 10 }]));
  }
}
