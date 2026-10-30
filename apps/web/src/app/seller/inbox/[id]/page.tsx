'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { HandoffMessage } from '@huspee/sdk';
import { Badge, Button, Card, ErrorState, Icon, Modal, Spinner, Textarea, useToast } from '@/components/ui';
import { useLang, useT } from '@/i18n';
import { common } from '@/i18n/common';
import { formatDateTime } from '@/lib/format';
import { errorMessageKey, getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { InboxShopGuard } from '../_components/InboxShopGuard';
import { inboxMessages } from '../messages';

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = Number(params.id);

  return (
    <InboxShopGuard>
      {(shop) => <TicketDetailContent shopId={shop.shop_id} ticketId={ticketId} />}
    </InboxShopGuard>
  );
}

function TicketDetailContent({ shopId, ticketId }: { shopId: number; ticketId: number }) {
  const t = useT(inboxMessages);
  const commonT = useT(common);
  const { lang } = useLang();
  const toast = useToast();

  const ticketApi = useApi(async () => {
    return getApiClient().seller.inbox.get(shopId, ticketId);
  }, [shopId, ticketId]);

  // When ticket data loads successfully, seller unread is reset on the server; notify SellerShell
  useEffect(() => {
    if (ticketApi.data) {
      window.dispatchEvent(new Event('huspee:inbox-changed'));
    }
  }, [ticketApi.data]);

  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const ticket = ticketApi.data;
  const messages: HandoffMessage[] = ticket?.messages ?? [];

  async function handleSendReply() {
    if (!replyBody.trim()) {
      toast(t('emptyReplyError'));
      return;
    }
    setSending(true);
    try {
      await getApiClient().seller.inbox.reply(shopId, ticketId, replyBody.trim());
      toast(t('replySuccess'));
      setReplyBody('');
      ticketApi.reload();
      window.dispatchEvent(new Event('huspee:inbox-changed'));
    } catch (e) {
      const key = errorMessageKey(e);
      toast(key !== 'unknown' ? commonT(key) : t('replyFailed'));
    } finally {
      setSending(false);
    }
  }

  async function handleCloseTicket() {
    setClosing(true);
    try {
      await getApiClient().seller.inbox.close(shopId, ticketId);
      toast(t('closeSuccess'));
      setCloseConfirmOpen(false);
      ticketApi.reload();
      window.dispatchEvent(new Event('huspee:inbox-changed'));
    } catch (e) {
      const key = errorMessageKey(e);
      toast(key !== 'unknown' ? commonT(key) : t('loadFailed'));
    } finally {
      setClosing(false);
    }
  }

  if (ticketApi.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (ticketApi.error || !ticket) {
    return <ErrorState message={t('loadFailed')} onRetry={ticketApi.reload} retryLabel={t('retry')} />;
  }

  const isClosed = ticket.status === 'CLOSED';

  return (
    <div className="space-y-6">
      {/* Header and Back Link */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/seller/inbox" className="text-xs font-medium text-gray-500 hover:text-primary">
            ← {t('backToInbox')}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{ticket.subject}</h1>
            <Badge
              tone={
                ticket.status === 'OPEN' ? 'warning' : ticket.status === 'ANSWERED' ? 'success' : 'neutral'
              }
            >
              {ticket.status === 'OPEN'
                ? t('statusOpen')
                : ticket.status === 'ANSWERED'
                  ? t('statusAnswered')
                  : t('statusClosed')}
            </Badge>
          </div>
          <p className="text-xs text-gray-500">
            {t('ticketId')}: #{ticket.ticket_id} · {t('updatedAt')}: {formatDateTime(ticket.updated_at, lang)}
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {ticket.conversation_id && (
            <Link href={`/seller/assistant/conversations/${encodeURIComponent(ticket.conversation_id)}`}>
              <Button
                size="sm"
                variant="outline"
                className="border-purple-200 text-purple-700 hover:bg-purple-50"
              >
                <Icon name="chat" className="mr-1.5 h-4 w-4" />
                {t('viewLinkedConversation')}
              </Button>
            </Link>
          )}

          {!isClosed && (
            <Button
              size="sm"
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={() => setCloseConfirmOpen(true)}
            >
              {t('closeTicket')}
            </Button>
          )}
        </div>
      </div>

      {/* Messages Thread */}
      <Card className="space-y-6 p-4 sm:p-6">
        <div className="space-y-4 min-h-[250px]">
          {messages.map((m) => {
            const isSeller = m.author === 'SELLER';
            const isAssistant = m.author === 'ASSISTANT';

            return (
              <div key={m.id} className={`flex gap-3 ${isSeller ? 'justify-end' : 'justify-start'}`}>
                {!isSeller && (
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs ${
                      isAssistant ? 'bg-purple-600' : 'bg-blue-600'
                    }`}
                  >
                    {isAssistant ? 'AI' : t('authorBuyerInitial')}
                  </div>
                )}

                <div className={`max-w-xl space-y-1 ${isSeller ? 'items-end text-right' : ''}`}>
                  <div className={`flex items-center gap-2 ${isSeller ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs font-semibold text-gray-800">
                      {isSeller ? t('authorSeller') : isAssistant ? t('authorAssistant') : t('authorBuyer')}
                    </span>
                    <span className="text-[11px] text-gray-400">{formatDateTime(m.created_at, lang)}</span>
                  </div>

                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs text-left ${
                      isSeller
                        ? 'rounded-tr-none bg-primary text-white'
                        : isAssistant
                          ? 'rounded-tl-none bg-purple-50 text-purple-950 border border-purple-100'
                          : 'rounded-tl-none bg-gray-100 text-gray-900'
                    }`}
                  >
                    {m.body}
                  </div>
                </div>

                {isSeller && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-xs">
                    {t('authorSellerInitial')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Reply Section */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          {isClosed ? (
            <div className="rounded-lg bg-gray-50 p-4 text-center text-xs text-gray-500">
              {t('ticketClosedNotice')}
            </div>
          ) : (
            <>
              <Textarea
                rows={3}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={t('replyPlaceholder')}
                className="w-full text-sm"
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  loading={sending}
                  disabled={!replyBody.trim()}
                  onClick={() => void handleSendReply()}
                >
                  {sending ? t('sending') : t('sendReply')}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Close Confirm Modal */}
      <Modal open={closeConfirmOpen} onClose={() => setCloseConfirmOpen(false)} title={t('closeTicket')}>
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-700">{t('closeConfirm')}</p>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="ghost" onClick={() => setCloseConfirmOpen(false)} disabled={closing}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700"
              loading={closing}
              onClick={() => void handleCloseTicket()}
            >
              {closing ? t('closing') : t('closeTicket')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
