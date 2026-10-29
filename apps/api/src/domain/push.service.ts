import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { loadConfig, resolvePartnerKey } from '../config';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { nowUnix } from '../common/time';

/**
 * Push codes (approximation of Shopee's live push mechanism, see docs/COMPATIBILITY.md):
 *   1 shop_authorization_push, 2 shop_authorization_canceled_push, 3 order_status_push,
 *   4 order_trackingno_push, 8 reserved_stock_change_push (used for seller stock updates),
 *   9 promotion_update_push (vouchers), 29 return_status_push (Huspee approximation).
 */
export const PUSH_CODES = {
  shop_authorization: 1,
  shop_authorization_canceled: 2,
  order_status: 3,
  tracking_no: 4,
  stock_update: 8,
  promotion_update: 9,
  return_status: 29,
} as const;
export type PushKind = keyof typeof PUSH_CODES;
export const ALL_PUSH_CODES = Object.values(PUSH_CODES);

const MAX_ATTEMPTS = 3;

@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger('Push');
  private delivering: Promise<void> | null = null;
  private stopped = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy(): void {
    this.stopped = true;
  }

  /**
   * Record an outbound event for every Partner with an active grant on the shop whose push
   * config enables the code. Delivery is async best-effort; events stay queryable as "lost"
   * pushes when delivery fails.
   */
  async emit(shopId: number, kind: PushKind, data: Record<string, unknown>): Promise<void> {
    const code = PUSH_CODES[kind];
    const grants = await this.prisma.shopAuthorization.findMany({
      where: { shopId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      include: { partner: { include: { pushConfig: true } } },
    });
    const rows: Prisma.PushEventCreateManyInput[] = [];
    for (const grant of grants) {
      const cfg = grant.partner.pushConfig;
      if (!cfg || !cfg.pushCodes.includes(code) || cfg.blockedShopIds.includes(shopId)) continue;
      rows.push({
        partnerId: grant.partnerId,
        shopId,
        code,
        payload: { shop_id: shopId, code, timestamp: nowUnix(), data } as Prisma.InputJsonValue,
        status: cfg.callbackUrl ? 'PENDING' : 'SKIPPED',
      });
    }
    if (rows.length === 0) return;
    await this.prisma.pushEvent.createMany({ data: rows });
    this.kick();
  }

  /** Emit for the authorization lifecycle, bypassing the active-grant filter for cancellations. */
  async emitForPartner(partnerId: number, shopId: number, kind: PushKind, data: Record<string, unknown>): Promise<void> {
    const cfg = await this.prisma.pushConfig.findUnique({ where: { partnerId } });
    const code = PUSH_CODES[kind];
    if (!cfg || !cfg.pushCodes.includes(code)) return;
    await this.prisma.pushEvent.create({
      data: {
        partnerId,
        shopId,
        code,
        payload: { shop_id: shopId, code, timestamp: nowUnix(), data } as Prisma.InputJsonValue,
        status: cfg.callbackUrl ? 'PENDING' : 'SKIPPED',
      },
    });
    this.kick();
  }

  kick(): void {
    if (!loadConfig().PUSH_DELIVERY_ENABLED || this.delivering || this.stopped) return;
    this.delivering = this.deliverPending()
      .catch((err) => this.logger.warn(`push delivery failed: ${String(err)}`))
      .finally(() => {
        this.delivering = null;
      });
  }

  async deliverPending(): Promise<void> {
    const events = await this.prisma.pushEvent.findMany({ where: { status: 'PENDING' }, orderBy: { id: 'asc' }, take: 50 });
    for (const event of events) {
      if (this.stopped) return;
      const partner = await this.prisma.partnerApp.findUnique({ where: { id: event.partnerId }, include: { pushConfig: true } });
      const url = partner?.pushConfig?.callbackUrl;
      const key = partner ? resolvePartnerKey(partner.keyRef) : undefined;
      if (!url || !key) {
        await this.prisma.pushEvent.update({ where: { id: event.id }, data: { status: 'SKIPPED' } });
        continue;
      }
      const body = JSON.stringify(event.payload);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: pushSignature(key, url, body) },
          body,
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await this.prisma.pushEvent.update({
          where: { id: event.id },
          data: { status: 'DELIVERED', attempts: { increment: 1 }, deliveredAt: new Date() },
        });
      } catch (err) {
        const attempts = event.attempts + 1;
        await this.prisma.pushEvent.update({
          where: { id: event.id },
          data: { attempts, lastError: String(err).slice(0, 500), status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING' },
        });
        if (attempts < MAX_ATTEMPTS) setTimeout(() => this.kick(), 1000 * attempts).unref();
      }
    }
  }
}

/** Shopee push verification: hex(HMAC-SHA256(partner_key, callback_url + '|' + body)). */
export function pushSignature(partnerKey: string, url: string, body: string): string {
  return createHmac('sha256', partnerKey).update(`${url}|${body}`).digest('hex');
}
