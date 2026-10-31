// Seller Centre inbox and conversation review, end to end against a running API and seller-web.
// The API needs ASSISTANT_TOOL_DEBUG=true; DATABASE_URL is the API's database, used only to open a
// buyer conversation the way the voice runtime would (no Codex is started).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium, request } from 'playwright-core';

const pg = createRequire(new URL('../package.json', import.meta.url))('pg');
const API_URL = process.env.API_URL || 'http://localhost:3000';
const WEB_URL = process.env.WEB_URL;
const SELLER_URL = process.env.SELLER_URL || 'http://localhost:3002';
const DATABASE_URL = process.env.DATABASE_URL;
const SHOTS = process.env.SCREENSHOT_DIR;
const TECHZONE = 880001;
assert.ok(DATABASE_URL, 'Set DATABASE_URL to the database of the API under test');

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
  console.log(`PASS ${message}`);
}
async function shot(page, name) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
async function sellerLogin(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(20000);
  await context.addCookies([{ name: 'huspee_lang', value: 'vi', url: SELLER_URL }]);
  const page = await context.newPage();
  await page.goto(`${SELLER_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('Password123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL((url) => url.pathname === '/');
  return { context, page };
}
async function sellerStatus(page, path) {
  return page.evaluate(async (target) => (await fetch(target, { headers: { 'X-Huspee-Surface': 'seller' } })).status, path);
}

const marker = `UI-${Date.now().toString(36)}`;
const question = `Shop có gói quà không? ${marker}`;
const replyText = `Shop có gói quà miễn phí ${marker}`;
const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
const buyerApi = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'x-requested-with': 'huspee-sdk' } });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  // Buyer asks the TechZone assistant something only the seller can answer.
  // A new buyer each run, so the handoff opens a new ticket instead of joining an open one.
  const buyerEmail = `inbox-${marker.toLowerCase()}@test.huspee.vn`;
  const signup = await buyerApi.post('/api/v1/auth/signup', {
    data: { email: buyerEmail, password: 'Password123!', name: 'Khách Hàng Test', account_type: 'buyer' },
  });
  check(signup.ok(), 'buyer signs up through the API');
  const buyerId = (await signup.json()).data.user_id;
  const conversationId = randomUUID();
  await db.query(
    `INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at, language) VALUES ($1, $2, $3, 'TEXT', 'ACTIVE', NOW() AT TIME ZONE 'UTC' - interval '2 minutes', 'vi')`,
    [conversationId, TECHZONE, buyerId],
  );
  await db.query(
    `INSERT INTO conversation_messages (conversation_id, role, text, created_at) VALUES ($1, 'USER', $2, NOW() AT TIME ZONE 'UTC' - interval '1 second'), ($1, 'ASSISTANT', $3, NOW() AT TIME ZONE 'UTC')`,
    [conversationId, question, 'Shop chưa có thông tin về gói quà, mình gửi câu hỏi cho shop nhé.'],
  );
  const tool = async (name, args) => {
    const response = await buyerApi.post(`/api/v1/assistant/_debug/tools/${name}`, { data: { conversation_id: conversationId, args } });
    assert.ok(response.ok(), `debug tool ${name} answered ${response.status()}; run the API with ASSISTANT_TOOL_DEBUG=true`);
    return (await response.json()).data;
  };
  const details = await tool('get_product_details', { item_id: 2000103 });
  check(details.success && details.card?.kind === 'product', 'assistant looks up a TechZone product');
  const handoff = await tool('handoff_to_seller', { question, reason: 'Không có thông tin về gói quà.' });
  const ticketId = handoff.card.ticket_id;
  check(Number.isInteger(ticketId), 'assistant hands the question to the seller inbox');
  await db.query(`UPDATE conversations SET status = 'ENDED', ended_at = NOW() AT TIME ZONE 'UTC' WHERE id = $1`, [conversationId]);

  // TechZone answers in the inbox.
  const techzone = await sellerLogin(browser, 'huy.techzone@example.com');
  const seller = techzone.page;
  await seller.goto(`${SELLER_URL}/inbox`, { waitUntil: 'networkidle' });
  const row = seller.getByRole('link', { name: new RegExp(marker) });
  await row.waitFor();
  check(await row.isVisible(), 'inbox lists the new question');
  await shot(seller, 'inbox-list');
  await row.click();
  await seller.waitForURL((url) => url.pathname === `/inbox/${ticketId}`);
  const detail = seller.getByRole('region', { name: 'Câu hỏi đang xem' });
  await detail.getByText(question, { exact: true }).waitFor();
  check(await detail.getByText(/Lý do trợ lý chuyển/).isVisible(), 'ticket shows the handoff reason');
  await detail.getByText(/Đoạn hội thoại gửi kèm \(2 câu\)/).click();
  check(await detail.getByText('Shop chưa có thông tin về gói quà, mình gửi câu hỏi cho shop nhé.').isVisible(), 'ticket shows the transcript excerpt');
  await detail.getByLabel('Trả lời', { exact: true }).fill(replyText);
  await detail.getByRole('button', { name: 'Gửi', exact: true }).click();
  await detail.getByText(/Bạn trả lời · .* · người mua chưa xem/).waitFor();
  check(await detail.locator('p', { hasText: replyText }).isVisible(), 'reply shows in the thread, not yet seen by the buyer');
  check(await detail.locator('header').getByText('Đã trả lời').isVisible(), 'ticket becomes answered');
  await shot(seller, 'inbox-answered');

  // The buyer reads the reply on their Messages page.
  const buyerTicket = await (await buyerApi.get(`/api/v1/buyer/messages/${ticketId}`)).json();
  check(buyerTicket.data.status === 'ANSWERED' && buyerTicket.data.messages.at(-1).body === replyText, 'buyer receives the seller reply');
  if (WEB_URL) {
    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await buyerPage.locator('input[name=email]').fill(buyerEmail);
    await buyerPage.locator('input[name=password]').fill('Password123!');
    await buyerPage.locator('button[type=submit]').click();
    await buyerPage.waitForURL((url) => !url.pathname.startsWith('/login'));
    await buyerPage.goto(`${WEB_URL}/messages/${ticketId}`, { waitUntil: 'networkidle' });
    await buyerPage.getByText(replyText).first().waitFor();
    check(true, 'buyer Messages page shows the seller reply');
    await buyerContext.close();
  }
  await seller.reload({ waitUntil: 'networkidle' });
  await detail.getByText(/người mua đã xem/).waitFor();
  check(true, 'seller sees that the buyer read the reply');

  await detail.getByRole('button', { name: 'Đóng câu hỏi' }).click();
  await seller.getByRole('dialog').getByRole('button', { name: 'Đóng câu hỏi' }).click();
  await detail.getByText('Câu hỏi đã đóng').waitFor();
  const closed = await (await buyerApi.get(`/api/v1/buyer/messages/${ticketId}`)).json();
  check(closed.data.status === 'CLOSED', 'closing the question closes the buyer ticket');

  // The conversation behind the ticket, with the cards the buyer saw.
  await detail.getByRole('link', { name: 'Xem hội thoại gốc' }).click();
  await seller.waitForURL((url) => url.pathname === `/assistant/conversations/${conversationId}`);
  await seller.getByRole('heading', { name: 'Transcript' }).waitFor();
  check(await seller.getByText(question).first().isVisible(), 'conversation shows the transcript');
  check(await seller.getByText('get_product_details').isVisible(), 'conversation lists the product lookup');
  await seller.getByText(/^Chi tiết sản phẩm · /).click();
  check(await seller.locator('details[open] img').first().isVisible(), 'product card renders as the buyer saw it');
  check(await seller.getByText('Đã chuyển câu hỏi cho shop').isVisible(), 'handoff appears in the transcript');
  const text = await seller.locator('main').innerText();
  check(!text.includes(conversationId) && !/#\d+/.test(text), 'conversation page shows no internal IDs');
  await shot(seller, 'conversation-detail');

  await seller.goto(`${SELLER_URL}/assistant/conversations`, { waitUntil: 'networkidle' });
  const listed = seller.getByRole('row', { name: new RegExp(marker) });
  await listed.waitFor();
  check(await listed.getByText('Chuyển cho shop').isVisible(), 'conversation list shows the observed outcome');
  await shot(seller, 'conversations');

  // Another seller cannot see TechZone's questions or conversations.
  const glowup = await sellerLogin(browser, 'lan.glowup@example.com');
  await glowup.page.goto(`${SELLER_URL}/inbox`, { waitUntil: 'networkidle' });
  check((await glowup.page.getByText(marker).count()) === 0, 'GlowUp inbox does not list the TechZone question');
  await glowup.page.goto(`${SELLER_URL}/assistant/conversations`, { waitUntil: 'networkidle' });
  check((await glowup.page.getByText(marker).count()) === 0, 'GlowUp conversations do not list the TechZone conversation');
  check((await sellerStatus(glowup.page, `/api/v1/seller/shops/${TECHZONE}/inbox/${ticketId}`)) === 403, 'GlowUp cannot open the TechZone ticket');
  check(
    (await sellerStatus(glowup.page, `/api/v1/seller/shops/${TECHZONE}/assistant/conversations/${conversationId}`)) === 403,
    'GlowUp cannot open the TechZone conversation',
  );
  console.log(`Seller inbox smoke: ${checks} checks passed, 0 failed`);
} finally {
  await browser.close();
  await buyerApi.dispose();
  await db.end();
}
