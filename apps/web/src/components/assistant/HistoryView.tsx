'use client';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatDateTime } from '@huspee/web-ui/lib/format';
import { AssistantCard, type Card, type EditOptions } from '@huspee/web-ui/components/assistant/cards';
import { messages } from '@huspee/web-ui/components/assistant/messages';
import { AssistantBubble, UserBubble } from './Bubbles';
import { ChevronGlyph, MicGlyph, Spinner } from './icons';
import { upsertTimed } from './card-state';
import type { TimedCard } from './timeline';

export type HistoryItem = {
  conversation_id: string;
  channel: 'VOICE' | 'TEXT';
  status: 'ACTIVE' | 'ENDED';
  started_at: number;
  preview: string | null;
  message_count: number;
};
export type HistoryDetail = HistoryItem & {
  messages: Array<{ role: 'user' | 'assistant'; text: string; created_at: number }>;
  cards: Array<{ card: Record<string, unknown>; created_at: number }>;
};

/** A stored conversation, read-only: its transcript and the cards its tool results produced. */
export function PastConversation({ detail, getOptions }: { detail: HistoryDetail; getOptions: (id: string) => Promise<EditOptions> }) {
  const items = [
    ...detail.messages.map((message, index) => ({ at: message.created_at, order: index * 2, message })),
    ...detail.cards
      .reduce<TimedCard[]>((cards, entry) => upsertTimed(cards, entry.card as Card, entry.created_at), [])
      .map((entry, index) => ({ at: entry.at, order: index * 2 + 1, card: entry.card })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);
  return (
    <>
      {items.map((item, index) =>
        'message' in item ? (
          item.message.role === 'user' ? (
            <UserBubble key={index} text={item.message.text} voice={detail.channel === 'VOICE'} />
          ) : (
            <AssistantBubble key={index} text={item.message.text} />
          )
        ) : (
          <AssistantCard
            key={index}
            card={item.card}
            pending
            readOnly
            onAction={() => undefined}
            getOptions={getOptions}
            onEdit={async () => undefined}
          />
        ),
      )}
    </>
  );
}

/** This buyer's earlier conversations with the shop, newest first. */
export function HistoryView({
  list,
  failed,
  viewing,
  liveId,
  live,
  canContinue,
  getOptions,
  onRetry,
  onOpen,
  onBack,
  onContinue,
}: {
  list: HistoryItem[] | null;
  failed: boolean;
  viewing: HistoryDetail | null;
  liveId?: string;
  live: boolean;
  canContinue: boolean;
  getOptions: (id: string) => Promise<EditOptions>;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
  onContinue: (detail: HistoryDetail) => void;
}) {
  const t = useT(messages);
  const { lang } = useLang();
  if (viewing)
    return (
      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={onBack} className="flex min-h-8 items-center gap-1 self-start text-xs text-muted hover:text-ink">
          <ChevronGlyph direction="left" className="h-3.5 w-3.5" />
          {t('back')}
        </button>
        <p className="text-xs text-muted">{formatDateTime(viewing.started_at, lang)}</p>
        <PastConversation detail={viewing} getOptions={getOptions} />
        {canContinue && (
          <button
            type="button"
            onClick={() => onContinue(viewing)}
            className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-sm bg-primary text-sm font-semibold text-white hover:bg-primary-hover"
          >
            <MicGlyph className="h-4 w-4" />
            {t('continueChat')}
          </button>
        )}
      </div>
    );
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{t('history')}</h3>
      {failed && (
        <button type="button" onClick={onRetry} className="text-sm text-primary">
          {t('loadFailed')}
        </button>
      )}
      {!failed && list === null && <Spinner className="h-5 w-5" />}
      {list?.length === 0 && <p className="text-sm text-muted">{t('noHistory')}</p>}
      <ul className="divide-y divide-line-soft">
        {list?.map((item) => (
          <li key={item.conversation_id}>
            <button
              type="button"
              onClick={() => onOpen(item.conversation_id)}
              className="block w-full py-2.5 text-left hover:bg-gray-50"
            >
              <span className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>{formatDateTime(item.started_at, lang)}</span>
                <span>
                  {item.conversation_id === liveId && live
                    ? t('ongoing')
                    : item.channel === 'VOICE'
                      ? t('voiceChannel')
                      : t('textChannel')}
                  {' · '}
                  {t('messagesCount', { n: item.message_count })}
                </span>
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink">{item.preview ?? '…'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
