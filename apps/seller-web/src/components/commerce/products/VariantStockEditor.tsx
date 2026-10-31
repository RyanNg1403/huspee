'use client';

import { useState } from 'react';
import { Spinner, useToast } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { call } from '@/lib/seller-api';
import { ActionError } from '../errors';
import { btn, field, sub } from '../ui';
import { productUiMessages } from './messages';
import { VariantStockStatus } from './ProductStatus';
import type { VariantRow } from './stock';
import type { TierVariation } from './types';

const cell = 'border-b border-line-soft px-3 py-2.5 first:pl-4 last:pr-4';

/** Expanded S4.1 row: per-variant stock edited in place, saved with one update_stock call. */
export function VariantStockEditor({
  shopId,
  itemId,
  tiers,
  variants,
  onClose,
  onSaved,
}: {
  shopId: number;
  itemId: number;
  tiers: TierVariation[];
  variants: VariantRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT(productUiMessages);
  const toast = useToast();
  const [stock, setStock] = useState<Record<number, string>>(() =>
    Object.fromEntries(variants.map((v) => [v.model_id, String(v.stock)])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const changed = variants.filter((v) => stock[v.model_id] !== String(v.stock));
  const invalid = variants.some((v) => !/^\d+$/.test(stock[v.model_id] ?? ''));

  async function save() {
    setPending(true);
    setError(null);
    try {
      const res = await call<{ failure_list: Array<{ failed_reason: string }> }>(
        shopId,
        '/product/update_stock',
        {
          item_id: itemId,
          stock_list: changed.map((v) => ({
            model_id: v.model_id,
            seller_stock: [{ stock: Number(stock[v.model_id]) }],
          })),
        },
      );
      if (res.failure_list.length) {
        setError(res.failure_list[0].failed_reason);
        return;
      }
      toast(t('stockSaved'));
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-[4px] border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-[13px] text-muted">
          <tr>
            {tiers.map((tier) => (
              <th key={tier.name} scope="col" className={`${cell} text-left font-medium`}>
                {tier.name}
              </th>
            ))}
            <th scope="col" className={`${cell} text-left font-medium`}>
              {t('sku')}
            </th>
            <th scope="col" className={`${cell} text-right font-medium`}>
              {t('price')}
            </th>
            <th scope="col" className={`${cell} text-left font-medium`}>
              {t('stock')}
            </th>
            <th scope="col" className={`${cell} text-left font-medium`}>
              {t('status')}
            </th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => {
            const value = stock[v.model_id] ?? '';
            return (
              <tr key={v.model_id}>
                {tiers.map((tier, i) => (
                  <td key={tier.name} className={cell}>
                    {v.options[i]}
                  </td>
                ))}
                <td className={`${cell} ${sub}`}>{v.sku}</td>
                <td className={`${cell} text-right whitespace-nowrap`}>
                  {formatVnd(v.current_price)}
                  {v.original_price > v.current_price && (
                    <span className={`${sub} ml-1.5 line-through`}>{formatVnd(v.original_price)}</span>
                  )}
                </td>
                <td className={cell}>
                  <input
                    type="number"
                    min={0}
                    max={999999}
                    inputMode="numeric"
                    aria-label={t('stockOf', { name: v.label })}
                    aria-invalid={value === '0' || !/^\d+$/.test(value)}
                    className={`${field} w-24 text-right`}
                    value={value}
                    onChange={(e) => setStock({ ...stock, [v.model_id]: e.target.value })}
                  />
                </td>
                <td className={cell}>
                  <VariantStockStatus stock={Number(value) || 0} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-2 px-4 py-3">
        <div className="mr-auto">
          <ActionError error={error} />
        </div>
        <button type="button" className={btn.outlineSm} onClick={onClose} disabled={pending}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className={btn.primarySm}
          disabled={pending || invalid || !changed.length}
          onClick={() => void save()}
        >
          {pending && <Spinner />}
          {t('saveStock')}
        </button>
      </div>
    </div>
  );
}
