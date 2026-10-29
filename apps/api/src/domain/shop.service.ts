import { Injectable } from '@nestjs/common';
import { ShopPolicy } from '@prisma/client';
import { DomainError, notFound } from '../common/errors';
import { dec, toNumber } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { unix } from '../common/time';

export const DEFAULT_POLICY = {
  shippingPolicy: 'Đơn hàng được chuẩn bị trong 1-2 ngày làm việc và giao bởi đối tác vận chuyển đã chọn khi thanh toán.',
  returnPolicy: 'Hỗ trợ trả hàng/hoàn tiền trong 7 ngày kể từ khi nhận hàng nếu sản phẩm lỗi, sai mô tả hoặc thiếu hàng.',
  warrantyPolicy: 'Bảo hành theo chính sách của nhà sản xuất (nếu có).',
  returnWindowDays: 7,
};

export interface PolicyUpdate {
  shipping_policy?: string;
  return_policy?: string;
  warranty_policy?: string;
  return_window_days?: number;
  free_shipping_min_spend?: number | null;
  expected_version?: number;
}

/** Shop-level helpers shared by seller onboarding, public shop pages and custom signed extensions. */
@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async assertMember(userId: number, shopId: number, ownerOnly = false): Promise<void> {
    const member = await this.prisma.shopMember.findUnique({ where: { userId_shopId: { userId, shopId } } });
    // Do not reveal whether a shop the user cannot access exists.
    if (!member || (ownerOnly && member.role !== 'OWNER')) throw notFound('Shop');
  }

  async policy(shopId: number): Promise<ShopPolicy> {
    const existing = await this.prisma.shopPolicy.findUnique({ where: { shopId } });
    if (existing) return existing;
    return this.prisma.shopPolicy.create({ data: { shopId, ...DEFAULT_POLICY } });
  }

  async updatePolicy(shopId: number, input: PolicyUpdate): Promise<ShopPolicy> {
    const current = await this.policy(shopId);
    if (input.expected_version !== undefined && input.expected_version !== current.version) {
      throw new DomainError('CONFLICT', `Policy version is ${current.version}, expected ${input.expected_version}`, {
        shopee_error: 'error_version_conflict',
      });
    }
    const updated = await this.prisma.shopPolicy.updateMany({
      where: { shopId, version: current.version },
      data: {
        version: { increment: 1 },
        shippingPolicy: input.shipping_policy,
        returnPolicy: input.return_policy,
        warrantyPolicy: input.warranty_policy,
        returnWindowDays: input.return_window_days,
        freeShippingMinSpend:
          input.free_shipping_min_spend === undefined ? undefined : input.free_shipping_min_spend === null ? null : dec(input.free_shipping_min_spend),
      },
    });
    if (updated.count !== 1) throw new DomainError('CONFLICT', 'Policy changed concurrently, retry', { shopee_error: 'error_version_conflict' });
    return this.policy(shopId);
  }

  presentPolicy(p: ShopPolicy) {
    return {
      shop_id: p.shopId,
      version: p.version,
      shipping_policy: p.shippingPolicy,
      return_policy: p.returnPolicy,
      warranty_policy: p.warrantyPolicy,
      return_window_days: p.returnWindowDays,
      free_shipping_min_spend: p.freeShippingMinSpend ? toNumber(p.freeShippingMinSpend) : null,
      update_time: unix(p.updatedAt),
    };
  }

  async salesSummary(shopId: number, from: Date, to: Date) {
    const range = { gte: from, lte: to };
    const [byStatus, gross, itemsSold, activeItems, lowStock, openReturns, refunded] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: { shopId, createdAt: range }, _count: { _all: true } }),
      this.prisma.order.aggregate({
        where: { shopId, createdAt: range, status: { notIn: ['CANCELLED', 'UNPAID'] } },
        _sum: { totalAmount: true, itemsSubtotal: true, voucherDiscount: true },
        _count: { _all: true },
      }),
      this.prisma.orderItem.aggregate({
        where: { order: { shopId, createdAt: range, status: { notIn: ['CANCELLED', 'UNPAID'] } } },
        _sum: { quantity: true },
      }),
      this.prisma.item.count({ where: { shopId, status: 'NORMAL' } }),
      this.prisma.model.findMany({
        where: {
          item: { shopId, status: 'NORMAL' },
          stock: { lt: 5 },
          status: 'MODEL_NORMAL',
          OR: [{ isDefault: true, item: { hasModel: false } }, { isDefault: false, item: { hasModel: true } }],
        },
        include: { item: { select: { id: true, name: true } } },
        orderBy: { stock: 'asc' },
        take: 20,
      }),
      this.prisma.returnRequest.count({ where: { shopId, status: { in: ['REQUESTED', 'JUDGING', 'PROCESSING', 'SELLER_DISPUTE'] } } }),
      this.prisma.returnRequest.aggregate({ where: { shopId, refundPaidAt: range }, _sum: { refundAmount: true } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
    return {
      shop_id: shopId,
      time_from: unix(from),
      time_to: unix(to),
      currency: 'VND',
      order_count: byStatus.reduce((s, x) => s + x._count._all, 0),
      order_count_by_status: counts,
      paid_order_count: gross._count._all,
      gross_merchandise_value: toNumber(gross._sum.itemsSubtotal),
      voucher_discount_total: toNumber(gross._sum.voucherDiscount),
      total_revenue: toNumber(gross._sum.totalAmount),
      refunded_amount: toNumber(refunded._sum.refundAmount),
      items_sold: itemsSold._sum.quantity ?? 0,
      active_item_count: activeItems,
      to_ship_count: (counts.READY_TO_SHIP ?? 0) + (counts.UNPAID ?? 0),
      open_return_count: openReturns,
      low_stock_models: lowStock.map((m) => ({ item_id: m.item.id, item_name: m.item.name, model_id: m.isDefault ? 0 : m.id, stock: m.stock })),
    };
  }
}
