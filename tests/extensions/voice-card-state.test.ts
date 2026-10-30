import { describe, expect, it } from 'vitest';
import { upsertCard } from '../../apps/web/src/components/assistant/card-state.js';
import type { Card } from '../../apps/web/src/components/assistant/card-types.js';

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
