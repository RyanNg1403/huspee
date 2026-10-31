'use client';

import { useT } from '@huspee/web-ui/i18n/client';
import { StatusDot, type StatusTone } from '../StatusDot';
import { productUiMessages } from './messages';
import { stockLevel, summarizeVariants, type VariantRow } from './stock';

const TONE: Record<string, StatusTone> = {
  NORMAL: 'success',
  UNLIST: 'muted',
  BANNED: 'action',
  REVIEWING: 'progress',
};
const STATUSES = ['NORMAL', 'UNLIST', 'BANNED', 'REVIEWING'] as const;

export function useItemStatusLabel() {
  const t = useT(productUiMessages);
  return (status: string) =>
    (STATUSES as readonly string[]).includes(status)
      ? t(`status${status as (typeof STATUSES)[number]}`)
      : status;
}

/** Listing status plus the stock warning that needs attention, if any. */
export function ProductStatus({
  status,
  variants,
  hasModel,
}: {
  status: string;
  variants: VariantRow[];
  hasModel: boolean;
}) {
  const t = useT(productUiMessages);
  const label = useItemStatusLabel();
  const { out, low } = summarizeVariants(variants);
  const warning = hasModel
    ? out.length
      ? t('outVariants', { count: out.length })
      : low.length === 1
        ? t('variantLeft', { name: low[0].label, stock: low[0].stock })
        : low.length
          ? t('lowVariants', { count: low.length })
          : ''
    : out.length
      ? t('soldOut')
      : low.length
        ? t('lowLeft', { stock: low[0].stock })
        : '';
  return (
    <div>
      <StatusDot tone={TONE[status] ?? 'muted'}>{label(status)}</StatusDot>
      {warning && <p className="mt-0.5 text-[13px] text-warning">{warning}</p>}
    </div>
  );
}

export function VariantStockStatus({ stock }: { stock: number }) {
  const t = useT(productUiMessages);
  const level = stockLevel(stock);
  if (level === 'out') return <StatusDot tone="action">{t('soldOut')}</StatusDot>;
  if (level === 'low') return <StatusDot tone="warning">{t('low')}</StatusDot>;
  return <StatusDot tone="success">{t('inStock')}</StatusDot>;
}
