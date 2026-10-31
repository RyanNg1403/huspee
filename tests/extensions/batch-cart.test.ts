import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db, newBuyer } from '../helpers/fixtures.js';

type Line = { item_id: number; model_id: number; quantity: number };
type Result = { success: boolean; text: string; card?: { action: { action_id: string; status: string; requires_tap: boolean; summary: { total: number; lines: Array<{ label: string; value: string }> } } } };
async function setup(shopId: number) {
  const buyer = await newBuyer();
  const buyerId = (await db().query<{ id: number }>('SELECT id FROM users WHERE email=$1', [buyer.email])).rows[0]!.id;
  const conversationId = randomUUID();
  await db().query("INSERT INTO conversations (id,shop_id,buyer_id,channel,status,started_at) VALUES ($1,$2,$3,'TEXT','ACTIVE',NOW())", [conversationId, shopId, buyerId]);
  const run = (name: string, args: unknown = {}) => buyer.client.http.request<Result>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });
  const models = (await db().query<{ item_id: number; model_id: number }>("SELECT i.id item_id,m.id model_id FROM models m JOIN items i ON i.id=m.item_id WHERE i.shop_id=$1 AND i.status='NORMAL' AND m.status='MODEL_NORMAL' AND m.stock>=5 AND m.is_default<>i.has_model ORDER BY i.id,m.id", [shopId])).rows;
  const lines = [...new Map(models.map((model) => [model.item_id, model])).values()].slice(0, 2).map((line, index) => ({ ...line, quantity: index + 1 }));
  expect(lines).toHaveLength(2);
  const cart = async () => (await buyer.client.cart.get()).shops.flatMap((shop) => shop.items);
  return { buyer, buyerId, conversationId, run, lines, cart };
}
function action(result: Result) {
  expect(result.success, result.text).toBe(true);
  expect(result.card?.action).toBeDefined();
  return result.card!.action;
}

describe('one cart confirmation for a complete shopping request', () => {
  it.each([880001, 880002, 880003, 880004])('supports different products in shop %s without per-item confirmations', async (shopId) => {
    const { run, lines, cart, conversationId } = await setup(shopId);
    const prepared = await run('add_cart_items', { lines });
    const pending = action(prepared);
    expect(pending).toMatchObject({ status: 'PENDING', requires_tap: false });
    expect(await cart()).toHaveLength(0);
    expect((await db().query('SELECT id FROM pending_actions WHERE conversation_id=$1', [conversationId])).rowCount).toBe(1);
    const summary = pending.summary.lines.map((line) => line.value).join(' ');
    expect(summary).toContain('× 1');
    expect(summary).toContain('× 2');
    const stranger = await setup(shopId);
    expect((await stranger.run('confirm_action', { action_id: pending.action_id })).success).toBe(false);
    expect((await run('confirm_action', { action_id: pending.action_id })).success).toBe(true);
    expect((await run('confirm_action', { action_id: pending.action_id })).success).toBe(true);
    expect((await cart()).map((line) => ({ item_id: line.item_id, model_id: line.model_id, quantity: line.quantity }))).toEqual(expect.arrayContaining(lines));
    expect(await cart()).toHaveLength(2);
  });

  it('rejects a whole proposed batch when any line is invalid', async () => {
    const { run, lines, cart, conversationId } = await setup(880003);
    for (const invalid of [
      [], [lines[0], lines[0]],
      [lines[0], { ...lines[1], model_id: 3000101 }],
      [lines[0], { ...lines[1], quantity: 'two' }],
      [lines[0], { ...lines[1], quantity: 999 }],
      [lines[0], { ...lines[1], requested_attributes: { unknown: 'option' } }],
    ]) expect((await run('add_cart_items', { lines: invalid })).success).toBe(false);
    expect(await cart()).toHaveLength(0);
    expect((await db().query('SELECT id FROM pending_actions WHERE conversation_id=$1', [conversationId])).rowCount).toBe(0);
  });

  it('rolls back every cart write if a later line loses stock before confirmation', async () => {
    const { run, lines, cart } = await setup(880002);
    const pending = action(await run('add_cart_items', { lines }));
    const model = (await db().query<{ stock: number }>('SELECT stock FROM models WHERE id=$1', [lines[1]!.model_id])).rows[0]!;
    try {
      await db().query('UPDATE models SET stock=0 WHERE id=$1', [lines[1]!.model_id]);
      expect((await run('confirm_action', { action_id: pending.action_id })).success).toBe(false);
      expect(await cart()).toHaveLength(0);
      expect((await db().query<{ status: string }>('SELECT status FROM pending_actions WHERE id=$1', [pending.action_id])).rows[0]!.status).toBe('FAILED');
    } finally { await db().query('UPDATE models SET stock=$1 WHERE id=$2', [model.stock, lines[1]!.model_id]); }
  });

  it('revalidates prices for the full batch before confirmation', async () => {
    const { run, lines, cart } = await setup(880001);
    const pending = action(await run('add_cart_items', { lines }));
    const before = (await db().query<{ original_price: string }>('SELECT original_price FROM models WHERE id=$1', [lines[1]!.model_id])).rows[0]!;
    try {
      // Lower than every seeded promotional price, so this changes the effective price too.
      await db().query('UPDATE models SET original_price=1 WHERE id=$1', [lines[1]!.model_id]);
      expect((await run('confirm_action', { action_id: pending.action_id })).success).toBe(false);
      expect(await cart()).toHaveLength(0);
    } finally { await db().query('UPDATE models SET original_price=$1 WHERE id=$2', [before.original_price, lines[1]!.model_id]); }
  });

  it('edits one line while preserving the others and invalidates the previous consent', async () => {
    const { buyer, run, lines, cart } = await setup(880004);
    const pending = action(await run('add_cart_items', { lines }));
    const options = await buyer.client.assistant.actions.options(pending.action_id);
    expect(options.lines).toHaveLength(2);
    const edited = await buyer.client.assistant.actions.edit(pending.action_id, { line_index: 1, model_id: lines[1]!.model_id, quantity: 3 });
    expect(edited.action.status).toBe('PENDING');
    expect((await run('confirm_action', { action_id: pending.action_id })).success).toBe(false);
    expect(await cart()).toHaveLength(0);
    expect((await run('confirm_action', { action_id: edited.action.action_id })).success).toBe(true);
    expect((await cart()).map((line) => ({ item_id: line.item_id, model_id: line.model_id, quantity: line.quantity }))).toEqual(expect.arrayContaining([lines[0], { ...lines[1], quantity: 3 }]));
  });

  it('supports a single line through the same batch contract', async () => {
    const { run, lines, cart } = await setup(880002);
    const pending = action(await run('add_cart_items', { lines: [lines[0]] }));
    expect((await run('confirm_action', { action_id: pending.action_id })).success).toBe(true);
    expect(await cart()).toHaveLength(1);
  });

  it('checks out both color variants with the voucher and still requires the final tap', async () => {
    const { buyer, buyerId, run } = await setup(880003);
    const lines: Line[] = [{ item_id: 2000301, model_id: 3000303, quantity: 1 }, { item_id: 2000301, model_id: 3000306, quantity: 1 }];
    expect(JSON.parse((await run('check_voucher', { voucher_code: 'STYLE30K', lines })).text)).toMatchObject({ eligible: true, discount: 30000 });
    const added = action(await run('add_cart_items', { lines }));
    expect(added.summary.total).toBe(348000);
    expect((await run('confirm_action', { action_id: added.action_id })).success).toBe(true);
    const order = action(await run('place_order', { voucher_code: 'STYLE30K', address_id: buyer.addressId }));
    expect(order).toMatchObject({ requires_tap: true, summary: { total: 333000 } });
    expect((await run('confirm_action', { action_id: order.action_id })).success).toBe(false);
    expect((await db().query('SELECT order_sn FROM orders WHERE buyer_id=$1', [buyerId])).rowCount).toBe(0);
    const confirmed = await buyer.client.assistant.actions.confirm(order.action_id, randomUUID());
    expect(confirmed.action.status).toBe('EXECUTED');
    await buyer.client.buyer.orders.cancel(confirmed.action.result!.order_sn!, 'Batch checkout regression cleanup');
  });
});
