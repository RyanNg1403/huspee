import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import manifest from './generated-images/manifest.json';
import { LOGISTICS_CHANNELS, SEED_BASE_TIME, type SeedItem } from './seed-data';

export interface CatalogAsset {
  key: string;
  kind: string;
  item_id?: number;
  shop_id: number;
  title: string;
  file: string;
  prompt: string;
  color?: string;
}

export const catalogAssets: CatalogAsset[] = manifest.assets;

/** Content-addressed IDs avoid reusing URLs cached as immutable by the media endpoint. */
export function loadCatalogAsset(asset: CatalogAsset) {
  if (path.basename(asset.file) !== asset.file) throw new Error('Invalid catalog image filename');
  const bytes = readFileSync(path.join(__dirname, 'generated-images', asset.file));
  const maxBytes = asset.kind === 'product' ? manifest.product_max_bytes : manifest.avatar_max_bytes;
  if (bytes.length > maxBytes || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP')
    throw new Error(`Invalid or oversized catalog image: ${asset.file}`);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  return {
    imageId: `generated-${asset.key}-${hash}`,
    shopId: asset.shop_id,
    mimeType: 'image/webp',
    data: new Uint8Array(bytes),
    createdAt: SEED_BASE_TIME,
  };
}

export function productMedia(itemId: number) {
  const assets = catalogAssets.filter((asset) => asset.kind === 'product' && asset.item_id === itemId);
  if (!assets.length) throw new Error(`Missing generated images for product ${itemId}`);
  return assets.map(loadCatalogAsset);
}

export function shopAvatar(shopId: number) {
  const asset = catalogAssets.find((asset) => asset.kind === 'shop' && asset.shop_id === shopId);
  if (!asset) throw new Error(`Missing generated shop avatar: ${shopId}`);
  return loadCatalogAsset(asset);
}

/** Attach generated color images without changing seller-defined variant names or options. */
export function withCatalogColorImages(itemId: number, tiers: Prisma.JsonValue): Prisma.InputJsonValue {
  if (!Array.isArray(tiers)) throw new Error(`Invalid variant tiers for product ${itemId}`);
  return tiers.map((tier) => {
    if (!tier || typeof tier !== 'object' || Array.isArray(tier) || typeof tier.name !== 'string' || !/màu/i.test(tier.name) || !Array.isArray(tier.option_list)) return tier;
    return { ...tier, option_list: tier.option_list.map((option) => {
      if (!option || typeof option !== 'object' || Array.isArray(option) || typeof option.option !== 'string') return option;
      if (typeof option.image_id === 'string' && option.image_id && !option.image_id.startsWith(`seed-photo-${itemId}-`) && !option.image_id.startsWith(`generated-${itemId}-`)) return option;
      const asset = catalogAssets.find((asset) => asset.item_id === itemId && asset.color === option.option);
      return asset ? { ...option, image_id: loadCatalogAsset(asset).imageId } : option;
    }) };
  }) as Prisma.InputJsonValue;
}

/** Shared fixture builder for a fresh seed and the non-destructive catalog update command. */
export function catalogItemData(item: SeedItem, index: number) {
  const hasModel = !!item.tiers;
  const createdAt = new Date(SEED_BASE_TIME.getTime() + (-30 + index % 20) * 86400000);
  return {
    id: item.id,
    shopId: item.shopId,
    categoryId: item.categoryId,
    brandId: item.brandId,
    name: item.name,
    description: item.description,
    itemSku: item.sku,
    weightKg: new Prisma.Decimal(item.weightKg),
    attributes: item.attributes as Prisma.InputJsonValue,
    logistics: LOGISTICS_CHANNELS.map((channel) => ({ logistic_id: channel.id, enabled: item.weightKg <= 2 || channel.id !== 50066, is_free: false })),
    tierVariation: withCatalogColorImages(item.id, (item.tiers ?? []).map((tier) => ({ name: tier.name, option_list: tier.options.map((option) => ({ option })) }))),
    hasModel,
    sales: item.sales,
    views: item.views,
    likes: item.likes,
    createdAt,
    updatedAt: createdAt,
    images: { create: productMedia(item.id).map(({ imageId }, sortOrder) => ({ imageId, url: `/media/${imageId}`, sortOrder })) },
    models: {
      create: item.models.map((model) => ({
        id: model.id,
        isDefault: !hasModel,
        tierIndex: model.tierIndex,
        sku: model.sku,
        originalPrice: new Prisma.Decimal(model.price),
        stock: model.stock,
        createdAt,
      })),
    },
  } satisfies Prisma.ItemUncheckedCreateInput;
}
