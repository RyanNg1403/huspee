'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { formatShortDateTime } from '@/components/commerce/format';
import { pageSlice } from '@/components/commerce/list';
import { ListState } from '@/components/commerce/ListState';
import { PageTabs } from '@/components/commerce/PageTabs';
import { Pager } from '@/components/commerce/Pager';
import { loadReturns } from '@/components/commerce/returns/return-api';
import {
  countReturnTabs,
  filterReturns,
  needsSellerAction,
  RETURN_TABS,
  type ReturnTab,
} from '@/components/commerce/returns/return-filters';
import { ReturnStatusLabel, useReturnReason } from '@/components/commerce/returns/ReturnStatusLabel';
import type { ReturnSummary } from '@/components/commerce/returns/types';
import { SearchInput } from '@/components/commerce/SearchInput';
import { ShopGuard } from '@/components/commerce/ShopGuard';
import { Thumb } from '@/components/commerce/Thumb';
import { btn, field, panel, sub, table } from '@/components/commerce/ui';
import { returnMessages } from './messages';

const PAGE_SIZE = 20;
const PERIODS = [7, 30, 90] as const;
const TAB_LABEL = {
  all: 'tabAll',
  pending: 'tabPending',
  processing: 'tabProcessing',
  refunded: 'tabRefunded',
  closed: 'tabClosed',
} as const;

export default function ReturnsPage() {
  return <ShopGuard>{(shop) => <Returns shopId={shop.shop_id} />}</ShopGuard>;
}

function Returns({ shopId }: { shopId: number }) {
  const t = useT(returnMessages);
  const [tab, setTab] = useState<ReturnTab>('all');
  const [query, setQuery] = useState('');
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [page, setPage] = useState(0);
  const list = useApi(
    () => loadReturns(shopId, Math.floor(Date.now() / 1000) - days * 86400),
    [shopId, days],
  );
  const counts = useMemo(() => countReturnTabs(list.data ?? []), [list.data]);
  const filtered = useMemo(() => filterReturns(list.data ?? [], tab, query), [list.data, tab, query]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <section aria-label={t('title')} className={`${panel} px-6 pb-4`}>
        <PageTabs
          label={t('statusTabs')}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setPage(0);
          }}
          items={RETURN_TABS.map((value) => ({
            value,
            label: t(TAB_LABEL[value]),
            count: list.data ? counts[value] : undefined,
            accent: value === 'pending',
          }))}
        />
        <div className="flex flex-wrap items-center gap-3 py-4">
          <SearchInput
            className="min-w-64 flex-1 sm:max-w-sm"
            label={t('search')}
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(0);
            }}
          />
          <label className="flex items-center gap-2 text-sm whitespace-nowrap text-muted">
            {t('period')}
            <select
              className={`${field} w-auto`}
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value) as (typeof PERIODS)[number]);
                setPage(0);
              }}
            >
              {PERIODS.map((d) => (
                <option key={d} value={d}>
                  {t(`period${d}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ListState
          loading={list.loading}
          error={list.error}
          empty={!filtered.length}
          emptyTitle={t('empty')}
          onRetry={list.reload}
        >
          <div className="overflow-x-auto">
            <table className={table.root}>
              <thead>
                <tr>
                  {(['request', 'buyer', 'product', 'reason'] as const).map((k) => (
                    <th key={k} scope="col" className={table.th}>
                      {t(k)}
                    </th>
                  ))}
                  <th scope="col" className={`${table.th} text-right`}>
                    {t('refund')}
                  </th>
                  <th scope="col" className={table.th}>
                    {t('due')}
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
                {pageSlice(filtered, page, PAGE_SIZE).map((r) => (
                  <ReturnRow key={r.return_sn} ret={r} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </ListState>
      </section>
    </div>
  );
}

function ReturnRow({ ret }: { ret: ReturnSummary }) {
  const t = useT(returnMessages);
  const { lang } = useLang();
  const reason = useReturnReason();
  const pending = needsSellerAction(ret);
  const href = `/returns/${ret.return_sn}`;
  return (
    <tr>
      <td className={table.td}>
        <Link href={href} className="text-link hover:underline">
          {ret.return_sn}
        </Link>
        <div className={sub}>{t('orderRef', { sn: ret.order_sn })}</div>
        <div className={sub}>{formatShortDateTime(ret.create_time, lang)}</div>
      </td>
      <td className={table.td}>{ret.user.username}</td>
      <td className={table.td}>
        <div className="space-y-2">
          {ret.item.map((i) => (
            <div key={`${i.item_id}-${i.model_id}`} className="flex items-center gap-2.5">
              <Thumb src={i.images[0]} />
              <span className="line-clamp-2 max-w-56">
                {i.name} × {i.amount}
              </span>
            </div>
          ))}
        </div>
      </td>
      <td className={`${table.td} max-w-48`}>{reason(ret.reason)}</td>
      <td className={`${table.td} text-right whitespace-nowrap`}>{formatVnd(ret.refund_amount)}</td>
      <td className={`${table.td} whitespace-nowrap`}>
        {pending ? formatShortDateTime(ret.due_date, lang) : '—'}
      </td>
      <td className={table.td}>
        <ReturnStatusLabel status={ret.status} negotiation={ret.negotiation_status} />
      </td>
      <td className={`${table.td} text-right`}>
        {pending ? (
          <Link href={href} className={btn.primarySm}>
            {t('handle')}
          </Link>
        ) : (
          <Link href={href} className="text-link hover:underline">
            {t('view')}
          </Link>
        )}
      </td>
    </tr>
  );
}
