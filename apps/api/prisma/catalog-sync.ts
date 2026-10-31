import { Prisma, type PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { catalogAssets, catalogItemData, loadCatalogAsset, productMedia, shopAvatar, withCatalogColorImages } from './catalog-assets';
import { ATTRIBUTES, CATEGORIES, ITEMS, SEED_BASE_TIME, SHOPS } from './seed-data';

/** Add new fixtures and refresh fixture-owned images without resetting commerce or identity data. */
export async function syncCatalog(prisma: PrismaClient, options: { availableImagesOnly?: boolean } = {}) {
  // Validate and read every file before starting any database writes.
  const availableAssets = options.availableImagesOnly
    ? catalogAssets.filter((asset) => existsSync(path.join(__dirname, 'generated-images', asset.file)))
    : catalogAssets;
  const media = availableAssets.map(loadCatalogAsset);
  const availableKeys = new Set(availableAssets.map((asset) => asset.key));
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(880001, 20261031)`;
    for (const category of CATEGORIES)
      await tx.category.upsert({ where: { id: category.id }, create: category, update: {} });
    for (const attribute of ATTRIBUTES) {
      const current = await tx.categoryAttribute.upsert({ where: { id: attribute.id }, create: { ...attribute, values: attribute.values }, update: {} });
      if (!Array.isArray(current.values)) throw new Error(`Invalid values for category attribute ${attribute.id}`);
      const values = current.values;
      const missing = attribute.values.filter((value) => !values.some((existing) => existing !== null && typeof existing === 'object' && !Array.isArray(existing) && existing.value_id === value.value_id));
      if (missing.length) await tx.categoryAttribute.update({ where: { id: attribute.id }, data: { values: [...values, ...missing] as Prisma.InputJsonValue } });
    }
    for (const shop of SHOPS) {
      if (!(await tx.shop.findUnique({ where: { id: shop.id } }))) throw new Error('Initialize the demo database before syncing its catalog');
    }
    for (const image of media)
      await tx.mediaImage.upsert({ where: { imageId: image.imageId }, create: image, update: {} });
    for (const shop of SHOPS) {
      if (!catalogAssets.some((asset) => asset.kind === 'shop' && asset.shop_id === shop.id && availableKeys.has(asset.key))) continue;
      const avatar = shopAvatar(shop.id);
      const current = await tx.shop.findUniqueOrThrow({ where: { id: shop.id } });
      if (!current.logoUrl || current.logoUrl.startsWith('/media/seed-shoplogo-') || current.logoUrl.startsWith('/media/generated-shop-'))
        await tx.shop.update({ where: { id: shop.id }, data: { logoUrl: `/media/${avatar.imageId}` } });
    }

    let added = 0;
    let refreshed = 0;
    let pending = 0;
    for (const [index, item] of ITEMS.entries()) {
      if (catalogAssets.some((asset) => asset.item_id === item.id && !availableKeys.has(asset.key))) {
        pending++;
        continue;
      }
      const existing = await tx.item.findUnique({ where: { id: item.id }, include: { images: true } });
      if (existing && (existing.shopId !== item.shopId || existing.itemSku !== item.sku))
        throw new Error(`Catalog fixture ID ${item.id} conflicts with an existing listing`);
      if (!existing) {
        await tx.item.create({ data: catalogItemData(item, index) });
        added++;
        const discounted = item.models.filter((model) => model.promo !== undefined);
        if (discounted.length)
          await tx.discount.create({ data: {
            shopId: item.shopId, name: `Ưu đãi ${item.short}`,
            startTime: new Date('2025-01-01T00:00:00Z'), endTime: new Date('2035-01-01T00:00:00Z'),
            models: { create: discounted.map((model) => ({ modelId: model.id, promotionPrice: new Prisma.Decimal(model.promo!) })) },
          } });
        for (const name of item.collections ?? []) {
          const collection = await tx.shopCategory.findFirst({ where: { shopId: item.shopId, name } })
            ?? await tx.shopCategory.create({ data: { shopId: item.shopId, name, createdAt: SEED_BASE_TIME } });
          await tx.shopCategoryItem.create({ data: { shopCategoryId: collection.id, itemId: item.id, createdAt: SEED_BASE_TIME } });
        }
      } else {
        const fixtureOwned = existing.images.every((image) => image.imageId.startsWith(`seed-photo-${item.id}-`) || image.imageId.startsWith(`generated-${item.id}-`));
        if (fixtureOwned) {
          await tx.itemImage.deleteMany({ where: { itemId: item.id } });
          await tx.itemImage.createMany({ data: productMedia(item.id).map(({ imageId }, sortOrder) => ({ itemId: item.id, imageId, url: `/media/${imageId}`, sortOrder })) });
          await tx.item.update({ where: { id: item.id }, data: { tierVariation: withCatalogColorImages(item.id, existing.tierVariation) } });
          refreshed++;
        }
      }
      await tx.orderItem.updateMany({
        where: { itemId: item.id, imageUrl: { contains: `/media/seed-photo-${item.id}-` } },
        data: { imageUrl: `/media/${productMedia(item.id)[0]!.imageId}` },
      });
    }
    // Explicit fixture IDs must not leave autoincrement behind the new catalog.
    await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('items', 'id'), GREATEST((SELECT MAX(id) FROM items), (SELECT last_value FROM items_id_seq), 1))`;
    await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('models', 'id'), GREATEST((SELECT MAX(id) FROM models), (SELECT last_value FROM models_id_seq), 1))`;
    return { added, refreshed, pending, images: media.length };
  }, { timeout: 60000 });
}
