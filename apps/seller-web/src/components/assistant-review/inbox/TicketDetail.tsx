'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { HandoffTicketDetail } from '@huspee/sdk';
import { Button, ErrorState, Modal, Spinner, Textarea, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { threadItems, ticketState, type ThreadItem } from '../handoff';
import { StatusDot } from '../StatusDot';
import { formatStamp } from '../time';
import { inboxMessages } from './messages';
import { INBOX_CHANGED } from './TicketList';

export function TicketDetail({ shopId, ticketId }: { shopId: number; ticketId: number }) {
  const t = useT(inboxMessages);
  const commonT = useT(common);
  const ticket = useApi(() => getApiClient().seller.inbox.get(shopId, ticketId), [shopId, ticketId]);
  const data = ticket.data;
  // Opening a ticket clears its unread count on the server; the list and the sidebar badge follow.
  useEffect(() => {
    if (data) window.dispatchEvent(new Event(INBOX_CHANGED));
  }, [data]);

  if (!data && ticket.loading)
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Spinner />
      </div>
    );
  if (!data) {
    const missing = errorMessageKey(ticket.error) === 'not_found';
    return (
      <div className="p-6">
        <ErrorState
          message={missing ? commonT('not_found') : t('ticketLoadFailed')}
          onRetry={missing ? undefined : ticket.reload}
          retryLabel={t('retry')}
        />
      </div>
    );
  }
  return <TicketView shopId={shopId} ticket={data} onChanged={ticket.reload} />;
}

function TicketView({
  shopId,
  ticket,
  onChanged,
}: {
  shopId: number;
  ticket: HandoffTicketDetail;
  onChanged: () => void;
}) {
  const t = useT(inboxMessages);
  const commonT = useT(common);
  const { lang } = useLang();
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const items = threadItems(ticket.messages, ticket.buyer_unread);
  const state = ticketState(ticket);
  const first = ticket.messages[0];
  const replied = items.some((item) => item.kind === 'seller');
  const stamp = (seconds: number) => formatStamp(seconds, lang, now);
  const failure = (error: unknown, fallback: string) => {
    const key = errorMessageKey(error);
    return key === 'unknown' ? fallback : commonT(key);
  };

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    try {
      await getApiClient().seller.inbox.reply(shopId, ticket.ticket_id, body);
      setReply('');
      toast(t('sent'));
      onChanged();
    } catch (error) {
      toast(failure(error, t('sendFailed')));
    } finally {
      setSending(false);
    }
  }

  async function close() {
    setClosing(true);
    try {
      await getApiClient().seller.inbox.close(shopId, ticket.ticket_id);
      setConfirming(false);
      toast(t('closedToast'));
      onChanged();
    } catch (error) {
      toast(failure(error, t('closeFailed')));
    } finally {
      setClosing(false);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft px-6 py-4">
        <Link href="/inbox" className="text-link xl:hidden">
          ‹ {t('title')}
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">
            {ticket.conversation_id ? t('viaAssistant') : t('fromBuyer')}
          </h2>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
            {first && <span>{t('sentAt', { time: stamp(first.created_at) })} ·</span>}
            {state.kind === 'waiting' ? (
              <StatusDot tone="attention">{t('tabOpen')}</StatusDot>
            ) : state.kind === 'answered' ? (
              <StatusDot tone="neutral">{t('tabAnswered')}</StatusDot>
            ) : (
              <StatusDot tone="neutral">{t('closed')}</StatusDot>
            )}
          </p>
        </div>
        {ticket.conversation_id && (
          <Link
            href={`/assistant/conversations/${encodeURIComponent(ticket.conversation_id)}`}
            className="text-link hover:underline"
          >
            {t('viewConversation')}
          </Link>
        )}
        {state.kind !== 'closed' && (
          <Button
            variant="outline"
            size="sm"
            className="rounded! border-line-strong!"
            onClick={() => setConfirming(true)}
          >
            {t('closeTicket')}
          </Button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-4 px-6 py-5">
        {items.map((item) => (
          <ThreadEntry key={item.id} item={item} stamp={stamp} />
        ))}
      </div>

      {state.kind === 'closed' ? (
        <p className="border-t border-line-soft px-6 py-4 text-[13px] text-muted">{t('closedNote')}</p>
      ) : (
        <form onSubmit={(event) => void send(event)} className="border-t border-line-soft px-6 pt-4 pb-5">
          <label htmlFor="inbox-reply" className="mb-1.5 block text-[13px] text-muted">
            {replied ? t('replyMore') : t('reply')}
          </label>
          <Textarea
            id="inbox-reply"
            rows={3}
            value={reply}
            maxLength={4000}
            onChange={(event) => setReply(event.target.value)}
            placeholder={t('replyPlaceholder')}
            className="resize-y rounded! border-line-strong! px-3! py-2.5!"
          />
          <div className="mt-2.5 flex justify-end">
            <Button type="submit" loading={sending} disabled={!reply.trim()} className="h-9! rounded! px-5!">
              {t('send')}
            </Button>
          </div>
        </form>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} title={t('closeConfirm')}>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="rounded!"
            onClick={() => setConfirming(false)}
            disabled={closing}
          >
            {t('cancel')}
          </Button>
          <Button className="rounded!" loading={closing} onClick={() => void close()}>
            {t('closeTicket')}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function ThreadEntry({ item, stamp }: { item: ThreadItem; stamp: (seconds: number) => string }) {
  const t = useT(inboxMessages);
  if (item.kind === 'handoff')
    return (
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 text-[13px] text-muted">{t('question')}</div>
          <p className="text-base whitespace-pre-line">{item.question}</p>
        </div>
        {item.reason && <p className="text-[13px] text-muted">{t('reason', { reason: item.reason })}</p>}
        {item.excerpt.length > 0 && (
          <details className="border-y border-line-soft py-2.5">
            <summary className="cursor-pointer text-link">
              {t('excerpt', { count: item.excerpt.length })}
            </summary>
            <div className="mt-2 flex flex-col gap-1">
              {item.excerpt.map((line, index) => (
                <p key={index} className="whitespace-pre-line">
                  <span className="text-muted">
                    {line.role === 'buyer' ? t('roleBuyer') : t('roleAssistant')}:
                  </span>{' '}
                  {line.text}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  const seller = item.kind === 'seller';
  return (
    <div
      className={`flex max-w-[520px] flex-col gap-2 ${seller ? 'items-end self-end' : 'items-start self-start'}`}
    >
      <span className="text-[13px] text-muted">
        {seller
          ? `${t('youReplied', { time: stamp(item.at) })} · ${item.seen ? t('seen') : t('notSeen')}`
          : t('buyerWrote', { time: stamp(item.at) })}
      </span>
      <p className="rounded bg-gray-100 px-3.5 py-2.5 whitespace-pre-line">{item.text}</p>
    </div>
  );
}
