import type { Card } from '@huspee/web-ui/components/assistant/card-types';

/** One tool call as the live event stream reported it. Only its name and outcome are known. */
export type ToolRun = { id: number; name: string; status: 'running' | 'done' | 'error'; at: number };
/** Cards keep the time they first appeared so they sit in the conversation where they arrived. */
export type TimedCard = { card: Card; at: number };

export type TimelineItem<Entry> =
  | { kind: 'entry'; at: number; entry: Entry }
  | { kind: 'tool'; at: number; tool: ToolRun }
  | { kind: 'card'; at: number; card: Card; index: number };

/** A finished call completes the most recent running call of the same tool. */
export function applyToolEvent(
  tools: ToolRun[],
  event: { name: string; status: 'started' | 'done' | 'error' },
  now: number,
  id: number,
): ToolRun[] {
  if (event.status === 'started') return [...tools, { id, name: event.name, status: 'running', at: now }];
  const status = event.status === 'done' ? 'done' : 'error';
  for (let i = tools.length - 1; i >= 0; i--) {
    if (tools[i]!.name === event.name && tools[i]!.status === 'running')
      return tools.map((tool, index) => (index === i ? { ...tool, status } : tool));
  }
  return [...tools, { id, name: event.name, status, at: now }];
}

/** When the conversation stops, calls that never reported back are dropped rather than left spinning. */
export function settleTools(tools: ToolRun[]): ToolRun[] {
  return tools.filter((tool) => tool.status !== 'running');
}

const rank = { entry: 0, tool: 1, card: 2 } as const;

/** Messages, tool lines and cards in the order they arrived. */
export function buildTimeline<Entry extends { createdAt?: number }>(
  entries: Entry[],
  cards: TimedCard[],
  tools: ToolRun[],
): TimelineItem<Entry>[] {
  const items: TimelineItem<Entry>[] = [
    ...entries.map((entry) => ({ kind: 'entry' as const, at: entry.createdAt ?? 0, entry })),
    ...tools.map((tool) => ({ kind: 'tool' as const, at: tool.at, tool })),
    ...cards.map((item, index) => ({ kind: 'card' as const, at: item.at, card: item.card, index })),
  ];
  return items
    .map((item, order) => ({ item, order }))
    .sort((a, b) => a.item.at - b.item.at || rank[a.item.kind] - rank[b.item.kind] || a.order - b.order)
    .map(({ item }) => item);
}

/**
 * The newest pending action decides what the buyer is asked to do next. `now` (ms, 0 when not yet
 * known) drops actions past their expiry.
 */
export function awaitingConfirmation(cards: TimedCard[], now: number): 'tap' | 'yes' | undefined {
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i]!.card;
    if (card.kind !== 'action' || card.action.status !== 'PENDING') continue;
    if (now > 0 && card.action.expires_at !== undefined && card.action.expires_at * 1000 <= now) continue;
    return card.action.requires_tap ? 'tap' : 'yes';
  }
  return undefined;
}
