import { Injectable } from '@nestjs/common';
import { LogisticsChannel } from '@prisma/client';
import { roundVnd, toNumber } from '../common/money';
import { PrismaService, Tx } from '../common/prisma.service';

export interface ShippingOption {
  logistics_channel_id: number;
  logistics_channel_name: string;
  shipping_fee: number;
  estimated_delivery_days_min: number;
  estimated_delivery_days_max: number;
  cod_enabled: boolean;
}

/** Deterministic simulated logistics: fee = base + per_kg * ceil(max(weight - 1kg, 0)). */
@Injectable()
export class LogisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async channels(db: Tx = this.prisma): Promise<LogisticsChannel[]> {
    return db.logisticsChannel.findMany({ where: { enabled: true }, orderBy: { id: 'asc' } });
  }

  fee(channel: LogisticsChannel, weightKg: number): number {
    const extraKg = Math.ceil(Math.max(weightKg - 1, 0));
    return roundVnd(toNumber(channel.baseFee) + toNumber(channel.perKgFee) * extraKg);
  }

  option(channel: LogisticsChannel, weightKg: number): ShippingOption {
    return {
      logistics_channel_id: channel.id,
      logistics_channel_name: channel.name,
      shipping_fee: this.fee(channel, weightKg),
      estimated_delivery_days_min: channel.minDays,
      estimated_delivery_days_max: channel.maxDays,
      cod_enabled: channel.codEnabled,
    };
  }

  /**
   * Channels usable for a set of items: those enabled on every item's logistic_info
   * (items without explicit logistics accept all channels).
   */
  eligibleChannels(channels: LogisticsChannel[], itemLogistics: unknown[]): LogisticsChannel[] {
    return channels.filter((c) =>
      itemLogistics.every((raw) => {
        const list = Array.isArray(raw) ? (raw as Array<{ logistic_id: number; enabled: boolean }>) : [];
        return list.length === 0 || list.some((l) => l.logistic_id === c.id && l.enabled);
      }),
    );
  }
}
