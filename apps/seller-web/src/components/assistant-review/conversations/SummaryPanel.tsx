'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AssistantSummary } from '@huspee/sdk';
import { Button, Spinner } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatStamp } from '../time';
import { conversationMessages } from './messages';

export type SummaryRequest = 'idle' | 'requesting' | 'waiting' | 'unavailable';

function isSummary(value: unknown): value is AssistantSummary {
  return !!value && typeof value === 'object' && ('error' in value || 'topics' in value);
}

/** The model's reading of one finished conversation, always labelled as AI inference. */
export function SummaryPanel({
  summary,
  request,
  onRequest,
}: {
  summary: unknown;
  request: SummaryRequest;
  onRequest: () => void;
}) {
  const t = useT(conversationMessages);
  const { lang } = useLang();
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const value = isSummary(summary) ? summary : null;
  const ready = value && !('error' in value) ? value : null;
  const busy = request === 'requesting' || request === 'waiting';
  return (
    <section aria-labelledby="summary-heading" className="rounded bg-white px-6 py-5 shadow-card">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h2 id="summary-heading" className="text-lg font-semibold">
          {t('summary')}
        </h2>
        <span className="text-[13px] text-muted">
          {t('aiInference')}
          {ready && ` · ${t('createdAt', { time: formatStamp(ready.created_at, lang, now) })}`}
        </span>
      </div>
      {ready ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
          <dt className="text-muted">{t('topics')}</dt>
          <dd>{ready.topics.length ? ready.topics.join('; ') : <span className="text-subtle">—</span>}</dd>
          <dt className="text-muted">{t('hesitations')}</dt>
          <dd>
            {ready.hesitations.length ? ready.hesitations.join('; ') : <span className="text-subtle">—</span>}
          </dd>
          <dt className="text-muted">{t('suggestions')}</dt>
          <dd>
            {ready.listing_suggestions.length ? (
              <ul className="flex flex-col gap-1">
                {ready.listing_suggestions.map((suggestion, index) => (
                  <li key={index}>
                    {suggestion.text}
                    {typeof suggestion.item_id === 'number' && (
                      <>
                        {' '}
                        <Link href={`/products/${suggestion.item_id}`} className="text-link hover:underline">
                          {t('openEditor')}
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-subtle">—</span>
            )}
          </dd>
        </dl>
      ) : busy ? (
        <p className="flex items-center gap-2 text-muted">
          <Spinner />
          {t('summaryPending')}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted">
            {request === 'unavailable'
              ? t('summaryUnavailable')
              : value
                ? t('summaryFailed')
                : t('summaryMissing')}
          </span>
          {request !== 'unavailable' && (
            <Button variant="outline" size="sm" className="rounded! border-line-strong!" onClick={onRequest}>
              {t('createSummary')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
