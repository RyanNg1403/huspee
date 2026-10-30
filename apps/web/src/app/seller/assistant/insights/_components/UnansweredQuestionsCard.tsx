'use client';

import Link from 'next/link';
import { Badge, Card, EmptyState } from '@/components/ui';
import { useLang, useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { assistantMessages } from '../../messages';
import { UsersIcon, ZapIcon } from './icons';

interface UnansweredQuestion {
  conversation_id: string;
  question: string;
  tool: string;
  created_at: number;
}

export function UnansweredQuestionsCard({ questions }: { questions: UnansweredQuestion[] }) {
  const t = useT(assistantMessages);
  const { lang } = useLang();

  return (
    <Card className="flex flex-col h-full p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">{t('unansweredTitle')}</h2>
            <Badge tone="neutral">{t('verifiedLogsBadge')}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{t('unansweredDesc')}</p>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="py-8">
          <EmptyState title={t('noUnansweredQuestions')} />
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-y-auto max-h-[360px]">
          {questions.map((q, i) => (
            <li
              key={`${q.conversation_id}-${q.created_at}-${i}`}
              className="py-3 hover:bg-gray-50/50 px-2 rounded-lg transition-colors space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-900 leading-snug">
                  {q.question || <span className="text-gray-400 italic">{t('noQuestionContent')}</span>}
                </p>
                <Link
                  href={`/seller/assistant/conversations/${encodeURIComponent(q.conversation_id)}`}
                  className="shrink-0 text-[11px] font-medium text-primary hover:underline"
                >
                  {t('conversationLink')} →
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                {q.tool === 'handoff_to_seller' ? (
                  <span className="inline-flex items-center gap-1 font-mono bg-amber-50 text-amber-800 border border-amber-200/60 px-1.5 py-0.5 rounded">
                    <UsersIcon className="h-3 w-3 shrink-0" />
                    <span>{t('handoffBadge')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                    <ZapIcon className="h-3 w-3 shrink-0 text-amber-500" />
                    <span>{q.tool}</span>
                  </span>
                )}
                <span>•</span>
                <span>{formatDateTime(q.created_at, lang)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
