import type { AssistantInsights } from '@huspee/sdk';

/** Local midnight of today and yesterday, as unix seconds. */
export function dayStarts(now: Date): { today: number; yesterday: number } {
  const at = (offset: number) =>
    Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime() / 1000);
  return { today: at(0), yesterday: at(-1) };
}

export type TimedValue = { time: number; value: number };

/** Running total at the end of each of the `hours` hours that follow `dayStart` (unix seconds). */
export function cumulativeByHour(points: TimedValue[], dayStart: number, hours: number): number[] {
  const perHour = Array.from({ length: hours }, () => 0);
  for (const point of points) {
    const hour = Math.floor((point.time - dayStart) / 3600);
    if (hour >= 0 && hour < hours) perHour[hour] += point.value;
  }
  let total = 0;
  return perHour.map((value) => (total += value));
}

export type OrderPoint = { create_time: number; order_status: string; total_amount: number };

/**
 * Hourly inputs for the sales chart, using the dashboard summary's rule: revenue counts every
 * order except cancelled and unpaid ones; the order count includes every order.
 */
export function salesPoints(orders: OrderPoint[]): { revenue: TimedValue[]; orders: TimedValue[] } {
  return {
    revenue: orders
      .filter((o) => o.order_status !== 'CANCELLED' && o.order_status !== 'UNPAID')
      .map((o) => ({ time: o.create_time, value: o.total_amount })),
    orders: orders.map((o) => ({ time: o.create_time, value: 1 })),
  };
}

/** Axis step so that four steps cover `max`; whole numbers only for counts. */
export function niceStep(max: number, integer: boolean): number {
  const target = max / 4;
  if (target <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const factors = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const factor = factors.find((f) => f * magnitude >= target) ?? 10;
  return factor * magnitude;
}

/** SVG path in a 230×100 box: one point per hour, 10 units apart, 0 at the bottom. */
export function chartPath(values: number[], max: number): string {
  if (!values.length) return '';
  const y = (v: number) => (max > 0 ? 100 - (v / max) * 100 : 100);
  return `M${values.map((v, i) => `${i * 10},${Number(y(v).toFixed(2))}`).join(' L')}`;
}

export type Comparison = { direction: 'up' | 'down' | 'same'; diff: number; percent: number | null };

/** Today against the same time yesterday; `percent` is null when yesterday was zero. */
export function compare(today: number, yesterday: number): Comparison {
  const diff = today - yesterday;
  return {
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
    diff,
    percent: yesterday > 0 ? (diff / yesterday) * 100 : null,
  };
}

export type IssueKind = 'missing' | 'handoff' | 'unanswered' | 'popular';
export type Issue = {
  kind: IssueKind;
  text: string;
  count: number;
  /** Most recent conversation the question came from. */
  conversationId?: string;
  itemId?: number;
};
type QuestionRow = AssistantInsights['missing_requests'][number];
type InsightsInput = Pick<AssistantInsights, 'missing_requests' | 'unanswered_questions' | 'top_products'>;

function groupQuestions(rows: QuestionRow[], kindOf: (row: QuestionRow) => IssueKind): Issue[] {
  const groups = new Map<string, { issue: Issue; latest: number }>();
  for (const row of rows) {
    const text = row.question.trim();
    if (!text) continue;
    const kind = kindOf(row);
    const key = `${kind}\u0000${text.toLocaleLowerCase()}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        issue: { kind, text, count: 1, conversationId: row.conversation_id },
        latest: row.created_at,
      });
      continue;
    }
    group.issue.count += 1;
    if (row.created_at > group.latest) {
      group.latest = row.created_at;
      group.issue.conversationId = row.conversation_id;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.issue.count - a.issue.count || b.latest - a.latest)
    .map((group) => group.issue);
}

/**
 * Rows for "From assistant conversations": identical questions merged and counted, at most
 * `perKind` rows per kind, ordered missing items, handoffs, unanswered, most-asked products.
 */
export function conversationIssues(insights: InsightsInput, perKind = 3): Issue[] {
  const missing = groupQuestions(insights.missing_requests, () => 'missing');
  const unanswered = groupQuestions(insights.unanswered_questions, (row) =>
    row.tool === 'handoff_to_seller' ? 'handoff' : 'unanswered',
  );
  const popular: Issue[] = [...insights.top_products]
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ kind: 'popular', text: p.name, count: p.count, itemId: p.item_id }));
  return [
    ...missing.slice(0, perKind),
    ...unanswered.filter((i) => i.kind === 'handoff').slice(0, perKind),
    ...unanswered.filter((i) => i.kind === 'unanswered').slice(0, perKind),
    ...popular.slice(0, perKind),
  ];
}
