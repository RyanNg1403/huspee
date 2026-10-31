'use client';
import type { ProductDetail, ProductModel } from '@huspee/sdk';
import { useT } from '@huspee/web-ui/i18n';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { messages } from './messages';
import { discountPercent } from './variants';

const range = (min: number, max: number) =>
  min === max ? formatVnd(min) : `${formatVnd(min)} – ${formatVnd(max)}`;

/** Price of the chosen variation, or the product's price range before a choice is made. */
export function PriceBlock({ product, model }: { product: ProductDetail; model?: ProductModel }) {
  const t = useT(messages);
  const price = model ? formatVnd(model.price) : range(product.price_min, product.price_max);
  const original = model
    ? model.original_price > model.price
      ? formatVnd(model.original_price)
      : null
    : product.has_promotion && product.original_price_min > product.price_min
      ? range(product.original_price_min, product.original_price_max)
      : null;
  const percent = model
    ? discountPercent(model.price, model.original_price)
    : product.price_min === product.price_max && product.original_price_min === product.original_price_max
      ? discountPercent(product.price_min, product.original_price_min)
      : 0;
  return (
    <div
      aria-live="polite"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 pt-3 sm:rounded-md sm:bg-primary-soft sm:px-[18px] sm:py-3.5"
    >
      {original && <del className="order-2 text-sm text-muted sm:order-none sm:text-base">{original}</del>}
      <span className="text-[22px] leading-tight font-semibold text-primary sm:text-3xl sm:font-bold">
        {price}
      </span>
      {percent > 0 && (
        <span className="order-3 rounded-sm bg-primary px-1.5 py-0.5 text-xs font-bold text-white uppercase">
          {t('off', { percent })}
        </span>
      )}
      {model && model.name && (
        <span className="order-4 hidden text-xs text-muted sm:inline">
          {t('priceFor', { name: model.name })}
        </span>
      )}
    </div>
  );
}
