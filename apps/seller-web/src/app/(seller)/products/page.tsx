'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { formatInt } from '@/components/commerce/format';
import { pageSlice } from '@/components/commerce/list';
import { ListState } from '@/components/commerce/ListState';
import { PageTabs } from '@/components/commerce/PageTabs';
import { Pager } from '@/components/commerce/Pager';
import { loadProducts, type ProductRow } from '@/components/commerce/products/product-api';
import { ProductStatus } from '@/components/commerce/products/ProductStatus';
import {
  countProductTabs,
  filterProducts,
  PRODUCT_SORTS,
  PRODUCT_TABS,
  sortProducts,
  summarizeVariants,
  type ProductSort,
  type ProductTab,
} from '@/components/commerce/products/stock';
import { VariantStockEditor } from '@/components/commerce/products/VariantStockEditor';
import { SearchInput } from '@/components/commerce/SearchInput';
import { ShopGuard } from '@/components/commerce/ShopGuard';
import { Thumb } from '@/components/commerce/Thumb';
import { btn, field, panel, sub, table } from '@/components/commerce/ui';
import { productMessages } from './messages';

const PAGE_SIZE = 20;
const TAB_LABEL = {
  all: 'tabAll',
  active: 'tabActive',
  hidden: 'tabHidden',
  out: 'tabOut',
  low: 'tabLow',
} as const;
const SORT_LABEL = {
  default: 'sortDefault',
  sales: 'sortSales',
  stock: 'sortStock',
  priceAsc: 'sortPriceAsc',
  priceDesc: 'sortPriceDesc',
} as const;

export default function ProductsPage() {
  return <ShopGuard>{(shop) => <Products shopId={shop.shop_id} />}</ShopGuard>;
}

function Products({ shopId }: { shopId: number }) {
  const t = useT(productMessages);
  const [tab, setTab] = useState<ProductTab>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(0);
  const [sort, setSort] = useState<ProductSort>('default');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const data = useApi(() => loadProducts(shopId), [shopId]);

  const rows = data.data?.rows ?? [];
  const usedCategories = useMemo(() => {
    const ids = new Set(data.data?.rows.map((r) => r.item.category_id));
    return (data.data?.categories ?? []).filter((c) => ids.has(c.category_id));
  }, [data.data]);
  const inCategory = category ? rows.filter((r) => r.item.category_id === category) : rows;
  const counts = countProductTabs(inCategory);
  const filtered = sortProducts(filterProducts(inCategory, tab, query), sort);
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(0);
      setExpanded(null);
    };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <Link href="/products/new" className={btn.primary}>
          {t('add')}
        </Link>
      </div>
      <section aria-label={t('title')} className={`${panel} px-6 pb-4`}>
        <PageTabs
          label={t('statusTabs')}
          value={tab}
          onChange={resetPage(setTab)}
          items={PRODUCT_TABS.map((value) => ({
            value,
            label: t(TAB_LABEL[value]),
            count: data.data ? counts[value] : undefined,
          }))}
        />
        <div className="flex flex-wrap items-center gap-3 py-4">
          <SearchInput
            className="min-w-64 flex-1 sm:max-w-sm"
            label={t('search')}
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={resetPage(setQuery)}
          />
          <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted">
            {t('category')}
            <select
              className={`${field} w-auto min-w-36`}
              value={category}
              onChange={(e) => resetPage(setCategory)(Number(e.target.value))}
            >
              <option value={0}>{t('all')}</option>
              {usedCategories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.display_category_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted">
            {t('sort')}
            <select
              className={`${field} w-auto min-w-36`}
              value={sort}
              onChange={(e) => resetPage(setSort)(e.target.value as ProductSort)}
            >
              {PRODUCT_SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(SORT_LABEL[s])}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ListState
          loading={data.loading}
          error={data.error}
          empty={!filtered.length}
          emptyTitle={rows.length ? t('noMatch') : t('empty')}
          onRetry={data.reload}
        >
          <div className="overflow-x-auto">
            <table className={table.root}>
              <thead>
                <tr>
                  <th scope="col" className={table.th}>
                    {t('product')}
                  </th>
                  <th scope="col" className={`${table.th} text-right`}>
                    {t('price')}
                  </th>
                  <th scope="col" className={`${table.th} text-right`}>
                    {t('stock')}
                  </th>
                  <th scope="col" className={`${table.th} text-right`}>
                    {t('sold')}
                  </th>
                  <th scope="col" className={`${table.th} text-right`}>
                    <span className="inline-block w-24 whitespace-normal">{t('asks')}</span>
                  </th>
                  <th scope="col" className={table.th}>
                    {t('status')}
                  </th>
                  <th scope="col" className={`${table.th} text-right`}>
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageSlice(filtered, page, PAGE_SIZE).map((row) => (
                  <Fragment key={row.item.item_id}>
                    <ProductTableRow
                      row={row}
                      expanded={expanded === row.item.item_id}
                      onToggle={() => setExpanded(expanded === row.item.item_id ? null : row.item.item_id)}
                    />
                    {expanded === row.item.item_id && (
                      <tr>
                        <td colSpan={7} className="border-b border-gray-100 bg-gray-50 px-4 py-4">
                          <VariantStockEditor
                            shopId={shopId}
                            itemId={row.item.item_id}
                            tiers={row.tiers}
                            variants={row.variants}
                            onClose={() => setExpanded(null)}
                            onSaved={data.reload}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPage={(p) => {
              setPage(p);
              setExpanded(null);
            }}
          />
        </ListState>
      </section>
    </div>
  );
}

function ProductTableRow({
  row,
  expanded,
  onToggle,
}: {
  row: ProductRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT(productMessages);
  const { lang } = useLang();
  const { item } = row;
  const summary = summarizeVariants(row.variants);
  const href = `/products/${item.item_id}`;
  return (
    <tr className={expanded ? 'bg-gray-50' : undefined}>
      <td className={`${table.td} min-w-60`}>
        <div className="flex items-center gap-3">
          <Thumb src={item.image.image_url_list[0]} size={48} />
          <div className="min-w-0">
            <Link href={href} className="line-clamp-2 max-w-72 hover:text-primary">
              {item.item_name}
            </Link>
            <p className={sub}>
              {[
                item.item_sku && t('skuLine', { sku: item.item_sku }),
                item.has_model && t('variantCount', { count: row.variants.length }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </td>
      <td className={`${table.td} text-right whitespace-nowrap`}>
        {summary.minPrice === summary.maxPrice
          ? formatVnd(summary.minPrice)
          : `${formatVnd(summary.minPrice)} – ${formatVnd(summary.maxPrice)}`}
      </td>
      <td className={`${table.td} text-right`}>{formatInt(summary.totalStock, lang)}</td>
      <td className={`${table.td} text-right`}>{formatInt(row.sale, lang)}</td>
      <td className={`${table.td} text-right`}>{row.asks === null ? '—' : formatInt(row.asks, lang)}</td>
      <td className={table.td}>
        <ProductStatus status={item.item_status} variants={row.variants} hasModel={item.has_model} />
      </td>
      <td className={`${table.td} text-right whitespace-nowrap`}>
        <Link href={href} className="text-link hover:underline">
          {t('edit')}
        </Link>
        {item.has_model && (
          <>
            <span aria-hidden="true" className="mx-1.5 text-line-strong">
              |
            </span>
            <button type="button" className={btn.link} aria-expanded={expanded} onClick={onToggle}>
              {expanded ? t('collapse') : t('variants')} {expanded ? '▴' : '▾'}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
