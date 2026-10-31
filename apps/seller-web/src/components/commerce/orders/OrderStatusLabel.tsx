'use client';

import { useT } from '@huspee/web-ui/i18n/client';
import { StatusDot, type StatusTone } from '../StatusDot';
import { orderUiMessages } from './messages';
import type { OrderStatus } from './order-filters';

const TONE: Record<OrderStatus, StatusTone> = {
  UNPAID: 'warning',
  READY_TO_SHIP: 'action',
  PROCESSED: 'progress',
  SHIPPED: 'progress',
  TO_CONFIRM_RECEIVE: 'success',
  COMPLETED: 'success',
  CANCELLED: 'muted',
  TO_RETURN: 'action',
  IN_CANCEL: 'warning',
};

export function OrderStatusLabel({ status }: { status: OrderStatus }) {
  const t = useT(orderUiMessages);
  return <StatusDot tone={TONE[status] ?? 'muted'}>{TONE[status] ? t(`status${status}`) : status}</StatusDot>;
}

const CANCEL_REASONS = [
  'OUT_OF_STOCK',
  'CUSTOMER_REQUEST',
  'UNDELIVERABLE_AREA',
  'COD_NOT_SUPPORTED',
  'LOGISTICS_DELIVERY_FAILED',
] as const;
type CancelReason = (typeof CANCEL_REASONS)[number];

export function useCancelReasonLabel() {
  const t = useT(orderUiMessages);
  return (reason = '') =>
    (CANCEL_REASONS as readonly string[]).includes(reason) ? t(`reason${reason as CancelReason}`) : reason;
}

/** Payment label from the stored method name (the API stores English labels). */
export function usePaymentLabel() {
  const t = useT(orderUiMessages);
  return (method: string, cod: boolean, short = false) => {
    if (cod || /cash on delivery|^cod$/i.test(method)) return short ? t('payCodShort') : t('payCod');
    if (/card/i.test(method)) return t('payCard');
    if (/bank/i.test(method)) return t('payBank');
    if (/pay/i.test(method)) return t('payWallet');
    return method;
  };
}
