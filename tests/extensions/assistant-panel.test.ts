import { describe, expect, it } from 'vitest';
import { panelStatus } from '../../apps/web/src/components/assistant/panel-status.js';
import { pinnedBounds, readPinnedPreference, writePinnedPreference } from '../../apps/web/src/components/assistant/panel-layout.js';
import {
  applyToolEvent,
  awaitingConfirmation,
  buildTimeline,
  settleTools,
  type TimedCard,
} from '../../apps/web/src/components/assistant/timeline.js';
import { upsertTimed } from '../../apps/web/src/components/assistant/card-state.js';
import { toolLabelKey, toolMakesCard } from '../../apps/web/src/components/assistant/tool-labels.js';
import type { Card } from '../../packages/web-ui/src/components/assistant/card-types.js';
import { pickLanguage, summaryRows } from '../../packages/web-ui/src/components/assistant/summary.js';
import { formatCountdown, secondsLeft } from '../../packages/web-ui/src/components/assistant/time.js';

const base = {
  connected: true,
  session: 'active' as const,
  call: 'idle' as const,
  checking: false,
  speaking: false,
  muted: false,
  pushToTalk: false,
  holding: false,
};
const action = (id: string, requiresTap: boolean, status = 'PENDING', expiresAt?: number): Card => ({
  kind: 'action',
  action: { action_id: id, status, requires_tap: requiresTap, expires_at: expiresAt, summary: { title: 'x', lines: [] } },
});

describe('assistant panel status', () => {
  it('reports what the session is doing, most urgent first', () => {
    expect(panelStatus({ ...base, connected: false })).toEqual({ key: 'notConnected', indicator: 'off' });
    expect(panelStatus({ ...base, session: 'connecting' }).key).toBe('connecting');
    expect(panelStatus({ ...base, session: 'idle', failure: 'busy' })).toEqual({ key: 'busy', indicator: 'off' });
    expect(panelStatus({ ...base, call: 'connecting' }).key).toBe('calling');
    expect(panelStatus({ ...base, call: 'active', checking: true, speaking: true }).indicator).toBe('spinner');
    expect(panelStatus({ ...base, call: 'active', speaking: true })).toEqual({ key: 'speaking', indicator: 'bars' });
    expect(panelStatus({ ...base, call: 'active', awaiting: 'tap' }).key).toBe('awaitingTap');
    expect(panelStatus({ ...base, call: 'active', awaiting: 'yes' }).key).toBe('awaitingYesVoice');
    expect(panelStatus({ ...base, awaiting: 'yes' }).key).toBe('awaitingYesText');
    expect(panelStatus({ ...base, failure: 'microphone' })).toEqual({ key: 'micBlocked', indicator: 'error' });
    expect(panelStatus({ ...base, call: 'active' })).toEqual({ key: 'listening', indicator: 'live' });
    expect(panelStatus({ ...base, call: 'active', muted: true }).key).toBe('muted');
    expect(panelStatus({ ...base, call: 'active', pushToTalk: true }).key).toBe('holdToTalk');
    expect(panelStatus({ ...base, call: 'active', pushToTalk: true, holding: true }).key).toBe('listening');
    expect(panelStatus({ ...base, session: 'idle' })).toEqual({ key: 'statusReady', indicator: 'ready' });
  });

  it('asks for a tap for orders and returns, a yes for cart changes, and forgets expired actions', () => {
    const cards: TimedCard[] = [{ card: action('cart', false), at: 1 }];
    expect(awaitingConfirmation(cards, 0)).toBe('yes');
    const withOrder = [...cards, { card: action('order', true, 'PENDING', 100), at: 2 }];
    expect(awaitingConfirmation(withOrder, 50_000)).toBe('tap');
    expect(awaitingConfirmation(withOrder, 100_000)).toBe('yes');
    expect(awaitingConfirmation([{ card: action('done', true, 'EXECUTED'), at: 1 }], 0)).toBeUndefined();
  });
});

describe('assistant timeline', () => {
  it('pairs each finished tool with its running call and drops unfinished calls when the chat ends', () => {
    let tools = applyToolEvent([], { name: 'search_products', status: 'started' }, 10, 1);
    tools = applyToolEvent(tools, { name: 'get_vouchers', status: 'started' }, 11, 2);
    tools = applyToolEvent(tools, { name: 'search_products', status: 'done' }, 12, 3);
    expect(tools.map((tool) => [tool.name, tool.status, tool.at])).toEqual([
      ['search_products', 'done', 10],
      ['get_vouchers', 'running', 11],
    ]);
    tools = applyToolEvent(tools, { name: 'compare_products', status: 'error' }, 13, 4);
    expect(tools.at(-1)).toMatchObject({ name: 'compare_products', status: 'error' });
    expect(settleTools(tools).map((tool) => tool.name)).toEqual(['search_products', 'compare_products']);
  });

  it('keeps arrival order across messages, tool lines and cards, and updates cards in place', () => {
    const product = (stock: number): Card => ({ kind: 'product', item_id: 1, name: 'A', image: null, models: [{ model_id: 2, name: 'B', price: 3, stock }] });
    let cards = upsertTimed([], product(5), 30);
    cards = upsertTimed(cards, product(4), 50);
    expect(cards).toEqual([{ card: product(4), at: 30 }]);
    const timeline = buildTimeline(
      [
        { id: 'u', role: 'user', text: 'q', final: true, createdAt: 10 },
        { id: 'a', role: 'assistant', text: 'a', final: true, createdAt: 40 },
      ],
      cards,
      [{ id: 1, name: 'get_product_details', status: 'done', at: 20 }],
    );
    expect(timeline.map((item) => item.kind)).toEqual(['entry', 'tool', 'card', 'entry']);
  });

  it('describes tools by name only and holds a card place for tools that return one', () => {
    expect(toolLabelKey('get_viewed_product', 'running')).toBe('toolProduct');
    expect(toolLabelKey('get_product_details', 'done')).toBe('toolProductDone');
    expect(toolLabelKey('place_order', 'done')).toBe('toolPlaceOrderDone');
    expect(toolLabelKey('something_new', 'running')).toBe('toolOther');
    expect(toolLabelKey('search_products', 'error')).toBe('toolError');
    expect(toolMakesCard('compare_products')).toBe(true);
    expect(toolMakesCard('get_vouchers')).toBe(false);
  });
});

describe('assistant panel layout', () => {
  it('stays below a sticky header and above a following footer', () => {
    expect(pinnedBounds({ columnTop: 120, columnBottom: 2000, viewportHeight: 900 })).toEqual({ top: 120, bottom: 0 });
    expect(pinnedBounds({ columnTop: -400, columnBottom: 2000, viewportHeight: 900 })).toEqual({ top: 0, bottom: 0 });
    expect(pinnedBounds({ columnTop: -400, columnBottom: 2000, viewportHeight: 900, stickyHeaderBottom: 64 })).toEqual({ top: 64, bottom: 0 });
    expect(pinnedBounds({ columnTop: -400, columnBottom: 700, viewportHeight: 900 })).toEqual({ top: 0, bottom: 200 });
  });

  it('remembers a collapsed panel for the browser session and survives blocked storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    expect(readPinnedPreference(storage)).toBe(true);
    writePinnedPreference(storage, false);
    expect(readPinnedPreference(storage)).toBe(false);
    writePinnedPreference(storage, true);
    expect(readPinnedPreference(storage)).toBe(true);
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readPinnedPreference(blocked)).toBe(true);
    expect(() => writePinnedPreference(blocked, false)).not.toThrow();
    expect(readPinnedPreference(undefined)).toBe(true);
  });
});

describe('assistant action summaries', () => {
  const money = (amount: number) => `${amount}đ`;
  it.each(['vi', 'en'] as const)('preserves buyer refund notes verbatim in %s', (lang) => {
    const note = 'Nứt nút bấm / seller review\n349000 VND';
    expect(summaryRows([{ label: 'Ghi chú / Notes', value: note, verbatim: true }], lang, money)[0]!.value).toBe(note);
  });
  it('shows the buyer’s language and formats amounts without recalculating them', () => {
    expect(pickLanguage('Thêm vào giỏ hàng / Add to cart', 'en')).toBe('Add to cart');
    expect(pickLanguage('Thêm vào giỏ hàng / Add to cart', 'vi')).toBe('Thêm vào giỏ hàng');
    expect(pickLanguage('Áo thun / T-shirt', 'en')).toBe('Áo thun / T-shirt');
    const rows = summaryRows(
      [
        { label: 'Số lượng / Quantity', value: '2' },
        { label: 'Đơn giá / Unit price', value: '349000' },
        { label: 'Mã giảm giá / Voucher', value: 'Không có / None' },
        { label: 'Tai nghe Bluetooth', value: 'Đen × 2 @ 790000 VND' },
        { label: 'Nghe được / Heard', value: 'hai → 2' },
      ],
      'vi',
      money,
    );
    expect(rows).toEqual([
      { label: 'Số lượng', value: '2', heard: false },
      { label: 'Đơn giá', value: '349000đ', heard: false },
      { label: 'Mã giảm giá', value: 'Không có', heard: false },
      { label: 'Tai nghe Bluetooth', value: 'Đen × 2 @ 790000đ', heard: false },
      { label: 'Nghe được', value: 'hai → 2', heard: true },
    ]);
  });

  it('counts down to the server expiry', () => {
    expect(secondsLeft(undefined, 0)).toBeUndefined();
    expect(secondsLeft(1000, 888_000)).toBe(112);
    expect(secondsLeft(1000, 2_000_000)).toBe(0);
    expect(formatCountdown(112)).toBe('1:52');
    expect(formatCountdown(5)).toBe('0:05');
  });
});
