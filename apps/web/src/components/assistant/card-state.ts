import type { Card } from './card-types.js';

/** Keep one card for each action, even when the result and update both arrive. */
export function upsertCard(cards: Card[], incoming: Card): Card[] {
  if (incoming.kind !== 'action') return [...cards, incoming];
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
  return cards.map((card, i) => (i === index ? incoming : card));
}
