'use client';

import Image from 'next/image';
import { useCallback } from 'react';
import { EvidenceImage } from '@huspee/web-ui/components/refunds/EvidenceImage';
import { messages as evidenceMessages } from '@huspee/web-ui/components/refunds/messages';
import { getApiClient } from '@huspee/web-ui/lib/api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmptyState } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { Breadcrumb } from '@/components/commerce/Breadcrumb';
import { formatDay, formatFullDateTime, formatShortDateTime } from '@/components/commerce/format';
import { ListState } from '@/components/commerce/ListState';
import { Facts, Panel } from '@/components/commerce/Panel';
import { ReturnActions } from '@/components/commerce/returns/ReturnActions';
import { loadReturn } from '@/components/commerce/returns/return-api';
import { needsSellerAction } from '@/components/commerce/returns/return-filters';
import { ReturnStatusLabel, useReturnReason } from '@/components/commerce/returns/ReturnStatusLabel';
import { SOLUTION_REFUND_ONLY, type ReturnDetail } from '@/components/commerce/returns/types';
import { ShopGuard } from '@/components/commerce/ShopGuard';
import { Thumb } from '@/components/commerce/Thumb';
import { sub, table } from '@/components/commerce/ui';
import { returnMessages } from '../messages';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadReturn>>>;

export default function ReturnDetailPage() {
  const returnSn = String(useParams().returnSn);
  return <ShopGuard>{(shop) => <ReturnView shopId={shop.shop_id} returnSn={returnSn} />}</ShopGuard>;
}

function ReturnView({ shopId, returnSn }: { shopId: number; returnSn: string }) {
  const t = useT(returnMessages);
  const { lang } = useLang();
  const data = useApi(() => loadReturn(shopId, returnSn), [shopId, returnSn]);
  const ret = data.data?.detail;

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: t('title'), href: '/returns' }, { label: returnSn }]} />
      <ListState
        loading={data.loading}
        error={data.error}
        empty={false}
        emptyTitle={t('notFound')}
        onRetry={data.reload}
      >
        {data.data && ret ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <h1 className="text-xl font-semibold">{t('returnTitle', { sn: returnSn })}</h1>
              <span className="flex items-center gap-1.5">
                <ReturnStatusLabel status={ret.status} negotiation={ret.negotiation.negotiation_status} />
                {needsSellerAction({
                  status: ret.status,
                  negotiation_status: ret.negotiation.negotiation_status,
                }) && <span>· {t('dueAt', { date: formatShortDateTime(ret.due_date, lang) })}</span>}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18.75rem]">
              <div className="min-w-0 space-y-4">
                <RequestPanel ret={ret} shopId={shopId} />
                <ItemsPanel ret={ret} />
                <OrderPanel data={data.data} />
              </div>
              <div className="space-y-4 self-start">
                <ReturnActions
                  shopId={shopId}
                  ret={ret}
                  solutions={data.data.solutions}
                  onChanged={data.reload}
                />
                <HistoryPanel data={data.data} />
              </div>
            </div>
          </>
        ) : (
          <EmptyState title={t('notFound')} />
        )}
      </ListState>
    </div>
  );
}

function RequestPanel({ ret, shopId }: { ret: ReturnDetail; shopId: number }) {
  const t = useT(returnMessages);
  const { lang } = useLang();
  const reason = useReturnReason();
  return (
    <Panel title={t('buyerRequest')}>
      <Facts
        rows={[
          { label: t('buyer'), value: ret.user.username },
          { label: t('sentAt'), value: formatFullDateTime(ret.create_time, lang) },
          { label: t('reason'), value: reason(ret.reason) },
          {
            label: t('solution'),
            value:
              ret.return_solution === SOLUTION_REFUND_ONLY ? t('solutionRefund') : t('solutionReturnRefund'),
          },
          ...(ret.text_reason ? [{ label: t('description'), value: ret.text_reason }] : []),
          ...(ret.image.length
            ? [
                {
                  label: t('photos'),
                  value: (
                    <div className="flex flex-wrap gap-2">
                      {ret.image.map((src) => (
                        <a key={src} href={src} target="_blank" rel="noreferrer">
                          <Image
                            src={src}
                            alt={t('photos')}
                            width={96}
                            height={96}
                            unoptimized
                            className="h-24 w-24 rounded-[2px] object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      <PrivateEvidence shopId={shopId} returnSn={ret.return_sn} />
    </Panel>
  );
}

function ItemsPanel({ ret }: { ret: ReturnDetail }) {
  const t = useT(returnMessages);
  return (
    <Panel title={t('items')}>
      <div className="overflow-x-auto">
        <table className={table.root}>
          <thead>
            <tr>
              <th scope="col" className={table.th}>
                {t('product')}
              </th>
              <th scope="col" className={`${table.th} text-right`}>
                {t('unitPrice')}
              </th>
              <th scope="col" className={`${table.th} text-right`}>
                {t('returnQty')}
              </th>
              <th scope="col" className={`${table.th} text-right`}>
                {t('lineRefund')}
              </th>
            </tr>
          </thead>
          <tbody>
            {ret.item.map((i) => (
              <tr key={`${i.item_id}-${i.model_id}`}>
                <td className={table.td}>
                  <div className="flex items-center gap-3">
                    <Thumb src={i.images[0]} size={48} />
                    <div>
                      <p>{i.name}</p>
                      {(i.variation_sku || i.item_sku) && (
                        <p className={sub}>SKU {i.variation_sku || i.item_sku}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className={`${table.td} text-right whitespace-nowrap`}>{formatVnd(i.item_price)}</td>
                <td className={`${table.td} text-right`}>{i.amount}</td>
                <td className={`${table.td} text-right whitespace-nowrap`}>
                  {i.refund_amount !== undefined ? formatVnd(i.refund_amount) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-baseline justify-end gap-6 pt-4">
        <span className="text-muted">{t('refundSimulated')}</span>
        <span className="text-lg font-semibold text-primary">{formatVnd(ret.refund_amount)}</span>
      </div>
    </Panel>
  );
}

function OrderPanel({ data }: { data: Loaded }) {
  const t = useT(returnMessages);
  const { lang } = useLang();
  const { detail, deliveredAt, policy } = data;
  return (
    <Panel
      title={t('originalOrder')}
      aside={
        <Link href={`/orders/${detail.order_sn}`} className="text-sm text-link hover:underline">
          {t('viewOrder')}
        </Link>
      }
    >
      <Facts
        rows={[
          { label: t('orderSn'), value: detail.order_sn },
          ...(deliveredAt ? [{ label: t('deliveredAt'), value: formatDay(deliveredAt, lang) }] : []),
          { label: t('returnWindow'), value: t('days', { count: policy.return_window_days }) },
          { label: t('shopPolicy'), value: policy.return_policy },
        ]}
      />
    </Panel>
  );
}

function HistoryPanel({ data }: { data: Loaded }) {
  const t = useT(returnMessages);
  const { lang } = useLang();
  const { detail, reverseEvents, deliveredAt } = data;
  const negotiation = detail.negotiation.negotiation_status;
  const statusEvent =
    detail.status === 'ACCEPTED'
      ? t('evAccepted')
      : detail.status === 'JUDGING'
        ? t('evJudging')
        : detail.status === 'CANCELLED'
          ? t('evCancelled')
          : detail.status === 'CLOSED'
            ? t('evClosed')
            : negotiation === 'PENDING_BUYER_RESPOND'
              ? t('evOffer')
              : null;
  const events = [
    ...reverseEvents.map((e) => ({ time: e.update_time, text: e.tracking_description })),
    ...(statusEvent ? [{ time: detail.update_time, text: statusEvent }] : []),
    { time: detail.create_time, text: t('evCreated') },
    ...(deliveredAt ? [{ time: deliveredAt, text: t('evDelivered', { sn: detail.order_sn }) }] : []),
  ].sort((a, b) => b.time - a.time);
  return (
    <Panel title={t('history')}>
      <ol className="space-y-3 text-sm">
        {events.map((e, i) => (
          <li key={`${e.time}-${i}`} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i === 0 ? 'bg-primary' : 'bg-gray-300'}`}
            />
            <div>
              <p>{e.text}</p>
              <p className={sub}>{formatShortDateTime(e.time, lang)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function PrivateEvidence({ shopId, returnSn }: { shopId: number; returnSn: string }) {
  const t = useT(evidenceMessages);
  const photos = useApi(
    () => getApiClient().seller.returnEvidence.list(shopId, returnSn),
    [shopId, returnSn],
  );
  const fetchContent = useCallback(
    (id: string) => getApiClient().seller.returnEvidence.content(shopId, returnSn, id),
    [shopId, returnSn],
  );
  if (!photos.loading && !photos.error && !photos.data?.length) return null;
  return (
    <section aria-label={t('title')} className="mt-3 space-y-2 border-t border-line-soft pt-3">
      <p className="text-xs text-muted">{t('review')}</p>
      {photos.loading && <p role="status">{t('loading')}</p>}
      {photos.error != null && (
        <p role="alert">
          {t('error')}{' '}
          <button type="button" onClick={photos.reload} className="text-primary underline">
            {t('retry')}
          </button>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {photos.data?.map((photo, index) => (
          <EvidenceImage
            key={photo.evidence_id}
            evidenceId={photo.evidence_id}
            number={index + 1}
            fetchContent={fetchContent}
          />
        ))}
      </div>
    </section>
  );
}
