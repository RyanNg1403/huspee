import { Injectable } from '@nestjs/common';
import { Prisma, ReturnStatus } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma.service';
import { q } from '../../common/validation';
import { ReturnService } from '../../domain/return.service';
import { CompatOperationProvider, op } from '../compat.types';

const RETURN_STATUSES = Object.values(ReturnStatus) as [ReturnStatus, ...ReturnStatus[]];

const DISPUTE_REASONS = [
  { reason_id: 1, reason_text: 'Buyer has not returned the item' },
  { reason_id: 2, reason_text: 'Returned item is damaged or used' },
  { reason_id: 3, reason_text: 'Returned item is different from the delivered item' },
  { reason_id: 4, reason_text: 'Refund amount is incorrect' },
  { reason_id: 5, reason_text: 'Other' },
];

/** returns.* operations. */
@Injectable()
export class ReturnsOps implements CompatOperationProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly returns: ReturnService,
  ) {}

  operations() {
    return [
      op({
        path: '/returns/get_return_list',
        method: 'GET',
        auth: 'shop',
        input: z.object({
          page_no: q.int().min(0),
          page_size: q.int().min(1).max(100),
          create_time_from: q.int().optional(),
          create_time_to: q.int().optional(),
          update_time_from: q.int().optional(),
          update_time_to: q.int().optional(),
          status: z.enum(RETURN_STATUSES).optional(),
          negotiation_status: z.string().optional(),
        }),
        handler: async (ctx, input) => {
          const range = (from?: number, to?: number) =>
            from || to ? { ...(from ? { gte: new Date(from * 1000) } : {}), ...(to ? { lte: new Date(to * 1000) } : {}) } : undefined;
          const where: Prisma.ReturnRequestWhereInput = {
            shopId: ctx.shopId,
            ...(input.status ? { status: input.status } : {}),
            ...(range(input.create_time_from, input.create_time_to) ? { createdAt: range(input.create_time_from, input.create_time_to) } : {}),
            ...(range(input.update_time_from, input.update_time_to) ? { updatedAt: range(input.update_time_from, input.update_time_to) } : {}),
            ...(input.negotiation_status ? { negotiation: { path: ['negotiation_status'], equals: input.negotiation_status } } : {}),
          };
          // Shopee's page_no is 0-based for this endpoint.
          const rows = await this.prisma.returnRequest.findMany({
            where,
            include: { buyer: { select: { name: true, email: true } } },
            orderBy: { createdAt: 'desc' },
            skip: input.page_no * input.page_size,
            take: input.page_size + 1,
          });
          return {
            more: rows.length > input.page_size,
            return: rows.slice(0, input.page_size).map((r) => this.returns.presentForShopee(r, false)),
          };
        },
      }),
      op({
        path: '/returns/get_return_detail',
        method: 'GET',
        auth: 'shop',
        input: z.object({ return_sn: z.string().min(1) }),
        handler: async (ctx, input) => this.returns.presentForShopee(await this.returns.getForShop(ctx.shopId, input.return_sn), true),
      }),
      op({
        path: '/returns/get_available_solutions',
        method: 'GET',
        auth: 'shop',
        input: z.object({ return_sn: z.string().min(1) }),
        handler: async (ctx, input) => this.returns.availableSolutions(await this.returns.getForShop(ctx.shopId, input.return_sn)),
      }),
      op({
        path: '/returns/confirm',
        method: 'POST',
        auth: 'shop',
        input: z.object({ return_sn: z.string().min(1) }),
        handler: async (ctx, input) => {
          await this.returns.confirm(ctx.shopId, input.return_sn);
          return { return_sn: input.return_sn };
        },
      }),
      op({
        path: '/returns/offer',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          return_sn: z.string().min(1),
          proposed_solution: z.enum(['return_refund', 'refund']),
          proposed_adjusted_refund_amount: q.num().min(0).optional(),
        }),
        handler: async (ctx, input) => {
          await this.returns.offer(ctx.shopId, input.return_sn, input.proposed_solution, input.proposed_adjusted_refund_amount);
          return { return_sn: input.return_sn };
        },
      }),
      op({
        path: '/returns/get_return_dispute_reason',
        method: 'GET',
        auth: 'shop',
        input: z.object({ return_sn: z.string().min(1) }),
        handler: async (ctx, input) => {
          await this.returns.getForShop(ctx.shopId, input.return_sn);
          return { dispute_reason_list: DISPUTE_REASONS.map((r) => ({ ...r, evidence_module_list: [] })) };
        },
      }),
      op({
        path: '/returns/dispute',
        method: 'POST',
        auth: 'shop',
        input: z.object({
          return_sn: z.string().min(1),
          email: z.string().email(),
          dispute_reason_id: q.int().refine((id) => DISPUTE_REASONS.some((r) => r.reason_id === id), 'Unknown dispute_reason_id'),
          dispute_text_reason: z.string().max(1000).optional(),
          image_list: z.array(z.object({ module_index: q.int().optional(), requirement: z.string().optional(), image_url: z.array(z.string()) })).optional(),
        }),
        handler: async (ctx, input) => {
          await this.returns.dispute(ctx.shopId, input.return_sn, {
            email: input.email,
            dispute_reason_id: input.dispute_reason_id,
            dispute_text_reason: input.dispute_text_reason,
            images: (input.image_list ?? []).flatMap((i) => i.image_url),
          });
          return { return_sn: input.return_sn, msg: 'Dispute submitted; the return is now under platform review (JUDGING).' };
        },
      }),
      op({
        path: '/returns/cancel_dispute',
        method: 'POST',
        auth: 'shop',
        input: z.object({ return_sn: z.string().min(1), email: z.string().email().optional() }),
        handler: async (ctx, input) => {
          await this.returns.cancelDispute(ctx.shopId, input.return_sn);
          return { return_sn: input.return_sn };
        },
      }),
      op({
        path: '/returns/get_reverse_tracking_info',
        method: 'GET',
        auth: 'shop',
        input: z.object({ return_sn: z.string().min(1) }),
        handler: async (ctx, input) => {
          const ret = await this.returns.getForShop(ctx.shopId, input.return_sn);
          const events = (ret.reverseTracking as Array<{ update_time: number; tracking_status: string; tracking_description: string }>) ?? [];
          const last = events.at(-1);
          return {
            return_sn: ret.returnSn,
            return_refund_request_type: 0,
            validation_type: 'seller_validation',
            reverse_logistics_status: ret.needsReturnShipment ? (last?.tracking_status ?? 'LOGISTICS_NOT_STARTED') : 'LOGISTICS_NOT_NEEDED',
            reverse_logistics_update_time: last?.update_time ?? 0,
            tracking_number: ret.reverseTrackingNumber ?? '',
            tracking_info: events
              .slice()
              .reverse()
              .map((e) => ({ update_time: e.update_time, tracking_description: e.tracking_description, epop_image_list: [], epod_image_list: [] })),
            post_return_logistics_tracking_info: [],
          };
        },
      }),
    ];
  }
}
