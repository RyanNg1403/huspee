'use client';
import Link from 'next/link';
import type { AssistantInsights } from '@huspee/sdk';
import { ErrorState, Skeleton } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatCount } from '@huspee/web-ui/lib/format';
import { Block, useShopStats } from '@/components/shell';
import { homeMessages, type HomeMessageKey } from './messages';
import type { Query } from './query';

type Cell = { key: HomeMessageKey; value: number; href: string };

/** Counts that need the seller's attention, each linking to where it is handled. */
export function TodoBlock({ week }: { week: Query<AssistantInsights> }) {
  const t = useT(homeMessages);
  const { lang } = useLang();
  const stats = useShopStats();
  const { summary, openTickets } = stats;
  const insights = week.data;

  let body;
  if (stats.error || week.error)
    body = (
      <ErrorState
        message={t('failed')}
        onRetry={() => {
          if (stats.error) stats.reload();
          if (week.error) week.reload();
        }}
        retryLabel={t('retry')}
      />
    );
  else if (!summary || openTickets === null || !insights) body = <Skeleton className="h-36 w-full" />;
  else {
    const byStatus = summary.order_count_by_status;
    const cells: Cell[] = [
      { key: 'todoUnpaid', value: byStatus.UNPAID ?? 0, href: '/orders?status=UNPAID' },
      { key: 'todoToShip', value: byStatus.READY_TO_SHIP ?? 0, href: '/orders?status=READY_TO_SHIP' },
      { key: 'todoProcessed', value: byStatus.PROCESSED ?? 0, href: '/orders?status=PROCESSED' },
      { key: 'todoInCancel', value: byStatus.IN_CANCEL ?? 0, href: '/orders?status=IN_CANCEL' },
      { key: 'todoReturns', value: summary.open_return_count, href: '/returns' },
      { key: 'todoLowStock', value: summary.low_stock_models.length, href: '/products' },
      { key: 'todoQuestions', value: openTickets, href: '/inbox' },
      { key: 'todoUnanswered', value: (insights.unanswered_groups ?? []).reduce((sum, group) => sum + group.count, 0), href: '/assistant/insights' },
    ];
    body = (
      <ul className="grid grid-cols-2 gap-y-2 text-center sm:grid-cols-4">
        {cells.map((cell, i) => (
          <li key={cell.key} className={i % 4 === 0 ? '' : 'sm:border-l sm:border-[#f0f0f0]'}>
            <Link
              href={cell.href}
              className="block rounded px-2 py-2.5 hover:bg-gray-50"
              data-todo={cell.key}
            >
              <span
                className={`block text-xl ${cell.value ? 'font-semibold text-ink' : 'font-medium text-subtle'}`}
              >
                {formatCount(cell.value, lang)}
              </span>
              <span className="text-[13px] text-muted">{t(cell.key)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return <Block title={t('todo')}>{body}</Block>;
}
