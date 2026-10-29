import { Injectable } from '@nestjs/common';
import { Voucher } from '@prisma/client';
import { DomainError } from '../common/errors';
import { roundVnd, toNumber } from '../common/money';
import { PrismaService, Tx } from '../common/prisma.service';
import { unix } from '../common/time';

export type VoucherState = 'upcoming' | 'ongoing' | 'expired';

export const REWARD_FIX_AMOUNT = 1;
export const REWARD_PERCENTAGE = 2;
export const VOUCHER_SHOP = 1;
export const VOUCHER_PRODUCT = 2;
/** Shopee display_channel_list value meaning "display on all pages" (publicly listed). */
export const DISPLAY_ALL_PAGES = 1;

export function voucherState(v: Pick<Voucher, 'startTime' | 'endTime'>, at = new Date()): VoucherState {
  if (v.startTime > at) return 'upcoming';
  if (v.endTime <= at) return 'expired';
  return 'ongoing';
}

export interface VoucherLine {
  itemId: number;
  lineTotal: number;
}

export interface VoucherEvaluation {
  eligible: boolean;
  discount: number;
  reason?: string;
}

/**
 * Deterministic voucher rules, shared by checkout preview/creation and public listings.
 * Product vouchers apply only to their item_id_list; the minimum basket is evaluated on the
 * eligible subtotal. Each buyer may use a given voucher once (non-cancelled orders).
 */
@Injectable()
export class VoucherService {
  constructor(private readonly prisma: PrismaService) {}

  evaluate(voucher: Voucher, lines: VoucherLine[], at = new Date()): VoucherEvaluation {
    if (voucherState(voucher, at) !== 'ongoing') return { eligible: false, discount: 0, reason: 'Voucher is not active' };
    if (voucher.currentUsage >= voucher.usageQuantity) return { eligible: false, discount: 0, reason: 'Voucher is fully redeemed' };
    const eligibleLines = voucher.voucherType === VOUCHER_PRODUCT ? lines.filter((l) => voucher.itemIds.includes(l.itemId)) : lines;
    const subtotal = eligibleLines.reduce((s, l) => s + l.lineTotal, 0);
    if (subtotal <= 0) return { eligible: false, discount: 0, reason: 'No eligible items for this voucher' };
    const minBasket = toNumber(voucher.minBasketPrice);
    if (subtotal < minBasket) {
      return { eligible: false, discount: 0, reason: `Minimum spend of ${minBasket} VND not reached` };
    }
    let discount: number;
    if (voucher.rewardType === REWARD_PERCENTAGE) {
      discount = Math.floor((subtotal * (voucher.percentage ?? 0)) / 100);
      const cap = voucher.maxPrice ? toNumber(voucher.maxPrice) : 0;
      if (cap > 0) discount = Math.min(discount, cap);
    } else {
      discount = toNumber(voucher.discountAmount);
    }
    return { eligible: true, discount: roundVnd(Math.min(discount, subtotal)) };
  }

  async findByCode(shopId: number, code: string, db: Tx = this.prisma): Promise<Voucher> {
    const voucher = await db.voucher.findUnique({ where: { shopId_code: { shopId, code: code.trim().toUpperCase() } } });
    if (!voucher) throw new DomainError('VOUCHER_INVALID', `Voucher ${code} does not exist for this shop`);
    return voucher;
  }

  async alreadyUsedBy(buyerId: number, voucherId: number, db: Tx = this.prisma): Promise<boolean> {
    const count = await db.order.count({ where: { buyerId, voucherId, status: { not: 'CANCELLED' } } });
    return count > 0;
  }

  present(v: Voucher, at = new Date()) {
    return {
      voucher_id: v.id,
      voucher_code: v.code,
      voucher_name: v.name,
      voucher_type: v.voucherType,
      reward_type: v.rewardType,
      usage_quantity: v.usageQuantity,
      current_usage: v.currentUsage,
      start_time: unix(v.startTime),
      end_time: unix(v.endTime),
      is_admin: false,
      voucher_purpose: 0,
      display_channel_list: v.displayChannels,
      min_basket_price: toNumber(v.minBasketPrice),
      percentage: v.percentage ?? 0,
      max_price: v.maxPrice ? toNumber(v.maxPrice) : 0,
      discount_amount: v.discountAmount ? toNumber(v.discountAmount) : 0,
      cmt_voucher_status: 0,
      item_id_list: v.itemIds,
      display_start_time: unix(v.startTime),
      status: voucherState(v, at),
    };
  }
}
