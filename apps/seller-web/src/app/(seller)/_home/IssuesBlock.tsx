'use client';
import Link from 'next/link';
import type { AssistantInsights } from '@huspee/sdk';
import { ErrorState, Skeleton } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatCount } from '@huspee/web-ui/lib/format';
import { Block, tableClass, tbodyClass, tdClass, thClass } from '@/components/shell';
import { conversationIssues, type Issue, type IssueKind } from './aggregate';
import { homeMessages, type HomeMessageKey } from './messages';
import type { Query } from './query';

const KIND: Record<IssueKind, { label: HomeMessageKey; action: HomeMessageKey }> = {
  missing: { label: 'issueMissing', action: 'actionConversation' },
  handoff: { label: 'issueHandoff', action: 'actionInbox' },
  unanswered: { label: 'issueUnanswered', action: 'actionFaq' },
  popular: { label: 'issuePopular', action: 'actionProduct' },
};

function actionHref(issue: Issue): string {
  if (issue.kind === 'popular') return `/products/${issue.itemId}`;
  if (issue.kind === 'handoff') return '/inbox';
  if (issue.kind === 'unanswered') return '/assistant/faqs';
  return `/assistant/conversations/${encodeURIComponent(issue.conversationId ?? '')}`;
}

/** What buyers asked the assistant this week that the shop can act on. */
export function IssuesBlock({ week }: { week: Query<AssistantInsights> }) {
  const t = useT(homeMessages);
  const { lang } = useLang();
  const issues = week.data ? conversationIssues(week.data) : [];
  return (
    <Block
      title={t('issues')}
      note={t('lastWeek')}
      action={
        <Link href="/assistant/insights" className="text-link hover:underline">
          {t('viewInsights')}
        </Link>
      }
    >
      {week.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : week.error || !week.data ? (
        <ErrorState message={t('failed')} onRetry={week.reload} retryLabel={t('retry')} />
      ) : !issues.length ? (
        <p className="py-6 text-center text-muted">{t('noIssues')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  {t('issue')}
                </th>
                <th scope="col" className={thClass}>
                  {t('detail')}
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  {t('asks')}
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  {t('action')}
                </th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {issues.map((issue) => (
                <tr key={`${issue.kind}-${issue.itemId ?? issue.text}`}>
                  <td className={`${tdClass} whitespace-nowrap`}>{t(KIND[issue.kind].label)}</td>
                  <td className={`${tdClass} max-w-[360px]`}>
                    <span className="line-clamp-2">{issue.text}</span>
                  </td>
                  <td className={`${tdClass} text-right`}>{formatCount(issue.count, lang)}</td>
                  <td className={`${tdClass} text-right whitespace-nowrap`}>
                    <Link href={actionHref(issue)} className="text-link hover:underline">
                      {t(KIND[issue.kind].action)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Block>
  );
}
