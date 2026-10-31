'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import type { AssistantConversationDetail } from '@huspee/sdk';
import { ErrorState, Spinner, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient } from '@huspee/web-ui/lib/api';
import { formatDate } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { conversationOverview, toolEntries, transcriptEntries } from '../conversation-log';
import { StatusDot } from '../StatusDot';
import { formatClock, minutesBetween } from '../time';
import { OutcomeText } from './describe';
import { Lookups } from './Lookups';
import { conversationMessages } from './messages';
import { SummaryPanel, type SummaryRequest } from './SummaryPanel';
import { Transcript } from './Transcript';

const POLL_MS = 3000;
const MAX_POLLS = 20;

export function ConversationDetail({ shopId, conversationId }: { shopId: number; conversationId: string }) {
  const t = useT(conversationMessages);
  const commonT = useT(common);
  const toast = useToast();
  const detail = useApi(
    () => getApiClient().seller.assistant.conversations.get(shopId, conversationId),
    [shopId, conversationId],
  );
  const [request, setRequest] = useState<SummaryRequest>('idle');
  const [baseline, setBaseline] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);
  const summaryKey = JSON.stringify(detail.data?.summary ?? null);
  // A requested summary is written in the background; reload until it changes.
  const waiting = request === 'waiting' && summaryKey === baseline && polls < MAX_POLLS;
  const { reload } = detail;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => {
      setPolls((count) => count + 1);
      reload();
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [waiting, polls, reload]);

  async function requestSummary() {
    setRequest('requesting');
    try {
      const { scheduled } = await getApiClient().seller.assistant.summarize(shopId, conversationId);
      if (!scheduled) return setRequest('unavailable');
      setBaseline(summaryKey);
      setPolls(0);
      setRequest('waiting');
    } catch (error) {
      const key = errorMessageKey(error);
      toast(key === 'unknown' ? t('summaryFailed') : commonT(key));
      setRequest('idle');
    }
  }

  if (!detail.data && detail.loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  if (!detail.data) {
    const missing = errorMessageKey(detail.error) === 'not_found';
    return (
      <ErrorState
        message={missing ? commonT('not_found') : t('loadFailed')}
        onRetry={missing ? undefined : detail.reload}
        retryLabel={t('retry')}
      />
    );
  }
  return (
    <ConversationView
      conversation={detail.data}
      summary={
        detail.data.status === 'ENDED' ? (
          <SummaryPanel
            summary={detail.data.summary}
            request={waiting ? 'waiting' : request === 'waiting' ? 'idle' : request}
            onRequest={() => void requestSummary()}
          />
        ) : null
      }
    />
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Duration({ start, end }: { start: number; end: number }) {
  const t = useT(conversationMessages);
  const { lang } = useLang();
  const minutes = minutesBetween(start, end);
  const range = { from: formatClock(start, lang), to: formatClock(end, lang) };
  return <>{minutes ? t('duration', { minutes, ...range }) : t('durationShort', range)}</>;
}

function ConversationView({
  conversation,
  summary,
}: {
  conversation: AssistantConversationDetail;
  summary: ReactNode;
}) {
  const t = useT(conversationMessages);
  const { lang } = useLang();
  const overview = conversationOverview(conversation);
  const started = formatClock(conversation.started_at, lang);
  const title = `${started} · ${formatDate(conversation.started_at, lang)}`;
  const language =
    conversation.language === 'vi' ? t('langVi') : conversation.language === 'en' ? t('langEn') : null;
  const channel = conversation.channel === 'VOICE' ? t('channelVoice') : t('channelText');
  const { outcome } = overview;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <nav aria-label={t('breadcrumb')} className="mb-1 text-[13px] text-muted">
          <Link href="/assistant/conversations" className="text-link hover:underline">
            {t('title')}
          </Link>{' '}
          <span aria-hidden="true">›</span> {title}
        </nav>
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>

      <section aria-label={t('sessionLabel')} className="rounded bg-white px-6 py-4 shadow-card">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          <Meta label={t('metaChannel')}>{language ? `${channel} · ${language}` : channel}</Meta>
          <Meta label={t('metaDuration')}>
            {conversation.ended_at ? (
              <Duration start={conversation.started_at} end={conversation.ended_at} />
            ) : (
              t('durationLive', { from: started })
            )}
          </Meta>
          <Meta label={t('metaTurns')}>{overview.turns}</Meta>
          <Meta label={t('metaOutcome')}>
            <OutcomeText outcome={outcome} />
            {outcome.kind === 'handoff' && (
              <>
                {' · '}
                <Link href={`/inbox/${outcome.ticketId}`} className="text-link hover:underline">
                  {t('openInbox')}
                </Link>
              </>
            )}
          </Meta>
          <Meta label={t('metaStatus')}>
            {conversation.status === 'ACTIVE' ? (
              <StatusDot tone="success">{t('statusActive')}</StatusDot>
            ) : (
              <StatusDot tone="neutral">{t('statusEnded')}</StatusDot>
            )}
          </Meta>
        </dl>
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <section
          aria-labelledby="transcript-heading"
          className="min-w-0 flex-[3_1_480px] rounded bg-white px-6 py-5 shadow-card"
        >
          <h2 id="transcript-heading" className="mb-2 text-lg font-semibold">
            {t('transcript')}
          </h2>
          <Transcript entries={transcriptEntries(conversation)} />
        </section>
        <section
          aria-labelledby="lookups-heading"
          className="min-w-0 flex-[2_1_340px] rounded bg-white px-6 py-5 shadow-card"
        >
          <h2 id="lookups-heading" className="mb-1 text-lg font-semibold">
            {t('lookups')}
          </h2>
          <Lookups entries={toolEntries(conversation.tool_calls)} />
        </section>
      </div>

      {summary}
    </div>
  );
}
