'use client';
import Image from 'next/image';
import { useId } from 'react';
import type { ProductDetail, ProductModel } from '@huspee/sdk';
import { QuantityStepper } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from './messages';
import { optionState, type Selection } from './variants';

const row = 'grid grid-cols-1 gap-2 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-3';
const label = 'text-muted sm:pt-1.5';

/**
 * Tier options and quantity. Laid out as label/value rows; sold-out options and options ruled out
 * by the other choices are disabled.
 */
export function VariantPicker({
  product,
  selection,
  onSelect,
  model,
  quantity,
  onQuantity,
  missing,
}: {
  product: ProductDetail;
  selection: Selection;
  onSelect: (tier: number, option: number) => void;
  model?: ProductModel;
  quantity: number;
  onQuantity: (quantity: number) => void;
  /** Shows the "choose a variation" prompt after a purchase attempt without a full choice. */
  missing: boolean;
}) {
  const t = useT(messages);
  const id = useId();
  const stock = model?.stock ?? product.stock;
  return (
    <div className={`flex flex-col gap-4 ${missing ? 'rounded-md bg-primary-soft p-3 sm:-mx-3' : ''}`}>
      {product.tier_variations.map((tier, i) => (
        <div key={tier.name} role="group" aria-labelledby={`${id}-tier-${i}`} className={row}>
          <span id={`${id}-tier-${i}`} className={label}>
            {tier.name}
          </span>
          <div className="flex flex-wrap gap-2">
            {tier.options.map((option, j) => {
              const state = optionState(product, selection, i, j);
              const chosen = selection[i] === j;
              return (
                <button
                  key={option.option}
                  type="button"
                  disabled={state !== 'available' && !chosen}
                  aria-pressed={chosen}
                  aria-label={state === 'sold_out' ? `${option.option}, ${t('soldOut')}` : undefined}
                  title={state === 'sold_out' ? t('soldOut') : undefined}
                  onClick={() => onSelect(i, j)}
                  className={`relative flex min-h-9 items-center gap-2 rounded-sm border px-3 py-1 text-sm transition disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${chosen ? 'border-primary text-primary' : 'border-line-strong bg-white text-ink hover:border-primary hover:text-primary'} ${state === 'sold_out' ? 'line-through' : ''}`}
                >
                  {option.image_url && (
                    <Image
                      unoptimized
                      width={48}
                      height={48}
                      src={option.image_url}
                      alt=""
                      className={`h-6 w-6 rounded-sm object-cover ${state === 'sold_out' ? 'opacity-50' : ''}`}
                    />
                  )}
                  {option.option}
                  {chosen && (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 12 12"
                      className="absolute right-0 bottom-0 h-3 w-3 text-primary"
                      fill="currentColor"
                    >
                      <path d="M12 0v12H0Z" />
                      <path
                        d="m6.5 9 1.6 1.4L11 7.3"
                        className="stroke-white"
                        strokeWidth="1.1"
                        fill="none"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {missing && (
        <p role="alert" className="text-sm text-primary-hover sm:pl-[124px]">
          {t('selectVariation')}
        </p>
      )}
      <div className={row}>
        <span className={label}>{t('quantity')}</span>
        <div className="flex flex-wrap items-center gap-3">
          <QuantityStepper value={quantity} onChange={onQuantity} max={Math.max(1, stock)} />
          <span className="text-sm text-muted">
            {stock > 0 ? t('inStock', { count: stock }) : t('soldOut')}
          </span>
        </div>
      </div>
    </div>
  );
}
