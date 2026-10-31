'use client';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import type { ProductDetail } from '@huspee/sdk';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from './messages';

export type CategoryLink = { category_id: number; display_name: string };

const heading = 'bg-gray-50 px-3.5 py-2.5 text-base font-semibold';

/** "Product details" as label rows (missing values say so), then the description. */
export function ProductDetails({
  product,
  categories,
  city,
}: {
  product: ProductDetail;
  categories: CategoryLink[];
  /** Shop city; undefined while the shop is loading. */
  city: string | null | undefined;
}) {
  const t = useT(messages);
  const missing = <span className="text-muted italic">{t('noInfo')}</span>;
  const rows: Array<[string, ReactNode]> = [
    [
      t('category'),
      categories.map((c, i) => (
        <Fragment key={c.category_id}>
          {i > 0 && <span aria-hidden="true"> › </span>}
          <Link href={`/search?category_id=${c.category_id}`} className="text-link hover:underline">
            {c.display_name}
          </Link>
        </Fragment>
      )),
    ],
    [t('brand'), product.brand?.name ?? missing],
    ...product.attributes.map((a): [string, ReactNode] => [a.name, a.value || missing]),
    [
      t('condition'),
      product.condition === 'NEW'
        ? t('conditionNew')
        : product.condition === 'USED'
          ? t('conditionUsed')
          : product.condition,
    ],
  ];
  if (city !== undefined) rows.push([t('shipsFrom'), city ?? missing]);
  return (
    <section aria-labelledby="product-details" className="bg-white p-3 sm:rounded-lg sm:p-5">
      <h2 id="product-details" className={heading}>
        {t('details')}
      </h2>
      <dl className="mt-3.5 mb-5 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-3 px-3.5 sm:grid-cols-[160px_minmax(0,1fr)]">
        {rows.map(([label, value], i) => (
          <Fragment key={`${i}-${label}`}>
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </Fragment>
        ))}
      </dl>
      <h2 className={heading}>{t('description')}</h2>
      <p className="mt-3 px-3.5 leading-relaxed whitespace-pre-wrap">{product.description || t('noInfo')}</p>
    </section>
  );
}
