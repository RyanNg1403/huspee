import { defaultAssistantConfig } from '../src/assistant/assistant-defaults';
/* Deterministic demo seed. Truncates all tables, then recreates the fixed dataset. */
import { Prisma, PrismaClient } from '@prisma/client';
import { scryptSync } from 'node:crypto';
import {
  ATTRIBUTES,
  BRANDS,
  BUYER_ADDRESSES,
  BUYERS,
  CATEGORIES,
  DEMO_PASSWORD,
  HISTORY_ORDERS,
  ITEMS,
  LOGISTICS_CHANNELS,
  SEED_BASE_TIME,
  SELLERS,
  SHOPS,
  VOUCHERS,
} from './seed-data';

const prisma = new PrismaClient();
const day = 86400 * 1000;
const at = (days: number) => new Date(SEED_BASE_TIME.getTime() + days * day);

/** Same format as src/common/crypto.ts hashPassword (scrypt$salt$key); deterministic salt per email. */
function hashPassword(password: string, email: string): string {
  const salt = Buffer.from(email.padEnd(16, '#').slice(0, 16));
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

function svgImage(title: string, subtitle: string, color: string, variant: number): Buffer {
  const safe = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const angle = variant * 35;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">` +
      `<defs><linearGradient id="g" gradientTransform="rotate(${angle})"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>` +
      `<rect width="600" height="600" fill="url(#g)"/>` +
      `<circle cx="300" cy="250" r="${120 - variant * 15}" fill="#ffffff" fill-opacity="0.35"/>` +
      `<text x="300" y="270" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#222" text-anchor="middle">${safe(title)}</text>` +
      `<text x="300" y="520" font-family="Arial, sans-serif" font-size="26" fill="#333" text-anchor="middle">${safe(subtitle)}</text>` +
      `</svg>`,
    'utf8',
  );
}

async function truncateAll() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
}

async function resetSequences() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`;
  for (const { table_name, column_name } of rows) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table_name}"', '${column_name}'), GREATEST((SELECT COALESCE(MAX("${column_name}"), 0) FROM "${table_name}"), 1))`,
    );
  }
}

function publicHosts(): string[] {
  const hosts = new Set(['localhost', '127.0.0.1']);
  for (const v of [process.env.PUBLIC_BASE_URL, process.env.WEB_APP_URL]) {
    if (!v) continue;
    try {
      hosts.add(new URL(v).hostname);
    } catch {
      /* ignore malformed */
    }
  }
  return [...hosts];
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.HUSPEE_ALLOW_SEED_RESET !== 'true') {
    throw new Error('Refusing to reset data with NODE_ENV=production (set HUSPEE_ALLOW_SEED_RESET=true to override).');
  }
  await truncateAll();
  const partnerId = Number(process.env.HUSPEE_PARTNER_ID ?? 2001001);

  await prisma.partnerApp.create({
    data: { id: partnerId, name: 'Huspee Seller Center', keyRef: 'HUSPEE_PARTNER_KEY', redirectDomains: publicHosts(), createdAt: SEED_BASE_TIME },
  });

  await prisma.logisticsChannel.createMany({
    data: LOGISTICS_CHANNELS.map((c) => ({ ...c, baseFee: new Prisma.Decimal(c.baseFee), perKgFee: new Prisma.Decimal(c.perKgFee) })),
  });

  for (const c of CATEGORIES) await prisma.category.create({ data: { ...c, parentId: c.parentId ?? null } });
  await prisma.categoryAttribute.createMany({ data: ATTRIBUTES.map((a) => ({ ...a, values: a.values as Prisma.InputJsonValue })) });
  await prisma.brand.createMany({ data: BRANDS });

  for (const u of BUYERS) {
    await prisma.user.create({ data: { ...u, passwordHash: hashPassword(DEMO_PASSWORD, u.email), roles: ['BUYER'], createdAt: SEED_BASE_TIME } });
  }
  for (const u of SELLERS) {
    await prisma.user.create({ data: { ...u, passwordHash: hashPassword(DEMO_PASSWORD, u.email), roles: ['SELLER', 'BUYER'], createdAt: SEED_BASE_TIME } });
  }
  await prisma.buyerAddress.createMany({ data: BUYER_ADDRESSES.map((a) => ({ ...a, createdAt: SEED_BASE_TIME })) });

  for (const s of SHOPS) {
    const logoId = `seed-logo-${s.id}`;
    await prisma.shop.create({
      data: {
        id: s.id,
        name: s.name,
        description: s.description,
        city: s.city,
        isOfficial: s.isOfficial,
        logoUrl: `/media/${logoId}`,
        createdAt: SEED_BASE_TIME,
        members: { create: { userId: s.ownerId, role: 'OWNER', createdAt: SEED_BASE_TIME } },
        policy: {
          create: {
            ...s.policy,
            freeShippingMinSpend: s.policy.freeShippingMinSpend === null ? null : new Prisma.Decimal(s.policy.freeShippingMinSpend),
          },
        },
        addresses: { create: { ...s.address, isDefault: true, isPickup: true, isReturn: true, createdAt: SEED_BASE_TIME } },
      },
    });
    await prisma.assistantConfig.create({ data: { shopId: s.id, ...defaultAssistantConfig(s.name) } });
    await prisma.assistantFaq.createMany({ data: [
      { shopId: s.id, question: 'Chính sách vận chuyển là gì?', answer: s.policy.shippingPolicy, lang: 'vi' },
      { shopId: s.id, question: 'Chính sách đổi trả là gì?', answer: s.policy.returnPolicy, lang: 'vi' },
      { shopId: s.id, question: 'Chính sách bảo hành là gì?', answer: s.policy.warrantyPolicy, lang: 'vi' },
      { shopId: s.id, question: 'What is the return policy?', answer: s.policy.returnPolicy, lang: 'en' },
    ] });
    await prisma.mediaImage.create({
      data: { imageId: logoId, shopId: s.id, mimeType: 'image/svg+xml', data: new Uint8Array(svgImage(s.name, s.city, s.color, 0)), createdAt: SEED_BASE_TIME },
    });
  }

  const collections = new Map<string, number>();
  for (const [idx, item] of ITEMS.entries()) {
    const shop = SHOPS.find((s) => s.id === item.shopId)!;
    const imageIds = [0, 1].map((n) => `seed-${item.id}-${n}`);
    for (const [n, imageId] of imageIds.entries()) {
      await prisma.mediaImage.create({
        data: {
          imageId,
          shopId: item.shopId,
          mimeType: 'image/svg+xml',
          data: new Uint8Array(svgImage(item.short, n === 0 ? shop.name : 'Huspee Mall', shop.color, n + 1)),
          createdAt: SEED_BASE_TIME,
        },
      });
    }
    const hasModel = !!item.tiers;
    await prisma.item.create({
      data: {
        id: item.id,
        shopId: item.shopId,
        categoryId: item.categoryId,
        brandId: item.brandId,
        name: item.name,
        description: item.description,
        itemSku: item.sku,
        weightKg: new Prisma.Decimal(item.weightKg),
        attributes: item.attributes as Prisma.InputJsonValue,
        logistics: LOGISTICS_CHANNELS.map((c) => ({ logistic_id: c.id, enabled: item.weightKg <= 2 || c.id !== 50066, is_free: false })),
        tierVariation: (item.tiers ?? []).map((t) => ({ name: t.name, option_list: t.options.map((option) => ({ option })) })),
        hasModel,
        sales: item.sales,
        views: item.views,
        likes: item.likes,
        createdAt: at(-30 + idx),
        updatedAt: at(-30 + idx),
        images: { create: imageIds.map((imageId, sortOrder) => ({ imageId, url: `/media/${imageId}`, sortOrder })) },
        models: {
          create: item.models.map((m) => ({
            id: m.id,
            isDefault: !hasModel,
            tierIndex: m.tierIndex,
            sku: m.sku,
            originalPrice: new Prisma.Decimal(m.price),
            stock: m.stock,
            createdAt: at(-30 + idx),
          })),
        },
      },
    });
    for (const name of item.collections ?? []) {
      const key = `${item.shopId}:${name}`;
      if (!collections.has(key)) {
        const c = await prisma.shopCategory.create({ data: { shopId: item.shopId, name, sortWeight: 100 - collections.size, createdAt: SEED_BASE_TIME } });
        collections.set(key, c.id);
      }
      await prisma.shopCategoryItem.create({ data: { shopCategoryId: collections.get(key)!, itemId: item.id, createdAt: SEED_BASE_TIME } });
    }
  }

  // Long-running discount promotions (active window covers any realistic demo date).
  for (const shop of SHOPS) {
    const promoModels = ITEMS.filter((i) => i.shopId === shop.id).flatMap((i) => i.models.filter((m) => m.promo));
    if (!promoModels.length) continue;
    await prisma.discount.create({
      data: {
        shopId: shop.id,
        name: `Siêu Sale ${shop.name}`,
        startTime: new Date('2025-01-01T00:00:00Z'),
        endTime: new Date('2035-01-01T00:00:00Z'),
        createdAt: SEED_BASE_TIME,
        models: { create: promoModels.map((m) => ({ modelId: m.id, promotionPrice: new Prisma.Decimal(m.promo!) })) },
      },
    });
  }

  for (const v of VOUCHERS) {
    const { expired, ...data } = v as typeof v & { expired?: boolean; itemIds?: number[]; percentage?: number; maxPrice?: number; discountAmount?: number };
    await prisma.voucher.create({
      data: {
        ...data,
        discountAmount: data.discountAmount !== undefined ? new Prisma.Decimal(data.discountAmount) : null,
        maxPrice: data.maxPrice !== undefined ? new Prisma.Decimal(data.maxPrice) : null,
        minBasketPrice: new Prisma.Decimal(data.minBasketPrice),
        itemIds: data.itemIds ?? [],
        startTime: expired ? new Date('2026-05-01T00:00:00Z') : new Date('2026-01-01T00:00:00Z'),
        endTime: expired ? new Date('2026-08-31T00:00:00Z') : new Date('2030-12-31T00:00:00Z'),
        createdAt: SEED_BASE_TIME,
      },
    });
  }

  // Completed historical orders + verified reviews.
  for (const h of HISTORY_ORDERS) {
    const item = ITEMS.find((i) => i.models.some((m) => m.id === h.modelId))!;
    const model = item.models.find((m) => m.id === h.modelId)!;
    const address = BUYER_ADDRESSES.find((a) => a.userId === h.buyerId && a.isDefault)!;
    const unit = model.promo ?? model.price;
    const subtotal = unit * h.quantity;
    const channel = LOGISTICS_CHANNELS[0]!;
    const shippingFee = channel.baseFee;
    const created = at(h.dayOffset);
    const delivered = at(h.dayOffset + 3);
    const tierNames = (item.tiers ?? []).map((t, i) => t.options[model.tierIndex[i]!]).filter(Boolean).join(', ');
    await prisma.order.create({
      data: {
        orderSn: h.orderSn,
        checkoutId: `COSEED${h.orderSn.slice(-4)}`,
        shopId: h.shopId,
        buyerId: h.buyerId,
        status: 'COMPLETED',
        paymentMethod: 'Cash on Delivery',
        cod: true,
        itemsSubtotal: new Prisma.Decimal(subtotal),
        shippingFee: new Prisma.Decimal(shippingFee),
        totalAmount: new Prisma.Decimal(subtotal + shippingFee),
        recipientAddress: {
          name: address.name,
          phone: address.phone,
          town: address.town,
          district: address.district,
          city: address.city,
          state: address.state,
          region: 'VN',
          zipcode: address.zipcode,
          full_address: `${address.address}, ${address.town}, ${address.district}, ${address.city}`,
        },
        logisticsChannelId: channel.id,
        shippingCarrier: channel.name,
        daysToShip: 2,
        shipByDate: at(h.dayOffset + 2),
        completedAt: at(h.dayOffset + 4),
        createdAt: created,
        updatedAt: at(h.dayOffset + 4),
        items: {
          create: {
            itemId: item.id,
            modelId: model.id,
            isDefaultModel: !item.tiers,
            itemName: item.name,
            modelName: tierNames,
            itemSku: item.sku,
            modelSku: model.sku,
            imageUrl: `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'}/media/seed-${item.id}-0`,
            quantity: h.quantity,
            originalPrice: new Prisma.Decimal(model.price),
            discountedPrice: new Prisma.Decimal(unit),
            weightKg: new Prisma.Decimal(item.weightKg),
          },
        },
        package: {
          create: {
            packageNumber: `OFGSEED${h.orderSn.slice(-4)}`,
            logisticsStatus: 'LOGISTICS_DELIVERY_DONE',
            trackingNumber: `${channel.trackingPrefix}SEED${h.orderSn.slice(-4)}`,
            shipMethod: 'pickup',
            shippedAt: at(h.dayOffset + 1),
            deliveredAt: delivered,
            createdAt: created,
            events: {
              create: [
                { logisticsStatus: 'LOGISTICS_NOT_START', description: 'Đơn hàng đã được đặt', createdAt: created },
                { logisticsStatus: 'LOGISTICS_REQUEST_CREATED', description: 'Người bán đã sắp xếp lấy hàng', createdAt: at(h.dayOffset + 0.5) },
                { logisticsStatus: 'LOGISTICS_PICKUP_DONE', description: 'Đơn vị vận chuyển đã lấy hàng thành công', createdAt: at(h.dayOffset + 1) },
                { logisticsStatus: 'LOGISTICS_DELIVERY_DONE', description: 'Giao hàng thành công', createdAt: delivered },
              ],
            },
          },
        },
      },
    });
    await prisma.review.create({
      data: {
        itemId: item.id,
        modelId: model.id,
        orderSn: h.orderSn,
        buyerId: h.buyerId,
        rating: h.rating,
        comment: h.comment,
        imageUrls: [],
        createdAt: at(h.dayOffset + 5),
        ...(h.rating <= 3 ? { sellerReply: 'Cảm ơn bạn đã phản hồi, shop sẽ cải thiện hình ảnh sản phẩm ạ!', repliedAt: at(h.dayOffset + 6) } : {}),
      },
    });
  }

  await resetSequences();
  // Leave a gap so newly created shops/items get visibly different IDs from fixtures.
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"shops"', 'id'), 881000)`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"items"', 'id'), 2100000)`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"models"', 'id'), 3100000)`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"users"', 'id'), 1000)`);

  console.log(
    `Seeded partner ${partnerId}, ${SHOPS.length} shops, ${ITEMS.length} items, ${BUYERS.length + SELLERS.length} users (password: ${DEMO_PASSWORD}).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
