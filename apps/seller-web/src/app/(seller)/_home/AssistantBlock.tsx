'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ErrorState, Skeleton } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatCount } from '@huspee/web-ui/lib/format';
import { Block, StatusDot, useShopStats } from '@/components/shell';
import type { AssistantData } from './api';
import { homeMessages } from './messages';
import type { Query } from './query';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The shop's assistant: on/off, voice and today's activity. */
export function AssistantBlock({ assistant }: { assistant: Query<AssistantData> }) {
  const t = useT(homeMessages);
  const { lang } = useLang();
  const { openTickets } = useShopStats();
  const data = assistant.data;
  return (
    <Block
      size="sm"
      title={t('assistant')}
      action={
        data && (
          <span className="text-[13px]">
            <StatusDot tone={data.config.enabled ? 'success' : 'neutral'} size="md">
              {t(data.config.enabled ? 'assistantOn' : 'assistantOff')}
            </StatusDot>
          </span>
        )
      }
    >
      {assistant.loading ? (
        <Skeleton className="h-36 w-full" />
      ) : assistant.error || !data ? (
        <ErrorState message={t('failed')} onRetry={assistant.reload} retryLabel={t('retry')} />
      ) : (
        <>
          <dl className="flex flex-col gap-2.5">
            <Row label={t('chatsToday')}>
              <span className="font-semibold">{formatCount(data.today.conversations, lang)}</span>
            </Row>
            <Row label={t('assistantOrdersToday')}>
              <span className="font-semibold">{formatCount(data.today.orders_placed, lang)}</span>
            </Row>
            <Row label={t('waitingReply')}>
              {openTickets === null ? (
                '—'
              ) : (
                <Link href="/inbox" className="font-semibold text-link hover:underline">
                  {formatCount(openTickets, lang)}
                </Link>
              )}
            </Row>
            <Row label={t('voice')}>
              <span className="capitalize">{data.config.voice}</span>
            </Row>
          </dl>
          <Link
            href="/assistant"
            className="mt-4 flex h-9 items-center justify-center rounded border border-[#d9d9d9] hover:bg-gray-50"
          >
            {t('settings')}
          </Link>
        </>
      )}
    </Block>
  );
}
