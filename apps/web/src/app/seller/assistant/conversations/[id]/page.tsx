'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, Card, EmptyState, ErrorState, Spinner } from '@/components/ui';
import { useLang, useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { AssistantShopGuard } from '../../_components/AssistantShopGuard';
import { assistantMessages } from '../../messages';

type TimelineEvent =
  | {
      kind: 'message';
      id: number;
      role: 'USER' | 'ASSISTANT';
      text: string;
      created_at: number;
    }
  | {
      kind: 'tool_call';
      id: number;
      tool: string;
      args: unknown;
      result: unknown;
      success: boolean;
      error: string | null;
      latency_ms: number;
      created_at: number;
    };

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = String(params.id);

  return (
    <AssistantShopGuard>
      {(shop) => <ConversationDetailContent shopId={shop.shop_id} conversationId={conversationId} />}
    </AssistantShopGuard>
  );
}

function ConversationDetailContent({ shopId, conversationId }: { shopId: number; conversationId: string }) {
  const t = useT(assistantMessages);
  const { lang } = useLang();

  const detailApi = useApi(async () => {
    return getApiClient().seller.assistant.conversations.get(shopId, conversationId);
  }, [shopId, conversationId]);

  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});

  function toggleToolExpand(id: number) {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const detail = detailApi.data;

  // Build unified chronological timeline
  const timeline: TimelineEvent[] = useMemo(() => {
    if (!detail) return [];
    const list: TimelineEvent[] = [];

    for (const m of detail.messages ?? []) {
      list.push({
        kind: 'message',
        id: m.id,
        role: m.role,
        text: m.text,
        created_at: m.created_at,
      });
    }

    for (const tc of detail.tool_calls ?? []) {
      list.push({
        kind: 'tool_call',
        id: tc.id,
        tool: tc.tool,
        args: tc.args,
        result: tc.result,
        success: tc.success,
        error: tc.error,
        latency_ms: tc.latency_ms,
        created_at: tc.created_at,
      });
    }

    return list.sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return a.created_at - b.created_at;
      }
      const rankA = a.kind === 'message' ? (a.role === 'USER' ? 0 : 2) : 1;
      const rankB = b.kind === 'message' ? (b.role === 'USER' ? 0 : 2) : 1;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return a.id - b.id;
    });
  }, [detail]);

  // Extract all mentioned item IDs and order SNs for quick access from verified tool results
  const mentions = useMemo(() => {
    const itemIds = new Set<number>();
    const orderSns = new Set<string>();

    if (!detail) return { items: [], orders: [] };

    // Inspect verified tool calls (avoid treating failed lookup args as verified references)
    for (const tc of detail.tool_calls ?? []) {
      if (!tc.success) continue;

      const res = tc.result as Record<string, unknown> | null;
      if (!res || typeof res !== 'object') continue;

      if (typeof res.item_id === 'number') itemIds.add(res.item_id);
      if (typeof res.order_sn === 'string') orderSns.add(res.order_sn);
      if (Array.isArray(res.items)) {
        for (const item of res.items) {
          if (
            item &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>).item_id === 'number'
          ) {
            itemIds.add((item as Record<string, unknown>).item_id as number);
          }
        }
      }

      // Check result.card union
      const card = (res.card ?? res) as Record<string, unknown> | null;
      if (card && typeof card === 'object') {
        if (typeof card.item_id === 'number') itemIds.add(card.item_id);
        if (typeof card.order_sn === 'string') orderSns.add(card.order_sn);

        if (Array.isArray(card.items)) {
          for (const item of card.items) {
            if (
              item &&
              typeof item === 'object' &&
              typeof (item as Record<string, unknown>).item_id === 'number'
            ) {
              itemIds.add((item as Record<string, unknown>).item_id as number);
            }
          }
        }
        if (Array.isArray(card.lines)) {
          for (const line of card.lines) {
            if (
              line &&
              typeof line === 'object' &&
              typeof (line as Record<string, unknown>).item_id === 'number'
            ) {
              itemIds.add((line as Record<string, unknown>).item_id as number);
            }
          }
        }
        if (card.action && typeof card.action === 'object') {
          const act = card.action as Record<string, unknown>;
          if (act.result && typeof act.result === 'object') {
            const actRes = act.result as Record<string, unknown>;
            if (typeof actRes.order_sn === 'string') orderSns.add(actRes.order_sn);
          }
        }
      }
    }

    // Inspect message texts with regex
    for (const m of detail.messages ?? []) {
      const text = m.text ?? '';
      const orderMatches = text.match(/\b(26[0-9]{8,14}[A-Za-z0-9]*)\b/g);
      if (orderMatches) {
        for (const sn of orderMatches) orderSns.add(sn);
      }
    }

    return {
      items: Array.from(itemIds),
      orders: Array.from(orderSns),
    };
  }, [detail]);

  if (detailApi.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (detailApi.error || !detail) {
    return <ErrorState message={t('loadFailed')} onRetry={detailApi.reload} retryLabel={t('retry')} />;
  }

  const durationSec =
    detail.ended_at && detail.started_at
      ? Math.max(0, Math.floor(detail.ended_at - detail.started_at))
      : null;

  return (
    <div className="space-y-6">
      {/* Header and Back Link */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/seller/assistant/conversations"
            className="text-xs font-medium text-gray-500 hover:text-primary"
          >
            ← {t('backToConversations')}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{t('conversationDetail')}</h1>
          <p className="font-mono text-xs text-gray-500">{conversationId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={detail.channel === 'VOICE' ? 'info' : 'neutral'}>
            {detail.channel === 'VOICE' ? t('channelVoice') : t('channelText')}
          </Badge>
          <Badge tone={detail.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {detail.status === 'ACTIVE' ? t('statusActive') : t('statusEnded')}
          </Badge>
        </div>
      </div>

      {/* Meta Card */}
      <Card className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
        <div>
          <span className="text-gray-500">{t('buyer')}</span>
          <p className="mt-0.5 font-semibold text-gray-900">#{detail.buyer_id}</p>
        </div>
        <div>
          <span className="text-gray-500">{t('startedAt')}</span>
          <p className="mt-0.5 font-medium text-gray-900">{formatDateTime(detail.started_at, lang)}</p>
        </div>
        <div>
          <span className="text-gray-500">{t('endedAt')}</span>
          <p className="mt-0.5 font-medium text-gray-900">
            {detail.ended_at ? formatDateTime(detail.ended_at, lang) : '-'}
          </p>
        </div>
        <div>
          <span className="text-gray-500">{t('duration')}</span>
          <p className="mt-0.5 font-medium text-gray-900">{durationSec !== null ? `${durationSec}s` : '-'}</p>
        </div>
      </Card>

      {/* Mentioned Items and Orders Bar */}
      {(mentions.items.length > 0 || mentions.orders.length > 0) && (
        <Card className="space-y-3 bg-orange-50/30 p-4 border-orange-100">
          <h3 className="text-xs font-semibold uppercase text-gray-600">{t('mentionedLinksTitle')}</h3>
          <div className="flex flex-wrap gap-2 items-center">
            {mentions.items.map((itemId) => (
              <Link
                key={itemId}
                href={`/products/${itemId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-medium text-primary shadow-xs border border-orange-200 hover:bg-orange-50"
              >
                <span>
                  📦 {t('viewItem')} #{itemId}
                </span>
              </Link>
            ))}
            {mentions.orders.map((orderSn) => (
              <Link
                key={orderSn}
                href={`/seller/orders/${encodeURIComponent(orderSn)}`}
                className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-medium text-gray-800 shadow-xs border border-gray-200 hover:bg-gray-50"
              >
                <span>
                  🧾 {t('viewOrder')} {orderSn}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Timeline Section */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">{t('timeline')}</h2>

        <div className="space-y-4">
          {timeline.length === 0 ? (
            <Card className="py-12">
              <EmptyState title={t('emptyTimeline')}>
                <p className="mt-1 text-xs text-gray-400">{t('emptyTimelineDesc')}</p>
              </EmptyState>
            </Card>
          ) : (
            timeline.map((event) => {
              if (event.kind === 'message') {
                const isUser = event.role === 'USER';
                return (
                  <div
                    key={`msg-${event.id}`}
                    className={`flex gap-3 ${isUser ? 'justify-start' : 'justify-start'}`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs ${
                        isUser ? 'bg-blue-600' : 'bg-primary'
                      }`}
                    >
                      {isUser ? t('buyerInitial') : 'AI'}
                    </div>

                    <div className="max-w-2xl space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-800">
                          {isUser ? t('buyerMessage') : t('assistantMessage')}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {formatDateTime(event.created_at, lang)}
                        </span>
                      </div>
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs ${
                          isUser
                            ? 'rounded-tl-none bg-blue-50 text-blue-950 border border-blue-100'
                            : 'rounded-tl-none bg-white text-gray-900 border border-gray-200'
                        }`}
                      >
                        {event.text}
                      </div>
                    </div>
                  </div>
                );
              }

              // Tool Call
              const expanded = expandedTools[event.id] ?? false;
              return (
                <div
                  key={`tc-${event.id}`}
                  className="ml-11 max-w-2xl rounded-lg border border-dashed border-gray-300 bg-gray-50/70 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-gray-900">⚡ {event.tool}</span>
                      <Badge tone={event.success ? 'success' : 'error'}>
                        {event.success ? t('success') : t('error')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-500">{event.latency_ms}ms</span>
                      <button
                        type="button"
                        onClick={() => toggleToolExpand(event.id)}
                        className="text-primary hover:underline font-medium"
                      >
                        {expanded ? t('toolCollapse') : t('toolExpand')}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3 space-y-2 border-t border-gray-200 pt-2 font-mono text-[11px]">
                      <div>
                        <span className="font-semibold text-gray-700">{t('toolArgs')}:</span>
                        <pre className="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-gray-800">
                          {JSON.stringify(event.args, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">{t('toolResult')}:</span>
                        <pre className="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-gray-800">
                          {JSON.stringify(event.result, null, 2)}
                        </pre>
                      </div>
                      {event.error && (
                        <div className="text-red-600">
                          <span className="font-semibold">{t('error')}:</span> {event.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
