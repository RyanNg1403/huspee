'use client';
import { useState } from 'react';
import { ErrorState, Skeleton } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatCount, formatVnd } from '@huspee/web-ui/lib/format';
import { Block } from '@/components/shell';
import { compare, cumulativeByHour, salesPoints, type Comparison, type TimedValue } from './aggregate';
import type { SalesData } from './api';
import { homeMessages } from './messages';
import type { Query } from './query';
import { SalesChart, type ChartSeries } from './SalesChart';

type Metric = 'revenue' | 'orders' | 'chats';
type MetricView = { series: ChartSeries; value: number; comparison: Comparison };

function Delta({ comparison, format }: { comparison: Comparison; format: (n: number) => string }) {
  const t = useT(homeMessages);
  const { lang } = useLang();
  if (comparison.direction === 'same') return <>{t('sameAsYesterday')}</>;
  const up = comparison.direction === 'up';
  const amount =
    comparison.percent === null
      ? format(Math.abs(comparison.diff))
      : `${new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(Math.abs(comparison.percent))}%`;
  return (
    <>
      <span aria-hidden="true">{up ? '▲' : '▼'} </span>
      <span className="sr-only">{t(up ? 'up' : 'down')} </span>
      {amount}
      <span className="sr-only"> {t('vsYesterday')}</span>
    </>
  );
}

function useMetrics(data: SalesData): Record<Metric, MetricView> {
  const t = useT(homeMessages);
  const { lang } = useLang();
  const { now, todayStart, yesterdayStart } = data;
  const hoursToday = Math.floor((now - todayStart) / 3600) + 1;
  const sameTimeYesterday = now - 86400;
  const view = (
    label: string,
    points: TimedValue[],
    value: number,
    previous: number,
    integer: boolean,
    format: (n: number) => string,
    axis: (n: number) => string,
  ): MetricView => ({
    series: {
      label,
      today: cumulativeByHour(points, todayStart, hoursToday),
      yesterday: cumulativeByHour(points, yesterdayStart, 24),
      integer,
      format,
      axis,
    },
    value,
    comparison: compare(value, previous),
  });
  const sales = salesPoints(data.orders);
  const chats = data.conversations.map((c) => ({ time: c.started_at, value: 1 }));
  const count = (n: number) => formatCount(n, lang);
  return {
    revenue: view(
      t('revenue'),
      sales.revenue,
      data.today.total_revenue,
      data.yesterday.total_revenue,
      false,
      formatVnd,
      count,
    ),
    orders: view(
      t('orders'),
      sales.orders,
      data.today.order_count,
      data.yesterday.order_count,
      true,
      (n) => t(n === 1 ? 'orderUnit' : 'ordersUnit', { count: count(n) }),
      count,
    ),
    chats: view(
      t('chats'),
      chats,
      chats.filter((c) => c.time >= todayStart).length,
      chats.filter((c) => c.time >= yesterdayStart && c.time <= sameTimeYesterday).length,
      true,
      (n) => t(n === 1 ? 'chatUnit' : 'chatsUnit', { count: count(n) }),
      count,
    ),
  };
}

function SalesContent({ data }: { data: SalesData }) {
  const t = useT(homeMessages);
  const { lang } = useLang();
  const [metric, setMetric] = useState<Metric>('revenue');
  const metrics = useMetrics(data);
  const value = (key: Metric, n: number) => (key === 'revenue' ? formatVnd(n) : formatCount(n, lang));
  return (
    <div className="flex flex-wrap gap-6">
      <SalesChart series={metrics[metric].series} />
      <div role="group" aria-label={t('metrics')} className="flex flex-[1_1_200px] flex-col">
        {(Object.keys(metrics) as Metric[]).map((key) => {
          const m = metrics[key];
          const on = key === metric;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => setMetric(key)}
              className={`flex flex-col gap-0.5 border-l-2 px-3.5 py-2.5 text-left ${
                on ? 'border-primary bg-[#fff7f4]' : 'border-transparent hover:bg-gray-50'
              }`}
            >
              <span className="text-[13px] text-muted">{m.series.label}</span>
              <span className="text-lg font-semibold">{value(key, m.value)}</span>
              <span className="text-xs text-muted">
                <Delta comparison={m.comparison} format={m.series.format} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Today's sales, orders and assistant conversations, by hour, against yesterday. */
export function SalesBlock({ sales }: { sales: Query<SalesData> }) {
  const t = useT(homeMessages);
  const { lang } = useLang();
  const time = sales.data
    ? new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(sales.data.now * 1000)
    : null;
  return (
    <Block title={t('sales')} note={time && t('salesUntil', { time })}>
      {sales.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : sales.error || !sales.data ? (
        <ErrorState message={t('failed')} onRetry={sales.reload} retryLabel={t('retry')} />
      ) : (
        <SalesContent data={sales.data} />
      )}
    </Block>
  );
}
