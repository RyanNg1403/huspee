import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../apps/api/src/common/prisma.service.js';
import { CatalogService } from '../../apps/api/src/domain/catalog.service.js';
import { LogisticsService } from '../../apps/api/src/domain/logistics.service.js';
import { OrderService } from '../../apps/api/src/domain/order.service.js';
import { PushService } from '../../apps/api/src/domain/push.service.js';
import { ReturnService } from '../../apps/api/src/domain/return.service.js';
import { VoucherService } from '../../apps/api/src/domain/voucher.service.js';
import { ActionsService } from '../../apps/api/src/assistant/actions.service.js';
import { AssistantEvents } from '../../apps/api/src/assistant/assistant.events.js';
import { AssistantToolRegistry, type ToolContext, type ToolOutput } from '../../apps/api/src/assistant/tools/assistant-tool.registry.js';
import { DATABASE_URL, SEED } from '../helpers/env.js';
import { newBuyer } from '../helpers/fixtures.js';

// Real tool/action/domain services and the dedicated test DB; no Codex transport is needed.
const prisma = new PrismaService({ datasourceUrl: DATABASE_URL });
const logistics = new LogisticsService(prisma);
const push = new PushService(prisma);
const vouchers = new VoucherService(prisma);
const orders = new OrderService(prisma, logistics, vouchers, push);
const actions = new ActionsService(prisma, new AssistantEvents(), orders, new ReturnService(prisma, push));
const tools = new AssistantToolRegistry(prisma, new CatalogService(prisma), actions, logistics, vouchers);
afterAll(() => prisma.$disconnect());

function actionCard(output: ToolOutput) {
  expect(output.success, output.text).toBe(true);
  if (output.card?.kind !== 'action') throw new Error('Expected an action card');
  return output.card.action;
}

describe('actions with product-page context', () => {
  it.each([2000301, null])('prepares and confirms cart/checkout when viewedItemId is %s', async (viewedItemId) => {
    const buyer = await newBuyer();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: buyer.email } });
    const conversation = await prisma.conversation.create({ data: { buyerId: user.id, shopId: 880003, channel: 'TEXT' } });
    const ctx: ToolContext = { conversationId: conversation.id, buyerId: user.id, shopId: 880003, viewedItemId };
    const run = (name: string, args: unknown = {}) => tools.run(name, args, ctx);
    let orderSn: string | undefined;
    try {
      const add = actionCard(await run('add_to_cart', {
        item_id: 2000301, model_id: 3000306, quantity: 1,
        requested_attributes: { 'Màu sắc': 'Đen', Size: 'XL' },
      }));
      expect(add).toMatchObject({ type: 'ADD_TO_CART', status: 'PENDING', requires_tap: false });
      expect((await buyer.client.cart.get()).item_count).toBe(0);
      expect(await run('confirm_action', { action_id: add.action_id })).toMatchObject({ success: true });
      expect((await buyer.client.cart.get()).shops[0]!.items[0]).toMatchObject({ model_id: 3000306, quantity: 1 });

      const update = actionCard(await run('update_cart_item', { model_id: 3000306, quantity: 2 }));
      expect(update.type).toBe('UPDATE_CART_ITEM');
      expect(await run('confirm_action', { action_id: update.action_id })).toMatchObject({ success: true });
      expect((await buyer.client.cart.get()).shops[0]!.items[0]!.quantity).toBe(2);

      const checkout = actionCard(await run('place_order', { address_id: buyer.addressId }));
      expect(checkout).toMatchObject({ type: 'PLACE_ORDER', status: 'PENDING', requires_tap: true });
      expect(await run('confirm_action')).toMatchObject({ success: false });
      expect(await run('confirm_action', { action_id: checkout.action_id })).toMatchObject({ success: false, text: expect.stringMatching(/tap/i) });
      expect(await prisma.order.count({ where: { buyerId: user.id } })).toBe(0);

      const confirmed = await actions.confirm(checkout.action_id, user.id, conversation.id, true, randomUUID());
      expect(confirmed.status).toBe('EXECUTED');
      orderSn = String(confirmed.result?.order_sn);
      expect((await buyer.client.buyer.orders.get(orderSn)).items[0]).toMatchObject({ model_id: 3000306, quantity: 2 });
      expect((await buyer.client.cart.get()).item_count).toBe(0);
    } finally {
      if (orderSn) await buyer.client.buyer.orders.cancel(orderSn, 'Context regression cleanup');
      await prisma.pendingAction.updateMany({ where: { conversationId: conversation.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'ENDED', endedAt: new Date() } });
    }
  });

  it('prepares a return with viewed-product context and keeps tap confirmation mandatory', async () => {
    const ctx: ToolContext = { conversationId: randomUUID(), buyerId: SEED.buyers.binh.id, shopId: 880001, viewedItemId: SEED.items.mouse.itemId };
    await prisma.conversation.create({ data: { id: ctx.conversationId, buyerId: ctx.buyerId, shopId: ctx.shopId, channel: 'TEXT' } });
    const before = await prisma.returnRequest.count({ where: { buyerId: ctx.buyerId } });
    try {
      const prepared = actionCard(await tools.run('open_return', {
        order_sn: 'DEMOSEEDZ001',
        items: [{ item_id: SEED.items.mouse.itemId, model_id: SEED.items.mouse.blackModel, quantity: 1 }],
        reason: 'ITEM_DAMAGED', solution: 'RETURN_REFUND',
      }, ctx));
      expect(prepared).toMatchObject({ type: 'OPEN_RETURN', status: 'PENDING', requires_tap: true });
      expect(await tools.run('confirm_action', {}, ctx)).toMatchObject({ success: false });
      expect(await tools.run('confirm_action', { action_id: prepared.action_id }, ctx)).toMatchObject({ success: false, text: expect.stringMatching(/tap/i) });
      expect(await prisma.returnRequest.count({ where: { buyerId: ctx.buyerId } })).toBe(before);
    } finally {
      await prisma.pendingAction.updateMany({ where: { conversationId: ctx.conversationId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      await prisma.conversation.update({ where: { id: ctx.conversationId }, data: { status: 'ENDED', endedAt: new Date() } });
    }
  });
});
