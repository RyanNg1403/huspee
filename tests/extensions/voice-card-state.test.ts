import { describe, expect, it } from 'vitest';
import { upsertCard } from '../../apps/web/src/components/assistant/card-state.js';
import type { Card } from '../../packages/web-ui/src/components/assistant/card-types.js';

const action = (id: string, status: string): Card => ({
  kind: 'action',
  action: { action_id: id, status, requires_tap: false, summary: { title: 'Cart', lines: [] } },
});

describe('voice action cards', () => {
  it('merges tool results and action events by id, including replayed pending cards', () => {
    const pending = action('a', 'PENDING');
    const executed = action('a', 'EXECUTED');
    let cards = upsertCard([], pending);
    cards = upsertCard(cards, executed);
    cards = upsertCard(cards, executed);
    cards = upsertCard(cards, pending);
    cards = upsertCard(cards, action('b', 'PENDING'));
    expect(cards).toEqual([executed, action('b', 'PENDING')]);
  });
});

const product = (id: number, stock = 5): Card => ({
  kind: 'product',
  item_id: id,
  name: `Item ${id}`,
  image: null,
  models: [{ model_id: id * 10, name: 'Default', price: 100, stock }],
});
const cart = (quantity: number): Card => ({
  kind: 'cart',
  lines: [{ item_id: 1, model_id: 10, name: 'Item 1', quantity, price: 100 }],
  total: 100 * quantity,
});

describe('voice topic cards', () => {
  it('refreshes the card of the product the buyer is still asking about', () => {
    let cards = upsertCard([], product(1));
    cards = upsertCard(cards, action('a', 'EXECUTED'));
    cards = upsertCard(cards, product(1, 4));
    expect(cards).toEqual([product(1, 4), action('a', 'EXECUTED')]);
  });

  it('shows a product again after the buyer moved to another one', () => {
    let cards = upsertCard([], product(1));
    cards = upsertCard(cards, product(2));
    cards = upsertCard(cards, product(1));
    expect(cards).toEqual([product(1), product(2), product(1)]);
  });

  it('refreshes the cart card until another product comes up', () => {
    let cards = upsertCard([], cart(1));
    cards = upsertCard(cards, cart(2));
    expect(cards).toEqual([cart(2)]);
    cards = upsertCard(cards, product(3));
    cards = upsertCard(cards, cart(3));
    expect(cards).toEqual([cart(2), product(3), cart(3)]);
  });
});
