'use client';

import { useState } from 'react';
import { useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { FormRow } from '../FormRow';
import { MoneyInput } from '../MoneyInput';
import { btn, field, input } from '../ui';
import type { RowDraft, TierDraft } from './draft';
import { editorMessages } from './editor-messages';
import type { SectionProps } from './sections';

const MAX_TIERS = 2;

function PromoPrice({ row }: { row: RowDraft }) {
  const t = useT(editorMessages);
  return (
    <div className="flex h-9 items-center rounded-[4px] border border-line bg-gray-50 px-3 text-sm">
      {row.promoPrice !== undefined ? (
        formatVnd(row.promoPrice)
      ) : (
        <span className="text-muted">{t('none')}</span>
      )}
    </div>
  );
}

/**
 * S4.2 sales information: variation groups, quick apply and per-variant price, stock and SKU.
 * Existing options can be renamed and new ones appended; existing groups cannot be added or removed.
 */
export function SalesSection({
  draft,
  update,
  errors,
  isNew,
  savedTiers,
  onTiers,
  onDeleteVariant,
}: SectionProps & {
  isNew: boolean;
  savedTiers: TierDraft[];
  onTiers: (tiers: TierDraft[]) => void;
  onDeleteVariant: (row: RowDraft, label: string) => void;
}) {
  const t = useT(editorMessages);
  const [quick, setQuick] = useState({ price: '', stock: '', sku: '' });
  const rowError = errors.includes('rows') ? t('errRows') : undefined;
  const setRow = (index: number, patch: Partial<RowDraft>) =>
    update({ rows: draft.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  const labelOf = (r: RowDraft) => r.tierIndex.map((o, i) => draft.tiers[i]?.options[o] ?? '').join(' ');
  const canAddTier = !isNew && savedTiers.length === 0 && draft.tiers.length < MAX_TIERS;
  const savedOptions = (tier: number) => savedTiers[tier]?.options.length ?? 0;
  const setTier = (index: number, patch: Partial<TierDraft>) =>
    onTiers(draft.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));

  if (!draft.tiers.length) {
    const row = draft.rows[0];
    return (
      <>
        <FormRow label={t('price')} required error={rowError}>
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <MoneyInput
              label={t('originalPrice')}
              value={row.price}
              invalid={Boolean(rowError)}
              onChange={(price) => setRow(0, { price })}
            />
            {!isNew && <PromoPrice row={row} />}
          </div>
        </FormRow>
        <FormRow label={t('stock')} htmlFor="p-stock" required>
          <input
            id="p-stock"
            type="number"
            inputMode="numeric"
            min={0}
            className={`${input} max-w-40 text-right`}
            value={row.stock}
            aria-invalid={Boolean(rowError)}
            onChange={(e) => setRow(0, { stock: e.target.value })}
          />
        </FormRow>
        {canAddTier && (
          <FormRow label={t('variations')}>
            <button
              type="button"
              className={btn.dashed}
              onClick={() => onTiers([{ name: '', options: [''] }])}
            >
              {t('addTier', { index: 1 })}
            </button>
          </FormRow>
        )}
      </>
    );
  }

  return (
    <>
      <FormRow label={t('variations')} error={errors.includes('tiers') ? t('errTiers') : undefined}>
        <div className="space-y-4 rounded-[4px] bg-gray-50 p-4">
          {draft.tiers.map((tier, ti) => (
            <div key={ti} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted">{t('tierGroup', { index: ti + 1 })}</span>
                <input
                  aria-label={t('tierName', { index: ti + 1 })}
                  className={`${input} max-w-56`}
                  maxLength={20}
                  value={tier.name}
                  onChange={(e) => setTier(ti, { name: e.target.value })}
                />
                {savedTiers.length === 0 && (
                  <button
                    type="button"
                    className={`${btn.link} text-sm`}
                    onClick={() => onTiers(draft.tiers.filter((_, i) => i !== ti))}
                  >
                    {t('removeTier')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2.5 md:pl-28">
                {tier.options.map((option, oi) => (
                  <div key={oi} className="relative w-44">
                    <input
                      aria-label={t('optionName', { index: oi + 1, group: ti + 1 })}
                      className={`${input} ${oi >= savedOptions(ti) ? 'pr-8' : ''}`}
                      maxLength={30}
                      value={option}
                      onChange={(e) =>
                        setTier(ti, { options: tier.options.map((o, i) => (i === oi ? e.target.value : o)) })
                      }
                    />
                    {oi >= savedOptions(ti) && tier.options.length > 1 && (
                      <button
                        type="button"
                        aria-label={t('removeOption', { name: option || oi + 1 })}
                        className="absolute top-1/2 right-2 -translate-y-1/2 px-1 text-muted hover:text-ink"
                        onClick={() => setTier(ti, { options: tier.options.filter((_, i) => i !== oi) })}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className={btn.dashed}
                  onClick={() => setTier(ti, { options: [...tier.options, ''] })}
                >
                  {t('addOption')}
                </button>
              </div>
            </div>
          ))}
          {canAddTier && (
            <button
              type="button"
              className={btn.dashed}
              onClick={() => onTiers([...draft.tiers, { name: '', options: [''] }])}
            >
              {t('addTier', { index: draft.tiers.length + 1 })}
            </button>
          )}
        </div>
      </FormRow>
      <FormRow label={t('quickApply')}>
        <div className="flex flex-wrap gap-2.5">
          <input
            type="number"
            aria-label={t('price')}
            placeholder={t('price')}
            className={`${field} w-40`}
            value={quick.price}
            onChange={(e) => setQuick({ ...quick, price: e.target.value })}
          />
          <input
            type="number"
            aria-label={t('stock')}
            placeholder={t('stock')}
            className={`${field} w-40`}
            value={quick.stock}
            onChange={(e) => setQuick({ ...quick, stock: e.target.value })}
          />
          <input
            aria-label={t('variantSku')}
            placeholder={t('variantSku')}
            className={`${field} w-40`}
            value={quick.sku}
            onChange={(e) => setQuick({ ...quick, sku: e.target.value })}
          />
          <button
            type="button"
            className={btn.accent}
            disabled={!quick.price && !quick.stock && !quick.sku}
            onClick={() =>
              update({
                rows: draft.rows.map((r) => ({
                  ...r,
                  ...(quick.price ? { price: quick.price } : {}),
                  ...(quick.stock ? { stock: quick.stock } : {}),
                  ...(quick.sku ? { sku: quick.sku } : {}),
                })),
              })
            }
          >
            {t('applyAll')}
          </button>
        </div>
      </FormRow>
      <FormRow label={t('variantList')} error={rowError}>
        <div className="overflow-x-auto rounded-[4px] border border-line">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-[13px] text-muted">
              <tr>
                {draft.tiers.map((tier, i) => (
                  <th key={i} scope="col" className="px-3 py-2.5 font-medium">
                    {tier.name}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2.5 font-medium">
                  {t('originalPrice')}
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  {t('promoPrice')}
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  {t('stock')}
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  {t('variantSku')}
                </th>
                <th scope="col" className="px-3 py-2.5">
                  <span className="sr-only">{t('deleteVariant')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((row, ri) => {
                const label = labelOf(row);
                const soldOut = row.stock === '0';
                return (
                  <tr key={row.tierIndex.join(',')} className="border-t border-line-soft align-top">
                    {row.tierIndex.map((o, i) => (
                      <td key={i} className="px-3 py-3 pt-5 whitespace-nowrap">
                        {draft.tiers[i]?.options[o]}
                      </td>
                    ))}
                    <td className="min-w-40 px-3 py-3">
                      <MoneyInput
                        label={t('priceOf', { name: label })}
                        value={row.price}
                        onChange={(price) => setRow(ri, { price })}
                      />
                    </td>
                    <td className="min-w-36 px-3 py-3">
                      <PromoPrice row={row} />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        aria-label={t('stockOf', { name: label })}
                        aria-invalid={soldOut}
                        className={`${field} w-24 text-right`}
                        value={row.stock}
                        onChange={(e) => setRow(ri, { stock: e.target.value })}
                      />
                      {soldOut && <p className="mt-1 text-[13px] text-primary-hover">{t('soldOut')}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        aria-label={t('skuOf', { name: label })}
                        className={`${field} w-40`}
                        maxLength={100}
                        value={row.sku}
                        onChange={(e) => setRow(ri, { sku: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-3 pt-5 text-right">
                      {row.modelId !== null && draft.rows.filter((r) => r.modelId !== null).length > 1 && (
                        <button
                          type="button"
                          className={`${btn.link} text-[13px]`}
                          aria-label={t('deleteVariantOf', { name: label })}
                          onClick={() => onDeleteVariant(row, label)}
                        >
                          {t('deleteVariant')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </FormRow>
    </>
  );
}
