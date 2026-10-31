'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Modal, Spinner, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { call } from '@/lib/seller-api';
import { ActionError } from '@/components/commerce/errors';
import { formatFullDateTime, formatInt } from '@/components/commerce/format';
import { pageSlice } from '@/components/commerce/list';
import { ListState } from '@/components/commerce/ListState';
import { PageTabs } from '@/components/commerce/PageTabs';
import { Pager } from '@/components/commerce/Pager';
import { SearchInput } from '@/components/commerce/SearchInput';
import { ShopGuard } from '@/components/commerce/ShopGuard';
import { StatusDot } from '@/components/shell';
import { btn, panel, sub, table } from '@/components/commerce/ui';
import {
  loadVoucherDetails,
  loadVouchers,
  type VoucherSummary,
} from '@/components/commerce/vouchers/voucher-api';
import {
  countVoucherTabs,
  filterVouchers,
  VOUCHER_TABS,
  voucherBadge,
  voucherState,
  type VoucherState,
  type VoucherTab,
} from '@/components/commerce/vouchers/voucher-filters';
import {
  REWARD_PERCENT,
  VOUCHER_PRODUCT,
  type VoucherDetail,
} from '@/components/commerce/vouchers/voucher-form';
import { voucherMessages } from './messages';

const PAGE_SIZE = 20;
const TAB_LABEL = {
  all: 'tabAll',
  ongoing: 'tabOngoing',
  upcoming: 'tabUpcoming',
  expired: 'tabExpired',
} as const;
const STATE_TONE = { ongoing: 'success', upcoming: 'progress', expired: 'muted' } as const;

export default function VouchersPage() {
  return <ShopGuard>{(shop) => <Vouchers shopId={shop.shop_id} />}</ShopGuard>;
}

function Vouchers({ shopId }: { shopId: number }) {
  const t = useT(voucherMessages);
  const toast = useToast();
  const [tab, setTab] = useState<VoucherTab>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<{ kind: 'end' | 'delete'; voucher: VoucherSummary } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const list = useApi(
    async () => ({ vouchers: await loadVouchers(shopId), now: Math.floor(Date.now() / 1000) }),
    [shopId],
  );
  const now = list.data?.now ?? 0;
  const counts = countVoucherTabs(list.data?.vouchers ?? [], now);
  const filtered = filterVouchers(list.data?.vouchers ?? [], tab, query, now);
  const rows = pageSlice(filtered, page, PAGE_SIZE);
  const idKey = rows.map((v) => v.voucher_id).join(',');
  const details = useApi(
    () => loadVoucherDetails(shopId, idKey ? idKey.split(',').map(Number) : []),
    [shopId, idKey],
  );

  async function act() {
    if (!confirm) return;
    setPending(true);
    setError(null);
    try {
      const { kind, voucher } = confirm;
      await call(shopId, kind === 'end' ? '/voucher/end_voucher' : '/voucher/delete_voucher', {
        voucher_id: voucher.voucher_id,
      });
      toast(t(kind === 'end' ? 'ended' : 'deleted', { code: voucher.voucher_code }));
      setConfirm(null);
      list.reload();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <Link href="/vouchers/new" className={btn.primary}>
          {t('create')}
        </Link>
      </div>
      <section aria-label={t('title')} className={`${panel} px-6 pb-4`}>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-soft">
          <div className="-mb-px">
            <PageTabs
              label={t('statusTabs')}
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(0);
              }}
              items={VOUCHER_TABS.map((value) => ({
                value,
                label: t(TAB_LABEL[value]),
                count: list.data ? counts[value] : undefined,
              }))}
            />
          </div>
          <SearchInput
            className="mb-2 w-full sm:w-72"
            label={t('search')}
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(0);
            }}
          />
        </div>
        <ListState
          loading={list.loading || (details.loading && rows.length > 0)}
          error={list.error ?? details.error}
          empty={!filtered.length}
          emptyTitle={list.data?.vouchers.length ? t('noMatch') : t('empty')}
          onRetry={() => {
            list.reload();
            details.reload();
          }}
        >
          <div className="overflow-x-auto">
            <table className={table.root}>
              <thead>
                <tr>
                  <th scope="col" className={table.th}>
                    {t('name')}
                  </th>
                  <th scope="col" className={table.th}>
                    {t('discount')}
                  </th>
                  <th scope="col" className={`${table.th} text-right`}>
                    {t('minBasket')}
                  </th>
                  <th scope="col" className={table.th}>
                    {t('usage')}
                  </th>
                  <th scope="col" className={table.th}>
                    {t('period')}
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
                {rows.map((v) => (
                  <VoucherRow
                    key={v.voucher_id}
                    voucher={v}
                    detail={details.data?.get(v.voucher_id)}
                    state={voucherState(v.start_time, v.end_time, now)}
                    onEnd={() => setConfirm({ kind: 'end', voucher: v })}
                    onDelete={() => setConfirm({ kind: 'delete', voucher: v })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </ListState>
      </section>
      {confirm && (
        <Modal
          open
          onClose={() => setConfirm(null)}
          title={t(confirm.kind === 'end' ? 'endTitle' : 'deleteTitle', {
            code: confirm.voucher.voucher_code,
          })}
        >
          <div className="space-y-4">
            <ActionError error={error} />
            <div className="flex justify-end gap-3">
              <button type="button" className={btn.outline} onClick={() => setConfirm(null)}>
                {t('back')}
              </button>
              <button type="button" className={btn.primary} disabled={pending} onClick={() => void act()}>
                {pending && <Spinner />}
                {t(confirm.kind === 'end' ? 'end' : 'delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function VoucherRow({
  voucher: v,
  detail,
  state,
  onEnd,
  onDelete,
}: {
  voucher: VoucherSummary;
  detail?: VoucherDetail;
  state: VoucherState;
  onEnd: () => void;
  onDelete: () => void;
}) {
  const t = useT(voucherMessages);
  const { lang } = useLang();
  const used = v.usage_quantity ? Math.min(1, v.current_usage / v.usage_quantity) : 0;
  const scope =
    v.voucher_type === VOUCHER_PRODUCT
      ? t('itemCount', { count: detail?.item_id_list.length ?? 0 })
      : t('wholeShop');
  const discount =
    v.reward_type === REWARD_PERCENT
      ? detail?.max_price
        ? t('percentMax', { pct: v.percentage, max: formatVnd(detail.max_price) })
        : t('percent', { pct: v.percentage })
      : formatVnd(v.discount_amount);
  const actions = [
    state !== 'expired' && (
      <Link key="edit" href={`/vouchers/${v.voucher_id}`} className="text-link hover:underline">
        {t('editAction')}
      </Link>
    ),
    <Link key="copy" href={`/vouchers/new?copy=${v.voucher_id}`} className="text-link hover:underline">
      {t('copy')}
    </Link>,
    state === 'ongoing' && (
      <button key="end" type="button" className={btn.link} onClick={onEnd}>
        {t('end')}
      </button>
    ),
    state === 'upcoming' && (
      <button key="delete" type="button" className={btn.link} onClick={onDelete}>
        {t('delete')}
      </button>
    ),
  ].filter(Boolean);
  return (
    <tr>
      <td className={`${table.td} min-w-64`}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] bg-primary text-[13px] font-semibold text-white"
          >
            {voucherBadge(v.reward_type, v.discount_amount, v.percentage)}
          </span>
          <div>
            <p>{v.voucher_name}</p>
            <p className={sub}>
              {t('codeLine', { code: v.voucher_code })} · {scope}
            </p>
          </div>
        </div>
      </td>
      <td className={`${table.td} whitespace-nowrap`}>{discount}</td>
      <td className={`${table.td} text-right whitespace-nowrap`}>
        {detail ? formatVnd(detail.min_basket_price) : '—'}
      </td>
      <td className={table.td}>
        <p className="whitespace-nowrap">
          {formatInt(v.current_usage, lang)} / {formatInt(v.usage_quantity, lang)}
        </p>
        <div className="mt-1.5 h-[3px] w-24 rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-primary" style={{ width: `${used * 100}%` }} />
        </div>
      </td>
      <td className={`${table.td} whitespace-nowrap`}>
        <p>{formatFullDateTime(v.start_time, lang)}</p>
        <p>{formatFullDateTime(v.end_time, lang)}</p>
      </td>
      <td className={table.td}>
        <StatusDot tone={STATE_TONE[state]}>{t(TAB_LABEL[state])}</StatusDot>
      </td>
      <td className={`${table.td} text-right whitespace-nowrap`}>
        {actions.map((a, i) => (
          <span key={i}>
            {i > 0 && (
              <span aria-hidden="true" className="mx-1.5 text-line-strong">
                |
              </span>
            )}
            {a}
          </span>
        ))}
      </td>
    </tr>
  );
}
