'use client';

import { Badge } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { opsMessages } from './messages';
import type { OrderStatusType, ReturnStatusType } from './types';

export function OrderStatusBadge({ status }: { status: OrderStatusType }) {
  const t = useT(opsMessages);
  const map: Record<
    OrderStatusType,
    { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' | 'info' }
  > = {
    UNPAID: { label: t('statusUnpaid'), tone: 'warning' },
    READY_TO_SHIP: { label: t('statusReadyToShip'), tone: 'info' },
    PROCESSED: { label: t('statusProcessed'), tone: 'info' },
    SHIPPED: { label: t('statusShipped'), tone: 'info' },
    TO_CONFIRM_RECEIVE: { label: t('statusToConfirmReceive'), tone: 'warning' },
    COMPLETED: { label: t('statusCompleted'), tone: 'success' },
    CANCELLED: { label: t('statusCancelled'), tone: 'error' },
    TO_RETURN: { label: t('statusToReturn'), tone: 'error' },
    IN_CANCEL: { label: t('statusInCancel'), tone: 'warning' },
  };

  const item = map[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function ReturnStatusBadge({ status }: { status: ReturnStatusType }) {
  const t = useT(opsMessages);
  const map: Record<
    ReturnStatusType,
    { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' | 'info' }
  > = {
    REQUESTED: { label: t('returnRequested'), tone: 'warning' },
    ACCEPTED: { label: t('returnAccepted'), tone: 'info' },
    JUDGING: { label: t('returnJudging'), tone: 'warning' },
    CANCELLED: { label: t('returnCancelled'), tone: 'neutral' },
    CLOSED: { label: t('returnClosed'), tone: 'neutral' },
    PROCESSING: { label: t('returnProcessing'), tone: 'info' },
    SELLER_DISPUTE: { label: t('returnSellerDispute'), tone: 'warning' },
  };

  const item = map[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function VoucherStatusBadge({ status }: { status: 'upcoming' | 'ongoing' | 'expired' }) {
  const t = useT(opsMessages);
  const map = {
    upcoming: { label: t('voucherUpcoming'), tone: 'info' as const },
    ongoing: { label: t('voucherOngoing'), tone: 'success' as const },
    expired: { label: t('voucherExpired'), tone: 'neutral' as const },
  };
  const item = map[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
