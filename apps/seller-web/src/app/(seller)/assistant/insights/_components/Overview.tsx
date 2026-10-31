'use client';

import Link from 'next/link';
import type { AssistantInsights } from '@huspee/sdk';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { formatShortDateTime } from '@/components/commerce/format';
import { Block, tableClass, tbodyClass, tdClass, thClass, useShopStats } from '@/components/shell';
import { assistantMessages } from '../../messages';

const FUNNEL = [
  ['conversations', 'funnelConversations'],
  ['asked_product', 'funnelAsked'],
  ['quoted', 'funnelQuoted'],
  ['cart_confirmed', 'funnelCart'],
  ['ordered', 'funnelOrdered'],
] as const;

/** Share of conversations, 0–100; 0 when there were no conversations. */
export function percentOf(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

export function InsightsOverview({ insights }: { insights: AssistantInsights }) {
  const t = useT(assistantMessages);
  const { lang } = useLang();
  const { openTickets } = useShopStats();
  const groups = insights.unanswered_groups ?? [];
  const unanswered = groups.reduce((sum, g) => sum + g.count, 0);
  const funnel = insights.funnel;
  const kpis = [
    { label: t('kpiConversations'), value: insights.totals.conversations, sub: null },
    { label: t('buyer'), value: insights.unique_buyers, sub: null },
    { label: t('kpiOrdersPlaced'), value: insights.totals.orders_placed, sub: formatVnd(insights.orders_revenue) },
    {
      label: t('kpiHandoffs'),
      value: insights.totals.handoffs,
      sub:
        openTickets !== null ? (
          <Link href="/inbox" className="text-link hover:underline">
            {t('waitingTickets', { count: openTickets })}
          </Link>
        ) : null,
    },
    {
      label: t('unansweredTitle'),
      value: unanswered,
      sub: <a href="#unanswered" className="text-link hover:underline">{t('groupedInto', { count: groups.length })}</a>,
    },
  ];

  return (
    <>
      <section className="grid grid-cols-2 gap-y-4 rounded bg-white py-[18px] shadow-card md:grid-cols-5">
        {kpis.map((k, i) => (
          <div key={k.label} className={`px-6 ${i ? 'md:border-l md:border-[#f0f0f0]' : ''}`}>
            <div className="text-[13px] text-muted">{k.label}</div>
            <div className="text-[22px] font-semibold">{k.value.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB')}</div>
            {k.sub && <div className="text-[13px] text-muted">{k.sub}</div>}
          </div>
        ))}
      </section>

      {funnel && (
        <Block title={t('funnelTitle')}>
          <div className="flex flex-col gap-3">
            {FUNNEL.map(([key, label]) => {
              const pct = percentOf(funnel[key], funnel.conversations);
              return (
                <div key={key} className="grid grid-cols-[150px_minmax(0,1fr)_92px] items-center gap-3 text-sm">
                  <span>{t(label)}</span>
                  <span className="block h-[18px] bg-[#f5f5f5]">
                    <span className="block h-[18px] rounded-r bg-primary" style={{ width: `${pct.toFixed(1)}%` }} />
                  </span>
                  <span className="text-right">
                    {funnel[key]} <span className="text-muted">· {Math.round(pct)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Block>
      )}

      <div id="unanswered">
        <Block title={t('unansweredTitle')} note={t('unansweredNote', { count: unanswered, groups: groups.length })}>
          {groups.length === 0 ? (
            <p className="text-sm text-muted">{t('noUnansweredQuestions')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={`${tableClass} text-sm`}>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>{t('question')}</th>
                    <th scope="col" className={`${thClass} text-right`}>{t('asks')}</th>
                    <th scope="col" className={`${thClass} text-right`}>{t('buyer')}</th>
                    <th scope="col" className={thClass}>{t('latest')}</th>
                    <th scope="col" className={`${thClass} text-right`}>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className={tbodyClass}>
                  {groups.map((g) => (
                    <tr key={`${g.question}-${g.last_at}`}>
                      <td className={tdClass}>“{g.question}”</td>
                      <td className={`${tdClass} text-right`}>{g.count}</td>
                      <td className={`${tdClass} text-right`}>{g.buyers}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>{formatShortDateTime(g.last_at, lang)}</td>
                      <td className={`${tdClass} text-right whitespace-nowrap`}>
                        {g.conversation_ids[0] && (
                          <Link
                            href={`/assistant/conversations/${encodeURIComponent(g.conversation_ids[0])}`}
                            className="text-link hover:underline"
                          >
                            {t('conversationLink')}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Block>
      </div>
    </>
  );
}
