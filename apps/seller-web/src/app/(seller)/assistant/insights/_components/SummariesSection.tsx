'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AssistantSummary } from '@huspee/sdk';
import { Badge, Button, Card, EmptyState, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatDateTime } from '@huspee/web-ui/lib/format';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { assistantMessages } from '../../messages';
import { PackageIcon, SparklesIcon } from './icons';

interface SummaryItem {
  conversation_id: string;
  source: 'model';
  summary: AssistantSummary;
}

export function SummariesSection({
  shopId,
  summaries,
  onReload,
}: {
  shopId: number;
  summaries: SummaryItem[];
  onReload: () => void;
}) {
  const t = useT(assistantMessages);

  return (
    <Card className="p-5 space-y-4 border-indigo-100 bg-linear-to-b from-indigo-50/20 to-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
              <SparklesIcon className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-gray-900">{t('summariesTitle')}</h2>
            <Badge tone="info">{t('aiSummaryBadge')}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{t('summariesDesc')}</p>
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="py-8">
          <EmptyState title={t('noSummaries')} />
        </div>
      ) : (
        <div className="space-y-4">
          {summaries.map((item) => (
            <SummaryItemCard key={item.conversation_id} item={item} shopId={shopId} onReload={onReload} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SummaryItemCard({
  item,
  shopId,
  onReload,
}: {
  item: SummaryItem;
  shopId: number;
  onReload: () => void;
}) {
  const t = useT(assistantMessages);
  const { lang } = useLang();
  const toast = useToast();
  const [resummarizing, setResummarizing] = useState(false);

  async function handleResummarize() {
    setResummarizing(true);
    try {
      const res = await getApiClient().seller.assistant.summarize(shopId, item.conversation_id);
      if (res.scheduled) {
        toast(t('resummarizeSuccess'));
        setTimeout(() => {
          onReload();
        }, 1500);
      } else {
        toast(t('resummarizeFailed'));
      }
    } catch {
      toast(t('resummarizeFailed'));
    } finally {
      setResummarizing(false);
    }
  }

  const summary = item.summary;
  const isError = 'error' in summary;

  return (
    <div className="rounded-lg border border-indigo-100/80 bg-white p-4 shadow-2xs space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-gray-800">
            {item.conversation_id.slice(0, 8)}...
          </span>
          <Link
            href={`/assistant/conversations/${encodeURIComponent(item.conversation_id)}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('conversationLink')} →
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {!isError && (
            <span className="text-[11px] text-gray-400">
              {t('modelAttribution', { model: summary.model })}
              {typeof summary.created_at === 'number' ? ` • ${formatDateTime(summary.created_at, lang)}` : ''}
            </span>
          )}

          <Button variant="outline" size="sm" onClick={handleResummarize} disabled={resummarizing}>
            {resummarizing ? t('resummarizing') : t('resummarize')}
          </Button>
        </div>
      </div>

      {/* Content */}
      {isError ? (
        <p className="text-xs text-amber-700">
          {t('summaryFailed')}: {summary.error}
        </p>
      ) : (
        <div className="grid gap-4 text-xs sm:grid-cols-3">
          {/* Topics */}
          <div className="space-y-1">
            <span className="font-semibold uppercase tracking-wider text-indigo-900">{t('topicsLabel')}</span>
            {summary.topics.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {summary.topics.map((tp, idx) => (
                  <span
                    key={idx}
                    className="rounded-lg bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-100/60"
                  >
                    {tp}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">{t('summaryEmptyTopics')}</p>
            )}
          </div>

          {/* Hesitations */}
          <div className="space-y-1">
            <span className="font-semibold uppercase tracking-wider text-amber-900">
              {t('hesitationsLabel')}
            </span>
            {summary.hesitations.length > 0 ? (
              <ul className="list-disc list-inside space-y-1 pt-1 text-gray-700">
                {summary.hesitations.map((h, idx) => (
                  <li key={idx}>{h}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">{t('summaryEmptyHesitations')}</p>
            )}
          </div>

          {/* Suggestions */}
          <div className="space-y-1">
            <span className="font-semibold uppercase tracking-wider text-emerald-900">
              {t('suggestionsLabel')}
            </span>
            {summary.listing_suggestions.length > 0 ? (
              <ul className="space-y-1.5 pt-1 text-gray-700">
                {summary.listing_suggestions.map((s, idx) => (
                  <li key={idx} className="flex items-start gap-1">
                    <span className="text-emerald-600">•</span>
                    <span>
                      {s.text}
                      {typeof s.item_id === 'number' && (
                        <Link
                          href={`/products/${s.item_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1.5 inline-flex items-center gap-1 text-primary font-medium hover:underline"
                        >
                          <PackageIcon className="h-3.5 w-3.5 shrink-0" />
                          <span>{t('itemLink', { id: s.item_id })}</span>
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">{t('summaryEmptySuggestions')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
