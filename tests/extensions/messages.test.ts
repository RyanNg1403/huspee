import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEED } from '../helpers/env.js';
import { db, loginAs, newBuyer } from '../helpers/fixtures.js';

describe('assistant handoff messages', () => {
  it('creates a handoff, delivers the seller reply and isolates other buyers and shops', async () => {
    const { client, email } = await newBuyer();
    const buyer = await db().query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    const id = randomUUID();
    const shopId = SEED.sellers.techzone.shopId;
    await db().query('INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, $4, $5, NOW())', [
      id,
      shopId,
      buyer.rows[0]!.id,
      'TEXT',
      'ACTIVE',
    ]);
    const result = await client.http.request<{ card: { ticket_id: number } }>('POST', '/api/v1/assistant/_debug/tools/handoff_to_seller', {
      body: { conversation_id: id, args: { question: 'Can you advise?', reason: 'Not in FAQ' } },
    });
    const ticketId = result.card.ticket_id;
    const listed = (await client.buyer.messages.list()).data.find((ticket) => ticket.ticket_id === ticketId);
    expect(listed).toBeDefined();
    expect(listed).toHaveProperty('logo_url');
    const other = await loginAs(SEED.buyers.binh.email);
    await expect(other.buyer.messages.get(ticketId)).rejects.toMatchObject({ status: 404 });
    await expect(other.buyer.messages.reply(ticketId, 'Not my ticket')).rejects.toMatchObject({ status: 404 });
    const wrongSeller = await loginAs(SEED.sellers.glowup.email);
    await expect(wrongSeller.seller.inbox.get(shopId, ticketId)).rejects.toMatchObject({ status: 403 });
    const seller = await loginAs(SEED.sellers.techzone.email);
    expect((await seller.seller.inbox.list(shopId)).data.some((ticket) => ticket.ticket_id === ticketId)).toBe(true);
    expect((await seller.seller.inbox.get(shopId, ticketId)).seller_unread).toBe(0);
    await seller.seller.inbox.reply(shopId, ticketId, 'We will help.');
    expect((await client.buyer.messages.unreadCount()).count).toBe(1);
    const ticket = await client.buyer.messages.get(ticketId);
    expect(ticket.status).toBe('ANSWERED');
    expect(ticket.messages.at(-1)?.body).toBe('We will help.');
    expect((await client.buyer.messages.unreadCount()).count).toBe(0);
    await client.buyer.messages.reply(ticketId, 'Thanks.');
    expect((await seller.seller.inbox.get(shopId, ticketId)).status).toBe('OPEN');
    expect((await seller.seller.inbox.close(shopId, ticketId)).status).toBe('CLOSED');
    await expect(client.buyer.messages.reply(ticketId, 'Again')).rejects.toMatchObject({ status: 409 });
  });
});
