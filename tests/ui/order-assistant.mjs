import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, devices } from 'playwright-core';
import { pollingEventSource, say, signIn } from './assistant-helpers.mjs';

// Opening the shop's assistant from an order page, and an order confirmation that only a tap executes.
const url = process.env.WEB_URL;
assert.ok(url, 'Set WEB_URL to the buyer web app; every assistant route is mocked');
const orderSn = process.env.ORDER_SN || '261003SEEDA001'; // seeded TechZone order of an.nguyen@example.com
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_BIN });
const out = '.token/order-assistant';
await fs.mkdir(out, { recursive: true });

function mockAssistant(page) {
  const state = { starts: [], texts: [], confirms: [], events: [] };
  const id = '00000000-0000-4000-8000-000000000021';
  const pending = {
    action_id: 'order-action', type: 'PLACE_ORDER', status: 'PENDING', requires_tap: true, expires_at: Math.floor(Date.now() / 1000) + 300,
    summary: { title: 'Đặt hàng / Place order', lines: [{ label: 'Củ sạc nhanh Anker 65W GaN 3 cổng', value: '× 1 @ 890000 VND' }, { label: 'Thanh toán / Payment', value: 'COD' }], total: 890000 },
  };
  page.route('**/api/v1/assistant/text/sessions', (route) => {
    state.starts.push(route.request().postDataJSON());
    state.events.length = 0;
    return route.fulfill({ json: { data: { conversation_id: id } } });
  });
  page.route(`**/api/v1/assistant/voice/sessions/${id}/**`, (route) => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/poll')) {
      const after = Number(target.searchParams.get('after') || 0);
      return route.fulfill({ json: { data: { events: state.events.slice(after), cursor: state.events.length, closed: false } } });
    }
    if (target.pathname.endsWith('/context')) return route.fulfill({ json: { data: route.request().postDataJSON() } });
    if (target.pathname.endsWith('/text')) {
      const { text } = route.request().postDataJSON();
      state.texts.push(text);
      state.events.push({ type: 'transcript', role: 'user', text, final: true, source: 'text' });
      if (text.includes(orderSn)) {
        state.events.push({ type: 'tool', name: 'get_order_status', status: 'started' }, { type: 'tool', name: 'get_order_status', status: 'done' });
        state.events.push({ type: 'card', source: 'text', card: { kind: 'order', order_sn: orderSn, status: 'COMPLETED', items: [], tracking: [{ time: 1760000000, description: 'Delivered' }] } });
      }
      if (text === 'Order the charger again') {
        state.events.push({ type: 'tool', name: 'place_order', status: 'started' }, { type: 'tool', name: 'place_order', status: 'done' });
        state.events.push({ type: 'card', source: 'text', card: { kind: 'action', action: pending } });
        // A spoken or typed yes must not place the order.
        state.events.push({ type: 'transcript', role: 'user', text: 'Yes', final: true, source: 'text' });
      }
    }
    return route.fulfill({ json: { data: { ok: true } } });
  });
  page.route('**/api/v1/assistant/actions/*/confirm', (route) => {
    state.confirms.push(route.request().postDataJSON());
    return route.fulfill({ json: { data: { action: { ...pending, status: 'EXECUTED', result: { order_sn: '261031NEWORDER' } } } } });
  });
  return state;
}

try {
  // Wide screen: the pinned panel opens with the order on screen.
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktop.addCookies([{ name: 'huspee_lang', value: 'en', url }]);
  await desktop.addInitScript(pollingEventSource);
  const page = await desktop.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const assistant = mockAssistant(page);
  await signIn(page, url, `/orders/${orderSn}`);
  const panel = page.locator('.assistant-panel');
  await panel.waitFor({ state: 'visible' });
  const orderRow = page.getByTestId('order-context-notice');
  await orderRow.getByText(`Order ${orderSn} · Completed`, { exact: true }).waitFor();
  assert.ok((await panel.getAttribute('aria-label')).includes('TechZone'), 'The order page opens its own shop’s assistant');
  assert.equal(await panel.getAttribute('role'), 'complementary');
  const box = await panel.boundingBox();
  const pageRight = await page.evaluate(() => document.querySelector('main').getBoundingClientRect().right);
  assert.ok(box.x >= 1000 && pageRight <= box.x + 1, 'The order page stays clear of the pinned panel');
  await panel.getByRole('button', { name: `Where is order ${orderSn}?`, exact: true }).click();
  await panel.getByText(`Order ${orderSn}`, { exact: true }).last().waitFor();
  assert.deepEqual(assistant.starts[0], { shop_id: 880001, lang: 'en' });
  assert.equal(assistant.texts[0], `Where is order ${orderSn}?`);
  await panel.getByRole('link', { name: 'View order', exact: true }).waitFor();
  await page.screenshot({ path: `${out}/desktop-order.png` });

  await say(page, 'Order the charger again');
  const confirm = panel.getByRole('button', { name: /^Tap to place order/ });
  await confirm.waitFor();
  await panel.getByText('Waiting for your tap', { exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(assistant.confirms.length, 0, 'Only a tap on the card places the order');
  await page.screenshot({ path: `${out}/desktop-confirm.png` });
  await confirm.click();
  await panel.getByRole('link', { name: 'View order · 261031NEWORDER', exact: true }).waitFor();
  assert.equal(assistant.confirms.length, 1);
  assert.match(assistant.confirms[0].idempotency_key, /^[0-9a-f-]{36}$/);
  await panel.getByRole('button', { name: 'Collapse assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Open the TechZone Official assistant', exact: true }).waitFor();
  assert.ok((await page.evaluate(() => document.querySelector('main').getBoundingClientRect().right)) > 1300, 'Collapsing gives the page its width back');
  await page.getByRole('button', { name: 'Open the TechZone Official assistant', exact: true }).click();
  await panel.waitFor({ state: 'visible' });
  await panel.getByRole('button', { name: 'Collapse assistant', exact: true }).click();
  // Page buttons ("Ask the assistant") open it with a cancelable event that the assistant handles.
  assert.equal(await page.evaluate(() => !window.dispatchEvent(new CustomEvent('huspee:assistant-open', { cancelable: true }))), true);
  await panel.waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);

  // Phone: the launcher names the order; the sheet is a dialog that keeps focus inside.
  const phone = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 } });
  await phone.addCookies([{ name: 'huspee_lang', value: 'en', url }]);
  await phone.addInitScript(pollingEventSource);
  const mobile = await phone.newPage();
  mobile.on('pageerror', (e) => errors.push(e.message));
  mockAssistant(mobile);
  await signIn(mobile, url, `/orders/${orderSn}`);
  const launcher = mobile.getByTestId('assistant-launcher');
  await launcher.waitFor();
  assert.ok((await launcher.innerText()).includes(`Order ${orderSn}`));
  assert.equal(await mobile.evaluate(() => !window.dispatchEvent(new CustomEvent('huspee:assistant-open', { cancelable: true }))), true);
  await mobile.locator('.assistant-panel').waitFor({ state: 'visible' });
  const sheet = mobile.locator('.assistant-panel');
  assert.equal(await sheet.getAttribute('role'), 'dialog');
  for (let i = 0; i < 12; i++) await mobile.keyboard.press('Tab');
  assert.ok(await mobile.evaluate(() => !!document.activeElement?.closest('.assistant-panel')), 'Tab stays inside the sheet');
  await mobile.getByTestId('order-context-notice').getByRole('button', { name: 'Remove the viewed order', exact: true }).click();
  assert.equal(await mobile.getByTestId('order-context-notice').count(), 0);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
  await mobile.screenshot({ path: `${out}/mobile-order.png` });
  await mobile.keyboard.press('Escape');
  await launcher.waitFor();
  assert.deepEqual(errors, []);
  console.log('order page: own shop assistant, order row, order chips, tap-only order confirmation, collapse/reopen, phone sheet focus and removal passed (mock assistant)');
} finally {
  await browser.close();
}
