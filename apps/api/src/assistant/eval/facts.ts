import type { PrismaClient } from "@prisma/client";
import {
  itemInclude,
  modelName,
  resolveModelPrice,
  sellableModels,
} from "../../domain/catalog.service";
import type { EvalCase } from "./cases";
import { LogisticsService } from "../../domain/logistics.service";

export type FactField =
  | "price"
  | "stock"
  | "voucher_code"
  | "discount"
  | "min_spend"
  | "shipping"
  | "shipping_fee"
  | "shipping_days_min"
  | "shipping_days_max"
  | "return_days"
  | "faq"
  | "order_status"
  | "return_status"
  | "return_eligible"
  | "voucher_eligible"
  | "policy";
export interface Fact {
  field: FactField;
  entity: string;
  variant?: string;
  id?: string;
  value: string;
  unit?: string;
  product?: string;
  channel?: string;
  key?: string;
}

/** Read a fresh, shop-scoped snapshot, independently of the tool output. */
export async function loadFacts(
  db: PrismaClient,
  test: EvalCase,
): Promise<Fact[]> {
  const [items, vouchers, policy, faqs, channels, orders] = await Promise.all([
    db.item.findMany({
      where: {
        shopId: test.shop,
        status: "NORMAL",
        shop: { status: "NORMAL" },
      },
      include: itemInclude,
    }),
    db.voucher.findMany({
      where: {
        shopId: test.shop,
        startTime: { lte: new Date() },
        endTime: { gt: new Date() },
        displayChannels: { has: 1 },
      },
    }),
    db.shopPolicy.findUnique({ where: { shopId: test.shop } }),
    db.assistantFaq.findMany({ where: { shopId: test.shop, enabled: true } }),
    db.logisticsChannel.findMany({ where: { enabled: true } }),
    db.order.findMany({
      where: { shopId: test.shop, buyerId: test.buyer },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { status: true, orderSn: true },
    }),
  ]);
  const used = await db.order.findMany({
    where: {
      shopId: test.shop,
      buyerId: test.buyer,
      voucherId: { in: vouchers.map((v) => v.id) },
      status: { not: "CANCELLED" },
    },
    select: { voucherId: true },
  });
  const usedIds = new Set(used.map((order) => order.voucherId));
  const facts: Fact[] = [];
  for (const item of items) {
    const models = sellableModels(item);
    for (const model of models) {
      const variant = modelName(item, model.tierIndex);
      const entity = item.name;
      facts.push({
        field: "price",
        entity,
        id: String(item.id),
        ...(variant ? { variant } : {}),
        value: String(resolveModelPrice(model).currentPrice),
      });
      facts.push({
        field: "stock",
        entity,
        id: String(item.id),
        ...(variant ? { variant } : {}),
        value: String(model.status === "MODEL_NORMAL" ? model.stock : 0),
      });
    }
    if (models.length) {
      facts.push({
        field: "stock",
        entity: item.name,
        id: String(item.id),
        value: String(
          models.reduce(
            (sum, model) =>
              sum + (model.status === "MODEL_NORMAL" ? model.stock : 0),
            0,
          ),
        ),
      });
    }
  }
  for (const voucher of vouchers.filter(
    (v) => v.currentUsage < v.usageQuantity && !usedIds.has(v.id),
  )) {
    facts.push({
      field: "voucher_code",
      entity: voucher.code,
      value: voucher.code,
    });
    if (voucher.percentage !== null)
      facts.push({
        field: "discount",
        entity: voucher.code,
        value: String(voucher.percentage),
      });
    if (voucher.discountAmount !== null)
      facts.push({
        field: "discount",
        entity: voucher.code,
        value: String(voucher.discountAmount),
      });
    if (voucher.maxPrice !== null)
      facts.push({
        field: "discount",
        entity: voucher.code,
        key: "max_discount",
        value: String(voucher.maxPrice),
      });
    facts.push({
      field: "min_spend",
      entity: voucher.code,
      value: String(voucher.minBasketPrice),
    });
  }
  if (policy) {
    facts.push({
      field: "return_days",
      entity: "return",
      value: String(policy.returnWindowDays),
    });
    facts.push({
      field: "policy",
      entity: "return",
      key: "return_policy",
      value: policy.returnPolicy,
    });
    facts.push({
      field: "policy",
      entity: "shipping",
      key: "shipping_policy",
      value: policy.shippingPolicy,
    });
    if (policy.freeShippingMinSpend !== null)
      facts.push({
        field: "policy",
        entity: "shipping",
        key: "free_shipping_min_spend",
        value: String(policy.freeShippingMinSpend),
      });
  }
  const logistics = new LogisticsService(db as never);
  for (const item of items) {
    for (const channel of logistics.eligibleChannels(channels, [
      item.logistics,
    ])) {
      const extra = {
        entity: channel.name,
        product: item.name,
        channel: channel.name,
      };
      facts.push({
        ...extra,
        field: "shipping_fee",
        unit: "vnd",
        value: String(channel.baseFee),
      });
      facts.push({
        ...extra,
        field: "shipping_fee",
        unit: "vnd/kg",
        value: String(channel.perKgFee),
      });
      facts.push({
        ...extra,
        field: "shipping_days_min",
        unit: "days",
        value: String(channel.minDays),
      });
      facts.push({
        ...extra,
        field: "shipping_days_max",
        unit: "days",
        value: String(channel.maxDays),
      });
      facts.push({
        ...extra,
        field: "policy",
        key: "cod_allowed",
        value: String(channel.codEnabled),
      });
      for (const model of sellableModels(item))
        facts.push({
          ...extra,
          variant: modelName(item, model.tierIndex) || undefined,
          field: "shipping_fee",
          unit: "total_vnd",
          value: String(
            logistics.fee(channel, Number(model.weightKg ?? item.weightKg)),
          ),
        });
    }
  }
  for (const order of orders)
    facts.push({
      field: "order_status",
      entity: order.orderSn,
      id: order.orderSn,
      value: order.status,
    });
  const returns = await db.returnRequest.findMany({
    where: { shopId: test.shop, buyerId: test.buyer },
    select: { returnSn: true, status: true },
  });
  for (const request of returns)
    facts.push({
      field: "return_status",
      entity: request.returnSn,
      id: request.returnSn,
      value: request.status,
    });
  for (const faq of faqs)
    facts.push({ field: "faq", entity: faq.question, value: faq.answer });
  return facts;
}
