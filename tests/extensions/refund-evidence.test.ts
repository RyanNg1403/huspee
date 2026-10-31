import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { HuspeeClient, type CreateReturnInput, type PendingActionView, type ReturnEvidence } from '@huspee/sdk';
import { db, newBuyer, connectViaDashboard } from '../helpers/fixtures.js';
import { API, DATABASE_URL, SEED, DEMO_PASSWORD } from '../helpers/env.js';
import { PrismaService } from '../../apps/api/src/common/prisma.service.js';
import { DomainError } from '../../apps/api/src/common/errors.js';
import { PushService } from '../../apps/api/src/domain/push.service.js';
import { ReturnService } from '../../apps/api/src/domain/return.service.js';
import { ActionsService } from '../../apps/api/src/assistant/actions.service.js';
import { AssistantEvents } from '../../apps/api/src/assistant/assistant.events.js';

const prisma = new PrismaService({ datasourceUrl: DATABASE_URL });
afterAll(() => prisma.$disconnect());

let bytes: Buffer;
let seller: HuspeeClient;
let otherSeller: HuspeeClient;
beforeAll(async () => {
  bytes = await readFile(new URL('../../apps/api/prisma/generated-images/2000106-0.webp', import.meta.url));
  seller = new HuspeeClient({ baseUrl: API, surface: 'seller', cookieJar: true });
  otherSeller = new HuspeeClient({ baseUrl: API, surface: 'seller', cookieJar: true });
  await seller.auth.login(SEED.sellers.techzone.email, DEMO_PASSWORD);
  await connectViaDashboard(seller, SEED.sellers.techzone.shopId);
  await otherSeller.auth.login(SEED.sellers.glowup.email, DEMO_PASSWORD);
});
type Output = { success: boolean; text: string; card?: { action: PendingActionView }; readback?: { vi: string; en: string } };
const blob = () => new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
async function setup(status = 'COMPLETED') {
  const buyer = await newBuyer();
  const buyerId = (await db().query<{ id: number }>('SELECT id FROM users WHERE email=$1', [buyer.email])).rows[0]!.id;
  const placed = await buyer.client.checkout.placeOrder({ address_id: buyer.addressId, items: [{ model_id: SEED.items.mouse.blackModel, quantity: 2 }], payment_method: 'COD' });
  const orderSn = placed.order_sn_list[0]!;
  // Isolated test fixture only; real-session tests use existing delivered orders without rewriting dates.
  await db().query('UPDATE orders SET status=$1, completed_at=NOW() WHERE order_sn=$2', [status, orderSn]);
  const conversationId = randomUUID();
  await db().query("INSERT INTO conversations (id,shop_id,buyer_id,channel,status,started_at) VALUES ($1,$2,$3,'TEXT','ACTIVE',NOW())", [conversationId, SEED.sellers.techzone.shopId, buyerId]);
  const input: CreateReturnInput = { order_sn: orderSn, items: [{ item_id: SEED.items.mouse.itemId, model_id: SEED.items.mouse.blackModel, quantity: 1 }], reason: 'ITEM_DAMAGED', solution: 'REFUND_ONLY' };
  const run = (name: string, args: unknown = {}) => buyer.client.http.request<Output>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });
  const upload = () => buyer.client.buyer.returnEvidence.upload(orderSn, blob());
  const select = (evidence: ReturnEvidence[]) => buyer.client.assistant.returnEvidence.setSelection(conversationId, { order_sn: orderSn, evidence_ids: evidence.map((row) => row.evidence_id) });
  return { ...buyer, buyerId, orderSn, conversationId, input, run, upload, select };
}
function action(output: Output) { expect(output.success, output.text).toBe(true); expect(output.card).toBeDefined(); return output.card!.action; }
async function gateway(path: string, params: unknown) {
  const result = await seller.seller.shopee.call(SEED.sellers.techzone.shopId, path, params as Record<string, unknown>) as { error: string };
  if (result.error) throw new Error(result.error);
}

describe('private refund evidence and exact buyer consent', () => {
  it('accepts a 24 megapixel phone photo under the byte limit and bounds the stored resolution', async () => {
    const f = await setup();
    const phone = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: '#cccccc' } }).jpeg().toBuffer();
    expect(phone.length).toBeLessThan(5 * 1024 * 1024);
    const photo = await f.client.buyer.returnEvidence.upload(f.orderSn, new Blob([new Uint8Array(phone)], { type: 'image/jpeg' }));
    const normalized = await f.client.buyer.returnEvidence.content(photo.evidence_id);
    const meta = await sharp(Buffer.from(await normalized.arrayBuffer())).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });
  it('keeps valid consent when an unselected draft is deleted or the identical selection is saved', async () => {
    const f = await setup(); const first = await f.upload(), unused = await f.upload();
    await f.select([first]);
    const pending = action(await f.run('open_return', f.input));
    await f.client.buyer.returnEvidence.remove(unused.evidence_id);
    await f.select([first]);
    expect((await db().query('SELECT status FROM pending_actions WHERE id=$1', [pending.action_id])).rows[0]).toMatchObject({ status: 'PENDING' });
    await f.client.assistant.actions.confirm(pending.action_id, randomUUID());
    expect((await f.client.buyer.returns.list()).data[0]!.evidence.map((row) => row.evidence_id)).toEqual([first.evidence_id]);
  });
  it('keeps card, buyer and seller photo numbering consistent for a reversed selection', async () => {
    const f = await setup(); const photos = [await f.upload(), await f.upload()];
    await f.select([...photos].reverse());
    const pending = action(await f.run('open_return', f.input));
    expect(pending.summary.evidence!.evidence_ids).toEqual(photos.map((photo) => photo.evidence_id));
    await f.select(photos);
    expect((await prisma.pendingAction.findUniqueOrThrow({ where: { id: pending.action_id } })).status).toBe('PENDING');
    const result = await f.client.assistant.actions.confirm(pending.action_id, randomUUID());
    const returnSn = String(result.action.result!.return_sn);
    expect((await f.client.buyer.returns.get(returnSn)).evidence.map((photo) => photo.evidence_id)).toEqual(pending.summary.evidence!.evidence_ids);
    expect((await f.client.buyer.returns.list()).data.find((entry) => entry.return_sn === returnSn)!.evidence.map((photo) => photo.evidence_id)).toEqual(pending.summary.evidence!.evidence_ids);
    expect((await seller.seller.returnEvidence.list(880001, returnSn)).map((photo) => photo.evidence_id)).toEqual(pending.summary.evidence!.evidence_ids);
  });
  it('normalizes valid image bytes, omits filenames and protects draft content', async () => {
    const f = await setup();
    const body = new FormData(); body.set('image', blob(), 'CANARY_FILENAME_NEVER_TO_MODEL.webp');
    const photo = await f.client.http.request<ReturnEvidence>('POST', `/api/v1/buyer/orders/${f.orderSn}/return-evidence`, { body });
    expect(Object.keys(photo).sort()).toEqual(['create_time', 'evidence_id', 'return_sn', 'size']);
    const response = await f.client.http.raw(f.client.http.url(`/api/v1/buyer/return-evidence/${photo.evidence_id}/content`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    const normalized = Buffer.from(await response.arrayBuffer());
    expect(normalized.subarray(0, 4).toString()).toBe('RIFF');
    expect(normalized.subarray(8, 12).toString()).toBe('WEBP');
    expect(normalized.length).toBe(photo.size);
    const anonymous = await fetch(`${API}/api/v1/buyer/return-evidence/${photo.evidence_id}/content`);
    expect(anonymous.status).toBe(401);
    const stranger = await newBuyer();
    await expect(stranger.client.buyer.returnEvidence.content(photo.evidence_id)).rejects.toMatchObject({ status: 404 });
    await expect(seller.seller.returnEvidence.content(880001, 'not-submitted', photo.evidence_id)).rejects.toMatchObject({ status: 404 });
    const selected = await f.select([photo]); expect(selected.evidence_ids).toEqual([photo.evidence_id]);
    const quoted = await f.run('get_return_quote', { order_sn: f.orderSn });
    expect(JSON.parse(quoted.text)).toMatchObject({ can_request: true, decision: 'seller', selected_photo_count: 1 });
    const prepared = await f.run('open_return', f.input);
    expect(action(prepared).summary.evidence?.evidence_ids).toEqual([photo.evidence_id]);
    const logs = JSON.stringify({
      calls: await prisma.conversationToolCall.findMany({ where: { conversationId: f.conversationId } }),
      actions: await prisma.pendingAction.findMany({ where: { conversationId: f.conversationId } }),
      messages: await prisma.conversationMessage.findMany({ where: { conversationId: f.conversationId } }),
      selection: selected,
      quote: quoted,
      output: prepared,
    });
    for (const forbidden of ['CANARY_FILENAME', '/content', 'data:image', bytes.toString('base64').slice(0, 100)]) expect(logs).not.toContain(forbidden);
    expect((await db().query('SELECT return_sn FROM returns WHERE order_sn=$1', [f.orderSn])).rowCount).toBe(0);
  });
  it('rejects invalid formats, oversized files, foreign orders and excess draft photos', async () => {
    const f = await setup();
    for (const image of [new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], { type: 'image/png' }), new Blob(['not an image'], { type: 'image/jpeg' })]) {
      await expect(f.client.buyer.returnEvidence.upload(f.orderSn, image)).rejects.toMatchObject({ status: 400 });
    }
    await expect(f.client.buyer.returnEvidence.upload(f.orderSn, new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]))).rejects.toMatchObject({ status: 413 });
    const stranger = await newBuyer();
    await expect(stranger.client.buyer.returnEvidence.upload(f.orderSn, blob())).rejects.toMatchObject({ status: 404 });
    const photos = [];
    for (let i = 0; i < 16; i++) photos.push(await f.upload());
    await expect(f.upload()).rejects.toMatchObject({ status: 400 });
    await expect(f.select(photos.slice(0, 9))).rejects.toMatchObject({ status: 400 });
    await f.client.buyer.returnEvidence.remove(photos[0]!.evidence_id);
    expect((await f.upload()).evidence_id).toBeTruthy();
  });
  it('binds photos only on the final tap and exposes submitted evidence only to the authorized shop', async () => {
    const f = await setup();
    const photo = await f.upload(), draft = await f.upload();
    await f.select([photo]);
    const prepared = action(await f.run('open_return', { ...f.input, text_reason: 'Left / right button\nBuyer reports damage.' }));
    expect((await f.run('confirm_action', { action_id: prepared.action_id })).success).toBe(false);
    const confirmed = await f.client.assistant.actions.confirm(prepared.action_id, randomUUID());
    const returnSn = confirmed.action.result!.return_sn!;
    const request = await f.client.buyer.returns.get(returnSn);
    expect(request).toMatchObject({ status: 'REQUESTED', refund_paid: false });
    expect(request.evidence.map((row) => row.evidence_id)).toEqual([photo.evidence_id]);
    expect(await seller.seller.returnEvidence.list(880001, returnSn)).toEqual(request.evidence);
    const response = await seller.http.raw(seller.http.url(`/api/v1/seller/shops/880001/returns/${returnSn}/evidence/${photo.evidence_id}/content`), { headers: { cookie: `${f.client.http.cookieHeader()}; ${seller.http.cookieHeader()}` } });
    expect(response.status).toBe(200);
    await expect(seller.seller.returnEvidence.content(880001, returnSn, draft.evidence_id)).rejects.toMatchObject({ status: 404 });
    await expect(otherSeller.seller.returnEvidence.content(880001, returnSn, photo.evidence_id)).rejects.toMatchObject({ status: 404 });
    await expect(f.client.buyer.returnEvidence.remove(photo.evidence_id)).rejects.toMatchObject({ status: 404 });
    const compat = await seller.seller.shopee.call(880001, '/returns/get_return_detail', { return_sn: returnSn }) as { response: { image: string[] } };
    expect(compat.response.image).toEqual([]);
    expect(JSON.parse((await f.run('get_return_status', { return_sn: returnSn })).text)[0]).toMatchObject({ status: 'REQUESTED', refund_paid: false, photo_count: 1, decision: 'seller' });
  });
  it('keeps note text intact and makes photo-only edits replace old consent', async () => {
    const f = await setup();
    const one = await f.upload(), two = await f.upload();
    await f.select([one]);
    const note = 'Left / right button\nBuyer reports damage.';
    const output = await f.run('open_return', { ...f.input, text_reason: note });
    expect(output.readback?.vi).toContain(note);
    const original = action(output);
    const edited = await f.client.assistant.actions.edit(original.action_id, { evidence_ids: [two.evidence_id] });
    expect(edited.action.summary.evidence?.evidence_ids).toEqual([two.evidence_id]);
    expect(edited.action.summary.lines.some((line) => line.value === note)).toBe(true);
    await expect(f.client.assistant.actions.confirm(original.action_id, randomUUID())).rejects.toMatchObject({ status: 409 });
    const result = await f.client.assistant.actions.confirm(edited.action.action_id, randomUUID());
    expect((await f.client.buyer.returns.get(result.action.result!.return_sn!)).evidence.map((row) => row.evidence_id)).toEqual([two.evidence_id]);
  });
  it('rejects foreign evidence and prevents a selection change or deletion from executing an older card', async () => {
    const f = await setup(), foreign = await setup();
    const photo = await f.upload(), other = await foreign.upload();
    await expect(f.select([other])).rejects.toMatchObject({ status: 409 });
    await expect(f.client.buyer.returns.create({ ...f.input, evidence_ids: [other.evidence_id] })).rejects.toMatchObject({ status: 409 });
    await f.select([photo]); const pending = action(await f.run('open_return', f.input));
    await f.client.buyer.returnEvidence.remove(photo.evidence_id);
    expect((await prisma.pendingAction.findUniqueOrThrow({ where: { id: pending.action_id } })).status).toBe('CANCELLED');
    await expect(f.client.assistant.actions.confirm(pending.action_id, randomUUID())).rejects.toMatchObject({ status: 409 });
    expect((await db().query('SELECT return_sn FROM returns WHERE order_sn=$1', [f.orderSn])).rowCount).toBe(0);
    expect((await db().query('SELECT id FROM return_evidence WHERE return_sn IS NOT NULL AND buyer_id=$1', [f.buyerId])).rowCount).toBe(0);
    expect((await f.run('open_return', { ...f.input, evidence_ids: [] })).success).toBe(false);
  });
  it('allows only one side of a draft deletion versus submission race to commit', async () => {
    const f = await setup(); const photo = await f.upload();
    const results = await Promise.allSettled([f.client.buyer.returns.create({ ...f.input, evidence_ids: [photo.evidence_id] }), f.client.buyer.returnEvidence.remove(photo.evidence_id)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const row = (await db().query<{ return_sn: string | null }>('SELECT return_sn FROM return_evidence WHERE id=$1', [photo.evidence_id])).rows[0];
    const requests = (await db().query('SELECT return_sn FROM returns WHERE order_sn=$1', [f.orderSn])).rows;
    if (row) { expect(row.return_sn).toBeTruthy(); expect(requests).toHaveLength(1); }
    else expect(requests).toHaveLength(0);
  });
  it('uses machine eligibility rules without creating an action or deciding from evidence', async () => {
    const f = await setup();
    await db().query("UPDATE orders SET completed_at=NOW()-INTERVAL '30 days' WHERE order_sn=$1", [f.orderSn]);
    const quote = await f.run('get_return_quote', { order_sn: f.orderSn });
    expect(JSON.parse(quote.text)).toMatchObject({ can_request: false, blocked_code: 'RETURN_WINDOW', decision: 'seller', refund_estimate: null });
    expect((await db().query('SELECT id FROM pending_actions WHERE conversation_id=$1', [f.conversationId])).rowCount).toBe(0);
    expect((await f.client.buyer.orders.get(f.orderSn)).actions.can_request_return).toBe(false);
  });
  it('cancels submitted requests only with a tap and restores the original receipt state', async () => {
    const f = await setup('TO_CONFIRM_RECEIVE');
    const photo = await f.upload();
    const request = await f.client.buyer.returns.create({ ...f.input, evidence_ids: [photo.evidence_id] });
    await gateway('/returns/offer', { return_sn: request.return_sn, proposed_solution: 'refund', proposed_adjusted_refund_amount: 100000 });
    const pending = action(await f.run('prepare_return_cancellation', { return_sn: request.return_sn }));
    expect(pending.summary.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Đề nghị của shop / Seller offer' }),
      expect.objectContaining({ label: 'Ảnh đã gửi / Submitted photos' }),
    ]));
    expect(JSON.parse((await f.run('get_return_quote', { order_sn: f.orderSn })).text)).toMatchObject({ can_request: false, blocked_code: 'OPEN_RETURN' });
    expect((await f.run('confirm_action', { action_id: pending.action_id })).success).toBe(false);
    const key = randomUUID();
    await f.client.assistant.actions.confirm(pending.action_id, key);
    await f.client.assistant.actions.confirm(pending.action_id, key);
    expect((await f.client.buyer.returns.get(request.return_sn)).status).toBe('CANCELLED');
    expect((await f.client.buyer.orders.get(f.orderSn)).status).toBe('TO_CONFIRM_RECEIVE');
    expect((await seller.seller.returnEvidence.list(880001, request.return_sn)).map((row) => row.evidence_id)).toEqual([photo.evidence_id]);
  });
  it('accepts an unexpired seller offer with a fresh tap and rejects expired offers in REST and tools', async () => {
    const f = await setup(); const request = await f.client.buyer.returns.create(f.input);
    await gateway('/returns/offer', { return_sn: request.return_sn, proposed_solution: 'refund', proposed_adjusted_refund_amount: 100000 });
    const pending = action(await f.run('prepare_offer_acceptance', { return_sn: request.return_sn }));
    expect(pending.summary.total).toBe(100000);
    expect(pending.summary.lines).toContainEqual(expect.objectContaining({ label: 'Hạn đề nghị (UTC) / Offer deadline (UTC)' }));
    await db().query("UPDATE returns SET negotiation=jsonb_set(negotiation,'{offer_due_date}','1'),version=version+1 WHERE return_sn=$1", [request.return_sn]);
    await expect(f.client.assistant.actions.confirm(pending.action_id, randomUUID())).rejects.toMatchObject({ status: 409 });
    await expect(f.client.buyer.returns.acceptOffer(request.return_sn)).rejects.toMatchObject({ status: 409 });
    expect((await f.run('prepare_offer_acceptance', { return_sn: request.return_sn })).success).toBe(false);
    await db().query("UPDATE returns SET negotiation=jsonb_set(negotiation,'{offer_due_date}',to_jsonb(extract(epoch FROM NOW()+INTERVAL '1 day')::bigint)),version=version+1 WHERE return_sn=$1", [request.return_sn]);
    const fresh = action(await f.run('prepare_offer_acceptance', { return_sn: request.return_sn }));
    const key = randomUUID();
    await f.client.assistant.actions.confirm(fresh.action_id, key);
    await f.client.assistant.actions.confirm(fresh.action_id, key);
    expect(await f.client.buyer.returns.get(request.return_sn)).toMatchObject({ status: 'ACCEPTED', refund_amount: 100000, refund_paid: true, seller_offer: null });
  });
  it.each(['dispute', 'confirm'])('keeps seller %s and a concurrent offer acceptance mutually exclusive', async (decision) => {
    const f = await setup(); const request = await f.client.buyer.returns.create(f.input);
    await gateway('/returns/offer', { return_sn: request.return_sn, proposed_solution: 'refund', proposed_adjusted_refund_amount: 100000 });
    const pending = action(await f.run('prepare_offer_acceptance', { return_sn: request.return_sn }));
    const results = await Promise.allSettled([f.client.assistant.actions.confirm(pending.action_id, randomUUID()), gateway(`/returns/${decision}`, { return_sn: request.return_sn, ...(decision === 'dispute' ? { email: SEED.sellers.techzone.email, dispute_reason_id: 2, images: [] } : {}) })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const state = await f.client.buyer.returns.get(request.return_sn);
    const status = (await db().query<{ status: string }>('SELECT status FROM pending_actions WHERE id=$1', [pending.action_id])).rows[0]!.status;
    if (status === 'EXECUTED') expect(state).toMatchObject({ status: 'ACCEPTED', refund_amount: 100000 });
    else expect(state).toMatchObject(decision === 'dispute' ? { status: 'JUDGING', refund_paid: false } : { status: 'ACCEPTED', refund_amount: 349000, refund_paid: true });
  });
  it('cleans expired drafts without changing an already submitted photo', async () => {
    const f = await setup(); const attached = await f.upload();
    const request = await f.client.buyer.returns.create({ ...f.input, evidence_ids: [attached.evidence_id] });
    const draft = await f.upload();
    await db().query("UPDATE return_evidence SET created_at=NOW()-INTERVAL '2 days' WHERE id=ANY($1::uuid[])", [[attached.evidence_id, draft.evidence_id]]);
    const another = await f.client.checkout.placeOrder({ address_id: f.addressId, items: [{ model_id: SEED.items.mouse.blackModel, quantity: 1 }], payment_method: 'COD' });
    await f.client.buyer.returnEvidence.upload(another.order_sn_list[0]!, blob());
    expect((await db().query('SELECT id FROM return_evidence WHERE id=$1', [draft.evidence_id])).rowCount).toBe(0);
    expect((await seller.seller.returnEvidence.list(880001, request.return_sn)).map((row) => row.evidence_id)).toEqual([attached.evidence_id]);
  });
  it('rejects natural offer expiry without any write changing the prepared snapshot', async () => {
    const f = await setup(); const request = await f.client.buyer.returns.create(f.input);
    await gateway('/returns/offer', { return_sn: request.return_sn, proposed_solution: 'refund', proposed_adjusted_refund_amount: 100000 });
    const deadline = Math.floor(Date.now() / 1000) + 5;
    await db().query("UPDATE returns SET negotiation=jsonb_set(negotiation,'{offer_due_date}',to_jsonb($2::bigint)) WHERE return_sn=$1", [request.return_sn, deadline]);
    const pending = action(await f.run('prepare_offer_acceptance', { return_sn: request.return_sn }));
    const before = (await db().query('SELECT version,updated_at,negotiation FROM returns WHERE return_sn=$1', [request.return_sn])).rows[0];
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline * 1000 - Date.now() + 100)));
    await expect(f.client.assistant.actions.confirm(pending.action_id, randomUUID())).rejects.toMatchObject({ status: 409 });
    await expect(f.client.buyer.returns.acceptOffer(request.return_sn)).rejects.toMatchObject({ status: 409 });
    expect((await db().query('SELECT version,updated_at,negotiation FROM returns WHERE return_sn=$1', [request.return_sn])).rows[0]).toEqual(before);
    expect(await f.client.buyer.returns.get(request.return_sn)).toMatchObject({ status: 'REQUESTED', refund_paid: false, seller_offer: null });
  });
  it.each(['OPEN_RETURN', 'CANCEL_RETURN', 'ACCEPT_RETURN_OFFER'] as const)('allows retrying %s after a transient transaction conflict', async (type) => {
    const f = await setup();
    const returns = new ReturnService(prisma, new PushService(prisma));
    const actions = new ActionsService(prisma, new AssistantEvents(), undefined as never, returns);
    let pending: PendingActionView;
    if (type === 'OPEN_RETURN') pending = action(await f.run('open_return', f.input));
    else {
      const request = await f.client.buyer.returns.create(f.input);
      if (type === 'ACCEPT_RETURN_OFFER') await gateway('/returns/offer', { return_sn: request.return_sn, proposed_solution: 'refund', proposed_adjusted_refund_amount: 100000 });
      pending = action(await f.run(type === 'CANCEL_RETURN' ? 'prepare_return_cancellation' : 'prepare_offer_acceptance', { return_sn: request.return_sn }));
    }
    const conflict = new DomainError('CONFLICT', 'Transient serialization conflict');
    const spy = type === 'OPEN_RETURN' ? vi.spyOn(returns, 'create').mockRejectedValueOnce(conflict) : vi.spyOn(returns, 'confirmBuyerAction').mockRejectedValueOnce(conflict);
    const key = randomUUID();
    try {
      await expect(actions.confirm(pending.action_id, f.buyerId, f.conversationId, true, key)).rejects.toBe(conflict);
      expect((await prisma.pendingAction.findUniqueOrThrow({ where: { id: pending.action_id } })).status).toBe('PENDING');
      expect((await actions.confirm(pending.action_id, f.buyerId, f.conversationId, true, key)).status).toBe('EXECUTED');
    } finally { spy.mockRestore(); }
  });
  it.each(['offer', 'confirm', 'dispute'])('keeps cancellation and concurrent seller %s mutually exclusive', async (decision) => {
    const f = await setup(); const request = await f.client.buyer.returns.create(f.input);
    const pending = action(await f.run('prepare_return_cancellation', { return_sn: request.return_sn }));
    const key = randomUUID();
    const args = { return_sn: request.return_sn, ...(decision === 'offer' ? { proposed_solution: 'refund', proposed_adjusted_refund_amount: 100000 } : decision === 'dispute' ? { email: SEED.sellers.techzone.email, dispute_reason_id: 2, images: [] } : {}) };
    const results = await Promise.allSettled([f.client.assistant.actions.confirm(pending.action_id, key), gateway(`/returns/${decision}`, args)]);
    expect(results.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    const ret = await f.client.buyer.returns.get(request.return_sn), order = await f.client.buyer.orders.get(f.orderSn);
    if (ret.status === 'CANCELLED') { expect(order.status).toBe('COMPLETED'); expect(ret.refund_paid).toBe(false); }
    else {
      expect(ret.status).toBe(decision === 'confirm' ? 'ACCEPTED' : decision === 'dispute' ? 'JUDGING' : 'REQUESTED');
      expect(ret.refund_paid).toBe(decision === 'confirm');
      expect(order.status).toBe(decision === 'confirm' ? 'COMPLETED' : 'TO_RETURN');
      await expect(f.client.assistant.actions.confirm(pending.action_id, key)).rejects.toMatchObject({ status: 409 });
    }
  });
  it.each(['CANCEL_RETURN', 'ACCEPT_RETURN_OFFER'] as const)('keeps %s and the opposite REST operation mutually exclusive', async (type) => {
    const f = await setup(); const request = await f.client.buyer.returns.create(f.input);
    await gateway('/returns/offer', { return_sn: request.return_sn, proposed_solution: 'refund', proposed_adjusted_refund_amount: 100000 });
    const pending = action(await f.run(type === 'CANCEL_RETURN' ? 'prepare_return_cancellation' : 'prepare_offer_acceptance', { return_sn: request.return_sn }));
    const results = await Promise.allSettled([f.client.assistant.actions.confirm(pending.action_id, randomUUID()), type === 'CANCEL_RETURN' ? f.client.buyer.returns.acceptOffer(request.return_sn) : f.client.buyer.returns.cancel(request.return_sn)]);
    expect(results.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    const ret = await f.client.buyer.returns.get(request.return_sn);
    expect(['CANCELLED', 'ACCEPTED']).toContain(ret.status);
    expect(ret.refund_paid).toBe(ret.status === 'ACCEPTED');
    expect((await f.client.buyer.orders.get(f.orderSn)).status).toBe('COMPLETED');
  });
  it.each(['OPEN_RETURN', 'CANCEL_RETURN', 'ACCEPT_RETURN_OFFER'] as const)('commits %s only once for concurrent taps with different keys', async (type) => {
    const f = await setup(); let pending: PendingActionView;
    if (type === 'OPEN_RETURN') pending = action(await f.run('open_return', f.input));
    else {
      const request = await f.client.buyer.returns.create(f.input);
      if (type === 'ACCEPT_RETURN_OFFER') await gateway('/returns/offer', { return_sn: request.return_sn, proposed_solution: 'refund', proposed_adjusted_refund_amount: 100000 });
      pending = action(await f.run(type === 'CANCEL_RETURN' ? 'prepare_return_cancellation' : 'prepare_offer_acceptance', { return_sn: request.return_sn }));
    }
    const keys = [randomUUID(), randomUUID()];
    const results = await Promise.allSettled(keys.map((key) => f.client.assistant.actions.confirm(pending.action_id, key)));
    expect(results.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    const row = await prisma.pendingAction.findUniqueOrThrow({ where: { id: pending.action_id } });
    expect(row.status).toBe('EXECUTED');
    expect(keys).toContain(row.idempotencyKey);
    expect((await db().query('SELECT return_sn FROM returns WHERE order_sn=$1', [f.orderSn])).rowCount).toBe(1);
    expect((await f.client.buyer.orders.get(f.orderSn)).status).toBe(type === 'OPEN_RETURN' ? 'TO_RETURN' : 'COMPLETED');
  });
  it('rejects cross-shop/conversation selections, foreign return actions, duplicate photos and combined counts', async () => {
    const f = await setup(), foreign = await setup(); const photo = await f.upload();
    await expect(f.client.assistant.returnEvidence.setSelection(foreign.conversationId, { order_sn: f.orderSn, evidence_ids: [photo.evidence_id] })).rejects.toMatchObject({ status: 404 });
    const placed = await f.client.checkout.placeOrder({ address_id: f.addressId, items: [{ model_id: SEED.items.cocoon.modelId, quantity: 1 }], payment_method: 'COD' });
    const otherOrder = placed.order_sn_list[0]!;
    await expect(f.client.assistant.returnEvidence.setSelection(f.conversationId, { order_sn: otherOrder, evidence_ids: [] })).rejects.toMatchObject({ status: 404 });
    await db().query("UPDATE orders SET status='COMPLETED',completed_at=NOW() WHERE order_sn=$1", [otherOrder]);
    const otherReturn = await f.client.buyer.returns.create({ order_sn: otherOrder, reason: 'ITEM_DAMAGED', solution: 'REFUND_ONLY' });
    expect((await f.run('prepare_return_cancellation', { return_sn: otherReturn.return_sn })).success).toBe(false);
    await f.select([photo]); const pending = action(await f.run('open_return', f.input));
    await expect(f.client.assistant.actions.edit(pending.action_id, { evidence_ids: [photo.evidence_id, photo.evidence_id] })).rejects.toMatchObject({ status: 400 });
    await expect(f.client.buyer.returns.create({ ...f.input, evidence_ids: [photo.evidence_id], image_urls: Array.from({ length: 8 }, (_, i) => `https://example.com/${i}.png`) })).rejects.toMatchObject({ status: 400 });
  });
  it('does not drop the photo selection for another order when a no-photo request is submitted', async () => {
    const f = await setup(); const photo = await f.upload(); await f.select([photo]);
    const placed = await f.client.checkout.placeOrder({ address_id: f.addressId, items: [{ model_id: SEED.items.mouse.blackModel, quantity: 1 }], payment_method: 'COD' });
    const orderSn = placed.order_sn_list[0]!;
    await db().query("UPDATE orders SET status='COMPLETED',completed_at=NOW() WHERE order_sn=$1", [orderSn]);
    const pending = action(await f.run('open_return', { ...f.input, order_sn: orderSn }));
    await f.client.assistant.actions.confirm(pending.action_id, randomUUID());
    expect(await f.client.assistant.returnEvidence.getSelection(f.conversationId)).toMatchObject({ order_sn: f.orderSn, evidence_ids: [photo.evidence_id] });
  });
});
