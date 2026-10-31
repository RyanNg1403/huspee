'use client';

import { useT } from '@huspee/web-ui/i18n/client';
import { StatusDot, type StatusTone } from '../StatusDot';
import { returnUiMessages } from './messages';
import { needsSellerAction, type ReturnStatus } from './return-filters';

type StatusKey = 'Pending' | 'AwaitBuyer' | 'Judging' | 'Processing' | 'Refunded' | 'Cancelled' | 'Closed';

const TONE: Record<StatusKey, StatusTone> = {
  Pending: 'action',
  AwaitBuyer: 'progress',
  Judging: 'warning',
  Processing: 'progress',
  Refunded: 'success',
  Cancelled: 'muted',
  Closed: 'muted',
};

function statusKey(status: ReturnStatus, negotiation?: string): StatusKey {
  if (needsSellerAction({ status, negotiation_status: negotiation })) return 'Pending';
  if (status === 'REQUESTED') return 'AwaitBuyer';
  if (status === 'JUDGING' || status === 'SELLER_DISPUTE') return 'Judging';
  if (status === 'ACCEPTED') return 'Refunded';
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'CLOSED') return 'Closed';
  return 'Processing';
}

export function ReturnStatusLabel({ status, negotiation }: { status: ReturnStatus; negotiation?: string }) {
  const t = useT(returnUiMessages);
  const key = statusKey(status, negotiation);
  return <StatusDot tone={TONE[key]}>{t(`status${key}`)}</StatusDot>;
}

const REASONS = [
  'NOT_RECEIPT',
  'WRONG_ITEM',
  'ITEM_DAMAGED',
  'PHYSICAL_DMG',
  'FUNCTIONAL_DMG',
  'DIFFERENT_DESCRIPTION',
  'MUTUAL_AGREE',
  'ITEM_MISSING',
  'EXPECTATION_FAILED',
  'ITEM_FAKE',
  'CHANGE_MIND',
  'OTHER',
] as const;
type Reason = (typeof REASONS)[number];

export function useReturnReason() {
  const t = useT(returnUiMessages);
  return (reason: string) =>
    (REASONS as readonly string[]).includes(reason) ? t(`reason${reason as Reason}`) : reason;
}
