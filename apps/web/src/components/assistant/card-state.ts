import type { Card } from '@huspee/web-ui/components/assistant/card-types';

/** What a product, search or comparison card is about; cards with the same topic show the same thing. */
function topic(card: Card): string | undefined {
  if (card.kind === 'product') return `product:${card.item_id}`;
  if (card.kind === 'products') return `products:${card.items.map((item) => item.item_id).join(',')}`;
  if (card.kind === 'compare')
    return `compare:${card.items
      .map((item) => item.item_id)
      .sort((a, b) => a - b)
      .join(',')}`;
  return undefined;
}

function lastIndex(cards: Card[], match: (card: Card) => boolean): number {
  for (let i = cards.length - 1; i >= 0; i--) if (match(cards[i]!)) return i;
  return -1;
}

/**
 * Add a card, or refresh one already shown: one card per action, and a follow-up question about the
 * product (or search, comparison, cart) the buyer is still on updates its card instead of repeating it.
 */
export function upsertCard(cards: Card[], incoming: Card): Card[] {
  const replace = (index: number) => cards.map((card, i) => (i === index ? incoming : card));
  if (incoming.kind === 'action') {
    const index = cards.findIndex(
      (card) => card.kind === 'action' && card.action.action_id === incoming.action.action_id,
    );
    if (index === -1) return [...cards, incoming];
    const existing = cards[index];
    if (
      existing?.kind === 'action' &&
      existing.action.status !== 'PENDING' &&
      incoming.action.status === 'PENDING'
    )
      return cards;
    return replace(index);
  }
  const key = topic(incoming);
  if (key !== undefined) {
    const index = lastIndex(cards, (card) => topic(card) !== undefined);
    return index !== -1 && topic(cards[index]!) === key ? replace(index) : [...cards, incoming];
  }
  if (incoming.kind === 'cart') {
    const index = lastIndex(cards, (card) => card.kind === 'cart');
    const movedOn = index !== -1 && cards.slice(index + 1).some((card) => topic(card) !== undefined);
    return index !== -1 && !movedOn ? replace(index) : [...cards, incoming];
  }
  return [...cards, incoming];
}

/** {@link upsertCard} for cards that remember when they first arrived. */
export function upsertTimed(
  previous: Array<{ card: Card; at: number }>,
  incoming: Card,
  now: number,
): Array<{ card: Card; at: number }> {
  const next = upsertCard(
    previous.map((item) => item.card),
    incoming,
  );
  return next.map((card, i) => ({ card, at: previous[i]?.at ?? now }));
}
