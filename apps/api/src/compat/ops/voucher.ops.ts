import { Injectable } from '@nestjs/common';
import { Prisma, Voucher } from '@prisma/client';
import { z } from 'zod';
import { DomainError, invalidState, notFound, validation } from '../../common/errors';
import { dec } from '../../common/money';
import { PrismaService } from '../../common/prisma.service';
import { fromUnix } from '../../common/time';
import { q } from '../../common/validation';
import { PushService } from '../../domain/push.service';
import { REWARD_FIX_AMOUNT, REWARD_PERCENTAGE, VOUCHER_PRODUCT, voucherState, VoucherService } from '../../domain/voucher.service';
import { CompatContext, CompatOperationProvider, op } from '../compat.types';

const MAX_VOUCHER_DAYS = 180;

const voucherFields = {
  voucher_name: z.string().trim().min(1).max(100),
  start_time: q.int(),
  end_time: q.int(),
  usage_quantity: q.int().min(1).max(200000),
  min_basket_price: q.num().min(0),
  discount_amount: q.num().positive().optional(),
  percentage: q.int().min(1).max(99).optional(),
  max_price: q.num().min(0).optional(),
  display_channel_list: z.array(q.int()).optional(),
  item_id_list: z.array(q.int()).optional(),
  display_start_time: q.int().optional(),
};

/** voucher.* operations (shop and product vouchers with fixed or percentage rewards). */
@Injectable()
export class VoucherOps implements CompatOperationProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchers: VoucherService,
    private readonly push: PushService,
  ) {}

  operations() {
    return [
      op({
        path: '/voucher/get_voucher_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          page_no: q.int().min(1).default(1),
          page_size: q.int().min(1).max(100).default(20),
          status: z.enum(['upcoming', 'ongoing', 'expired', 'all']),
        }),
        handler: async (ctx, input) => {
          const now = new Date();
          const where: Prisma.VoucherWhereInput = { shopId: ctx.shopId };
          if (input.status === 'upcoming') where.startTime = { gt: now };
          if (input.status === 'ongoing') Object.assign(where, { startTime: { lte: now }, endTime: { gt: now } });
          if (input.status === 'expired') where.endTime = { lte: now };
          const rows = await this.prisma.voucher.findMany({
            where,
            orderBy: { id: 'desc' },
            skip: (input.page_no - 1) * input.page_size,
            take: input.page_size + 1,
          });
          return {
            more: rows.length > input.page_size,
            voucher_list: rows.slice(0, input.page_size).map((v) => {
              const p = this.vouchers.present(v, now);
              return {
                voucher_id: p.voucher_id,
                voucher_code: p.voucher_code,
                voucher_name: p.voucher_name,
                voucher_type: p.voucher_type,
                reward_type: p.reward_type,
                usage_quantity: p.usage_quantity,
                current_usage: p.current_usage,
                start_time: p.start_time,
                end_time: p.end_time,
                is_admin: false,
                voucher_purpose: 0,
                discount_amount: p.discount_amount,
                percentage: p.percentage,
                cmt_voucher_status: 0,
                display_start_time: p.display_start_time,
              };
            }),
          };
        },
      }),
      op({
        path: '/voucher/get_voucher',
        method: 'GET',
        auth: 'shop',
        input: z.object({ voucher_id: q.int() }),
        handler: async (ctx, input) => {
          const { status: _status, ...rest } = this.vouchers.present(await this.find(ctx, input.voucher_id));
          return rest;
        },
      }),
      op({
        path: '/voucher/add_voucher',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          ...voucherFields,
          voucher_code: z.string().trim().regex(/^[A-Za-z0-9]{1,20}$/, 'voucher_code must be 1-20 alphanumeric characters'),
          voucher_type: q.int().refine((v) => v === 1 || v === 2, 'voucher_type must be 1 (shop) or 2 (product)'),
          reward_type: q.int().refine((v) => v === REWARD_FIX_AMOUNT || v === REWARD_PERCENTAGE, 'reward_type must be 1 or 2 (coin cashback unsupported)'),
        }),
        handler: async (ctx, input) => {
          const now = Date.now() / 1000;
          if (input.start_time < now - 60) throw validation('start_time must be in the future');
          this.checkWindow(input.start_time, input.end_time);
          this.checkReward(input.reward_type, input.discount_amount, input.percentage, input.min_basket_price);
          const itemIds = await this.checkItems(ctx, input.voucher_type, input.item_id_list);
          const code = input.voucher_code.toUpperCase();
          const exists = await this.prisma.voucher.findUnique({ where: { shopId_code: { shopId: ctx.shopId, code } } });
          if (exists) throw new DomainError('CONFLICT', `voucher_code ${code} already exists`, { shopee_error: 'voucher.error_duplicate_code' });
          const voucher = await this.prisma.voucher.create({
            data: {
              shopId: ctx.shopId,
              code,
              name: input.voucher_name,
              voucherType: input.voucher_type,
              rewardType: input.reward_type,
              discountAmount: input.reward_type === REWARD_FIX_AMOUNT ? dec(input.discount_amount!) : null,
              percentage: input.reward_type === REWARD_PERCENTAGE ? input.percentage! : null,
              maxPrice: input.max_price ? dec(input.max_price) : null,
              minBasketPrice: dec(input.min_basket_price),
              usageQuantity: input.usage_quantity,
              startTime: fromUnix(input.start_time),
              endTime: fromUnix(input.end_time),
              displayChannels: input.display_channel_list ?? [1],
              itemIds,
            },
          });
          await this.push.emit(ctx.shopId, 'promotion_update', { promotion_type: 'voucher', voucher_id: voucher.id, action: 'create' });
          return { voucher_id: voucher.id };
        },
      }),
      op({
        path: '/voucher/update_voucher',
        method: 'POST',
        auth: 'shop',
        input: z.object({ voucher_id: q.int(), ...partial(voucherFields) }),
        handler: async (ctx, input) => {
          const voucher = await this.find(ctx, input.voucher_id);
          const state = voucherState(voucher);
          if (state === 'expired') throw invalidState('Expired vouchers cannot be updated');
          const data: Prisma.VoucherUpdateInput = { name: input.voucher_name, displayChannels: input.display_channel_list };
          if (state === 'ongoing') {
            const locked = ['start_time', 'min_basket_price', 'discount_amount', 'percentage', 'max_price', 'item_id_list'] as const;
            const changed = locked.filter((k) => input[k] !== undefined);
            if (changed.length) throw invalidState(`Ongoing voucher cannot change: ${changed.join(', ')}`);
            if (input.usage_quantity !== undefined && input.usage_quantity < voucher.usageQuantity) {
              throw invalidState('usage_quantity of an ongoing voucher can only increase');
            }
            if (input.end_time !== undefined) {
              if (input.end_time * 1000 <= Date.now()) throw validation('end_time must be in the future');
              this.checkWindow(Math.floor(voucher.startTime.getTime() / 1000), input.end_time);
            }
            Object.assign(data, {
              usageQuantity: input.usage_quantity,
              endTime: input.end_time !== undefined ? fromUnix(input.end_time) : undefined,
            });
          } else {
            const start = input.start_time ?? Math.floor(voucher.startTime.getTime() / 1000);
            const end = input.end_time ?? Math.floor(voucher.endTime.getTime() / 1000);
            this.checkWindow(start, end);
            const min = input.min_basket_price ?? Number(voucher.minBasketPrice);
            this.checkReward(
              voucher.rewardType,
              input.discount_amount ?? (voucher.discountAmount ? Number(voucher.discountAmount) : undefined),
              input.percentage ?? voucher.percentage ?? undefined,
              min,
            );
            Object.assign(data, {
              startTime: fromUnix(start),
              endTime: fromUnix(end),
              usageQuantity: input.usage_quantity,
              minBasketPrice: input.min_basket_price !== undefined ? dec(input.min_basket_price) : undefined,
              discountAmount: input.discount_amount !== undefined ? dec(input.discount_amount) : undefined,
              percentage: input.percentage,
              maxPrice: input.max_price !== undefined ? dec(input.max_price) : undefined,
              itemIds: input.item_id_list !== undefined ? await this.checkItems(ctx, voucher.voucherType, input.item_id_list) : undefined,
            });
          }
          await this.prisma.voucher.update({ where: { id: voucher.id }, data });
          await this.push.emit(ctx.shopId, 'promotion_update', { promotion_type: 'voucher', voucher_id: voucher.id, action: 'update' });
          return { voucher_id: voucher.id };
        },
      }),
      op({
        path: '/voucher/end_voucher',
        method: 'POST',
        auth: 'shop',
        input: z.object({ voucher_id: q.int() }),
        handler: async (ctx, input) => {
          const voucher = await this.find(ctx, input.voucher_id);
          if (voucherState(voucher) !== 'ongoing') throw invalidState('Only ongoing vouchers can be ended');
          await this.prisma.voucher.update({ where: { id: voucher.id }, data: { endTime: new Date() } });
          await this.push.emit(ctx.shopId, 'promotion_update', { promotion_type: 'voucher', voucher_id: voucher.id, action: 'end' });
          return { voucher_id: voucher.id };
        },
      }),
      op({
        path: '/voucher/delete_voucher',
        method: 'POST',
        auth: 'shop',
        input: z.object({ voucher_id: q.int() }),
        handler: async (ctx, input) => {
          const voucher = await this.find(ctx, input.voucher_id);
          if (voucherState(voucher) !== 'upcoming') throw invalidState('Only upcoming vouchers can be deleted');
          await this.prisma.voucher.delete({ where: { id: voucher.id } });
          return { voucher_id: voucher.id };
        },
      }),
    ];
  }

  private async find(ctx: CompatContext, voucherId: number): Promise<Voucher> {
    const voucher = await this.prisma.voucher.findFirst({ where: { id: voucherId, shopId: ctx.shopId } });
    if (!voucher) throw notFound(`Voucher ${voucherId}`);
    return voucher;
  }

  private checkWindow(start: number, end: number) {
    if (end <= start) throw validation('end_time must be after start_time');
    if (end - start > MAX_VOUCHER_DAYS * 86400) throw validation(`Voucher period cannot exceed ${MAX_VOUCHER_DAYS} days`);
  }

  private checkReward(rewardType: number, amount: number | undefined, percentage: number | undefined, minBasket: number) {
    if (rewardType === REWARD_FIX_AMOUNT) {
      if (!amount) throw validation('discount_amount is required for fixed-amount vouchers');
      if (minBasket > 0 && amount > minBasket) throw validation('discount_amount cannot exceed min_basket_price');
    } else if (!percentage) {
      throw validation('percentage is required for percentage vouchers');
    }
  }

  private async checkItems(ctx: CompatContext, voucherType: number, itemIds: number[] | undefined): Promise<number[]> {
    if (voucherType !== VOUCHER_PRODUCT) return [];
    if (!itemIds?.length) throw validation('item_id_list is required for product vouchers');
    const owned = await this.prisma.item.count({ where: { id: { in: itemIds }, shopId: ctx.shopId, status: { not: 'DELETED' } } });
    if (owned !== new Set(itemIds).size) throw validation('item_id_list contains items outside this shop');
    return [...new Set(itemIds)];
  }
}

function partial<T extends Record<string, z.ZodTypeAny>>(shape: T): { [K in keyof T]: z.ZodOptional<T[K]> } {
  return Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.optional()])) as { [K in keyof T]: z.ZodOptional<T[K]> };
}
