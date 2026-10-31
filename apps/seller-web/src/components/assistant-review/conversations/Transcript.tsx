'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AssistantCard } from '@huspee/web-ui/components/assistant/cards';
import type { Card } from '@huspee/web-ui/components/assistant/card-types';
import { useLang, useT } from '@huspee/web-ui/i18n';
import type { SpeechFlag, TranscriptEntry } from '../conversation-log';
import { formatClock } from '../time';
import { useToolLabel } from './describe';
import { conversationMessages } from './messages';

const readOnly = {
  pending: true,
  onAction: () => undefined,
  getOptions: () => Promise.reject(new Error('Read-only conversation')),
  onEdit: async () => undefined,
};

/** The card exactly as the buyer saw it; buttons of a past confirmation card are not the seller's to press. */
function BuyerCard({ card, tool }: { card: Card; tool: string }) {
  const t = useT(conversationMessages);
  const label = useToolLabel();
  if (card.kind === 'handoff')
    return (
      <p>
        {t('handoffCard')} ·{' '}
        <Link href={`/inbox/${card.ticket_id}`} className="text-link hover:underline">
          {t('openInbox')}
        </Link>
      </p>
    );
  const view = (
    <div className={`max-w-[400px] ${card.kind === 'action' ? '[&_button]:hidden' : ''}`}>
      <AssistantCard card={card} {...readOnly} />
    </div>
  );
  if (card.kind !== 'product') return view;
  return (
    <details>
      <summary className="cursor-pointer text-link">
        {label(tool)} · {card.name}
      </summary>
      <div className="mt-2">{view}</div>
    </details>
  );
}

function Flag({ flag }: { flag: SpeechFlag }) {
  const t = useT(conversationMessages);
  const facts = flag.unsupported.join(', ');
  const text =
    flag.kind === 'corrected'
      ? facts
        ? t('corrected', { facts })
        : t('correctedPlain')
      : facts
        ? t('blocked', { facts })
        : t('blockedPlain');
  return <span className="mt-0.5 block text-[13px] text-warning">{text}</span>;
}

function Row({ time, role, children }: { time: string; role: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[48px_84px_minmax(0,1fr)] gap-2 py-2">
      <span className="text-muted">{time}</span>
      <span className="text-muted">{role}</span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

export function Transcript({ entries }: { entries: TranscriptEntry[] }) {
  const t = useT(conversationMessages);
  const { lang } = useLang();
  if (!entries.length) return <p className="py-6 text-muted">{t('emptyTranscript')}</p>;
  return (
    <ol>
      {entries.map((entry) => {
        const time = formatClock(entry.at, lang);
        switch (entry.kind) {
          case 'context':
            return (
              <li key={entry.key} className="flex items-center gap-2 py-2 text-[13px] text-muted">
                <span aria-hidden="true" className="flex-1 border-t border-line-soft" />
                {t('viewing', { product: entry.product })}
                <span aria-hidden="true" className="flex-1 border-t border-line-soft" />
              </li>
            );
          case 'card':
            return (
              <Row key={entry.key} time={time} role={t('roleCard')}>
                <BuyerCard card={entry.card} tool={entry.tool} />
              </Row>
            );
          case 'blocked':
            return (
              <Row key={entry.key} time={time} role={t('roleAssistant')}>
                <span className="whitespace-pre-line text-subtle line-through">{entry.text}</span>
                <Flag flag={entry.flag} />
              </Row>
            );
          case 'message':
            return (
              <Row
                key={entry.key}
                time={time}
                role={entry.role === 'buyer' ? t('roleBuyer') : t('roleAssistant')}
              >
                <span className={`whitespace-pre-line ${entry.flag ? 'text-subtle line-through' : ''}`}>
                  {entry.text}
                </span>
                {entry.flag && <Flag flag={entry.flag} />}
              </Row>
            );
        }
      })}
    </ol>
  );
}
