import { Prisma } from '@prisma/client';

/** VND has no minor unit; all money is rounded to whole dong and computed deterministically. */
export type MoneyLike = Prisma.Decimal | number | string | null | undefined;

export function toNumber(value: MoneyLike): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

export function roundVnd(value: number): number {
  return Math.round(value);
}

export function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export const CURRENCY = 'VND';
