'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { HandoffTicketDetail } from '@huspee/sdk';
import { RequireRole } from '@huspee/web-ui/components/session';
import { Button, Card, Icon, QueryState, Textarea, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient } from '@huspee/web-ui/lib/api';
import { formatDateTime } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { messages } from '../messages';
import { StatusBadge } from '../_components/StatusBadge';

function TicketDetailView() {
  const t = useT(messages);
  const commonT = useT(common);
  const { lang } = useLang();
  const toast = useToast();
  const params = useParams();
  const ticketId = Number(params.ticketId);

  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    data: ticket,
    loading,
    error,
    reload,
  } = useApi<HandoffTicketDetail>(async () => {
    if (!ticketId || isNaN(ticketId)) {
      throw new Error('Invalid ticket ID');
    }
    const res = await getApiClient().buyer.messages.get(ticketId);
    // Opening the ticket clears unread on server, so notify the header to refresh badge
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('huspee:messages-changed'));
    }
    return res;
  }, [ticketId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (ticket?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ticket?.messages?.length]);

  const handleSubmitReply = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      await getApiClient().buyer.messages.reply(ticketId, trimmed);
      setReplyText('');
      toast(t('replySent'));
      await reload();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('huspee:messages-changed'));
      }
    } catch (e) {
      const key = errorMessageKey(e);
      toast(key !== 'unknown' ? commonT(key) : t('loadFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link
          href="/messages"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-primary transition-colors"
        >
          <span>←</span>
          <span>{t('backToMessages')}</span>
        </Link>
      </div>

      {loading || error ? (
        <QueryState loading={loading} error={error} retry={reload} />
      ) : !ticket ? (
        <Card className="py-12 text-center">
          <p className="text-gray-500">{t('loadFailed')}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Ticket Header Card */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-500">
                  <span className="font-mono text-gray-400">
                    {t('ticketNumber', { id: ticket.ticket_id })}
                  </span>
                  <span>•</span>
                  <span>{formatDateTime(ticket.updated_at, lang)}</span>
                </div>
                <h1 className="mt-1 text-lg sm:text-xl font-bold text-gray-900 break-words">
                  {ticket.subject}
                </h1>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={ticket.status} />
              </div>
            </div>

            {/* Shop Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-base text-primary">
                  <Icon name="shop" className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-gray-500">{t('shop')}</div>
                  <Link
                    href={`/shops/${ticket.shop_id}`}
                    className="font-semibold text-gray-900 hover:text-primary transition-colors text-sm"
                  >
                    {ticket.shop_name}
                  </Link>
                </div>
              </div>

              <Link href={`/shops/${ticket.shop_id}`}>
                <Button variant="outline" className="text-xs">
                  {t('visitShop')}
                </Button>
              </Link>
            </div>
          </Card>

          {/* Messages Thread Container */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-5 shadow-xs">
            <div className="space-y-4">
              {ticket.messages.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">{t('emptyThread')}</div>
              ) : (
                ticket.messages.map((msg) => {
                  if (msg.author === 'BUYER') {
                    // Buyer Message: Right-aligned, primary orange bubble
                    return (
                      <div key={msg.id} className="flex flex-col items-end">
                        <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                          <span className="font-semibold text-primary">{t('authorBuyer')}</span>
                          <span>•</span>
                          <span>{formatDateTime(msg.created_at, lang)}</span>
                        </div>
                        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-none bg-primary px-4 py-3 text-sm text-white shadow-xs">
                          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        </div>
                      </div>
                    );
                  }

                  if (msg.author === 'SELLER') {
                    // Seller Message: Left-aligned, white card with border
                    return (
                      <div key={msg.id} className="flex flex-col items-start">
                        <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1 font-semibold text-gray-800">
                            <Icon name="shop" className="h-3.5 w-3.5" />
                            <span>{ticket.shop_name}</span>
                            <span className="text-gray-400 font-normal">({t('authorSeller')})</span>
                          </span>
                          <span>•</span>
                          <span>{formatDateTime(msg.created_at, lang)}</span>
                        </div>
                        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tl-none border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-xs">
                          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        </div>
                      </div>
                    );
                  }

                  // Assistant Message: Distinct styling (AI avatar, subtle violet badge)
                  return (
                    <div key={msg.id} className="flex flex-col items-center my-2">
                      <div className="w-full max-w-xl rounded-xl border border-purple-200 bg-purple-50/70 p-3.5 text-sm text-purple-950 shadow-xs">
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/60 pb-1.5 text-xs text-purple-800">
                          <div className="flex items-center gap-1.5 font-semibold">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-200 text-xs">
                              <Icon name="bot" className="h-3.5 w-3.5" />
                            </span>
                            <span>{t('authorAssistant')}</span>
                            <span className="rounded-lg bg-purple-200/80 px-1.5 py-0.5 text-[10px] font-normal text-purple-900">
                              {t('assistantNotice')}
                            </span>
                          </div>
                          <span>{formatDateTime(msg.created_at, lang)}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-purple-900">{msg.body}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Reply Form or Closed Notice */}
          {ticket.status === 'CLOSED' ? (
            <Card className="border-gray-200 bg-gray-100 p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                <Icon name="lock" />
                <span>{t('ticketClosedNotice')}</span>
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <form onSubmit={handleSubmitReply} className="space-y-3">
                <Textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={t('replyPlaceholder')}
                  disabled={submitting}
                  className="w-full resize-none text-sm"
                  required
                />
                <div className="flex items-center justify-end">
                  <Button type="submit" disabled={submitting || !replyText.trim()}>
                    {submitting ? t('sending') : t('sendReply')}
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default function TicketDetailPage() {
  return (
    <RequireRole role="buyer">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <TicketDetailView />
      </div>
    </RequireRole>
  );
}
