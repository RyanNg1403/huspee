'use client';

import type { OrderStatus, BuyerReturn } from '@huspee/sdk';
import { Badge } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, isApiError } from '@huspee/web-ui/lib/api';
import { messages } from './messages';

export const panel = 'rounded-2xl border border-line bg-white p-4 shadow-card sm:p-6';

export { QueryState as State, QueryState, ApiState } from '@huspee/web-ui/components/ui';

type MessageKey = keyof typeof messages.vi;
type CommonKey = keyof typeof common.vi;

export function getErrorMessage(
  error: unknown,
  tCommon: (k: CommonKey) => string,
  tLocal?: (k: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  if (isApiError(error)) {
    const code = error.code ? error.code.toUpperCase() : '';
    if (code === 'OUT_OF_STOCK' && tLocal) return tLocal('outOfStock');
    if (error.message && tLocal) {
      const formatted = formatIssue(error.message, tLocal);
      if (formatted !== error.message) return formatted;
    }
  }
  return tCommon(errorMessageKey(error));
}

export function formatPaymentMethod(method: string, cod: boolean, t: (k: MessageKey) => string): string {
  if (cod || method === 'COD' || /cash on delivery/i.test(method)) {
    return t('paymentCod');
  }
  if (method === 'SHOPEEPAY_SIM' || /shopeepay/i.test(method) || /huspee/i.test(method)) {
    return t('paymentShopeepay');
  }
  if (method === 'CARD_SIM' || /card/i.test(method)) {
    return t('paymentCard');
  }
  if (method === 'BANK_TRANSFER_SIM' || /bank/i.test(method)) {
    return t('paymentBank');
  }
  return method;
}

export function formatReturnReason(reason: string, t: (k: MessageKey) => string): string {
  const map: Record<string, MessageKey> = {
    NOT_RECEIPT: 'reasonNotReceipt',
    WRONG_ITEM: 'reasonWrongItem',
    ITEM_DAMAGED: 'reasonDamaged',
    PHYSICAL_DMG: 'reasonDamaged',
    FUNCTIONAL_DMG: 'reasonDamaged',
    DIFFERENT_DESCRIPTION: 'reasonDifferentDescription',
    MUTUAL_AGREE: 'reasonMutualAgree',
    ITEM_MISSING: 'reasonMissing',
    EXPECTATION_FAILED: 'reasonExpectationFailed',
    ITEM_FAKE: 'reasonFake',
    CHANGE_MIND: 'reasonChangeMind',
    OTHER: 'reasonOther',
  };
  const key = map[reason];
  return key ? t(key) : reason;
}

export function formatIssue(
  issue: string,
  t: (k: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  if (!issue) return '';
  const voucherMatch = issue.match(/^Voucher\s+([^:]+):\s+(.+)$/);
  if (voucherMatch) {
    return `${voucherMatch[1]}: ${formatIssue(voucherMatch[2], t)}`;
  }
  const itemMatch = issue.match(/^([^:]+):\s+(.+)$/);
  if (itemMatch && !issue.startsWith('http')) {
    return `${itemMatch[1]}: ${formatIssue(itemMatch[2], t)}`;
  }

  const trimmed = issue.trim();
  if (/out of stock/i.test(trimmed)) return t('outOfStock');
  if (/product is (no longer |)unavailable/i.test(trimmed)) return t('productUnavailable');
  if (/shop is on holiday/i.test(trimmed)) return t('shopOnHoliday');
  if (/variation is unavailable/i.test(trimmed)) return t('variationUnavailable');
  if (/cannot buy from your own shop/i.test(trimmed)) return t('cannotBuyOwnShop');
  if (/voucher does not exist for this shop/i.test(trimmed)) return t('voucherNotFound');
  if (/already used this voucher/i.test(trimmed)) return t('voucherAlreadyUsed');
  if (/voucher is not active/i.test(trimmed)) return t('voucherNotActive');
  if (/voucher is fully redeemed/i.test(trimmed)) return t('voucherFullyRedeemed');
  if (/no eligible items for this voucher/i.test(trimmed)) return t('voucherNoEligibleItems');

  const minSpendMatch = trimmed.match(/minimum spend of (\d+[\d,.]*) VND not reached/i);
  if (minSpendMatch) return t('voucherMinSpend', { amount: `${minSpendMatch[1]}₫` });

  const onlyLeftMatch = trimmed.match(/only (\d+) left/i);
  if (onlyLeftMatch) return t('onlyLeft', { count: onlyLeftMatch[1] });

  return trimmed;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useT(messages);
  switch (status) {
    case 'UNPAID':
      return <Badge tone="warning">{t('statusUnpaid')}</Badge>;
    case 'READY_TO_SHIP':
      return <Badge tone="info">{t('statusReadyToShip')}</Badge>;
    case 'PROCESSED':
      return <Badge tone="info">{t('statusProcessed')}</Badge>;
    case 'SHIPPED':
      return <Badge tone="info">{t('statusShipped')}</Badge>;
    case 'TO_CONFIRM_RECEIVE':
      return <Badge tone="warning">{t('statusToConfirmReceive')}</Badge>;
    case 'COMPLETED':
      return <Badge tone="success">{t('statusCompleted')}</Badge>;
    case 'IN_CANCEL':
      return <Badge tone="warning">{t('statusInCancel')}</Badge>;
    case 'CANCELLED':
      return <Badge tone="error">{t('statusCancelled')}</Badge>;
    case 'TO_RETURN':
      return <Badge tone="warning">{t('statusToReturn')}</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

export function ReturnStatusBadge({ status }: { status: BuyerReturn['status'] }) {
  const t = useT(messages);
  switch (status) {
    case 'REQUESTED':
      return <Badge tone="warning">{t('statusRequested')}</Badge>;
    case 'ACCEPTED':
      return <Badge tone="success">{t('statusAccepted')}</Badge>;
    case 'JUDGING':
      return <Badge tone="warning">{t('statusJudging')}</Badge>;
    case 'CLOSED':
      return <Badge tone="neutral">{t('statusClosed')}</Badge>;
    case 'PROCESSING':
      return <Badge tone="info">{t('statusProcessing')}</Badge>;
    case 'SELLER_DISPUTE':
      return <Badge tone="error">{t('statusSellerDispute')}</Badge>;
    case 'CANCELLED':
      return <Badge tone="error">{t('cancel')}</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}
