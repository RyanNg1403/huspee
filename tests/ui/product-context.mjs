import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit, devices } from 'playwright-core';

const url = process.env.WEB_URL;
assert.ok(url && new URL(url).hostname.endsWith('.trycloudflare.com'), 'Use the running Cloudflare URL to exercise polling without a real Codex session');
const engine = process.env.BROWSER || 'chromium';
const browser = await ({ chromium, webkit }[engine]).launch({ headless: true, executablePath: process.env.BROWSER_BIN });
const out = '.token/product-context';
await fs.mkdir(out, { recursive: true });
try {
  const context = await browser.newContext({ ...devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 5'], viewport: { width: 375, height: 812 } });
  await context.addCookies([{ name: 'huspee_lang', value: 'en', url }]);
  const page = await context.newPage();
  const errors = [], starts = [], updates = [];
  let stopped = 0, failContext = false;
  page.on('pageerror', (e) => errors.push(e.message));
  const id = '00000000-0000-4000-8000-000000000002';
  await page.route('**/api/v1/assistant/text/sessions', (route) => {
    starts.push(route.request().postDataJSON());
    return route.fulfill({ json: { data: { conversation_id: id } } });
  });
  await page.route(`**/api/v1/assistant/voice/sessions/${id}/**`, async (route) => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/poll')) return route.fulfill({ json: { data: { events: [], cursor: 0, closed: false } } });
    if (target.pathname.endsWith('/context')) {
      const data = route.request().postDataJSON();
      updates.push(data.item_id);
      // A visible pending state must last until the backend acknowledges the new product.
      await new Promise((resolve) => setTimeout(resolve, 350));
      return route.fulfill(failContext ? { status: 503, json: { error: { code: 'unavailable', message: 'Unavailable' } } } : { json: { data } });
    }
    if (target.pathname.endsWith('/stop')) stopped++;
    return route.fulfill({ json: { data: { ok: true } } });
  });
  await page.goto(`${url}/login`);
  await page.locator('input[name="email"]').fill('an.nguyen@example.com');
  await page.locator('input[name="password"]').fill('Password123!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((target) => target.pathname !== '/login');
  await page.goto(`${url}/products/2000103`);
  const firstName = await page.locator('h1').innerText();
  await page.getByRole('button', { name: 'Shop assistant', exact: true }).click();
  const panel = page.locator('.assistant-panel');
  const notice = page.getByTestId('product-context-notice');
  await notice.getByText('Chat will use this product', { exact: true }).waitFor();
  assert.ok((await notice.innerText()).includes(firstName));
  await panel.getByRole('button', { name: 'Type', exact: true }).click();
  await notice.getByText('Chat is using this product', { exact: true }).waitFor();
  assert.equal(starts[0].item_id, 2000103);
  assert.deepEqual(Object.keys(starts[0]).sort(), ['item_id', 'lang', 'shop_id']);
  await page.screenshot({ path: `${out}/${engine}-mobile.png` });
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('a[href="/shops/880001"]').first().click();
  await page.waitForURL((target) => target.pathname === '/shops/880001');
  await page.waitForResponse((r) => r.url().endsWith('/context') && r.request().postDataJSON().item_id === null);
  assert.equal(updates.at(-1), null);
  await page.locator('a[href="/products/2000101"]').first().click();
  await page.waitForURL((target) => target.pathname === '/products/2000101');
  await page.getByRole('button', { name: 'Shop assistant', exact: true }).click();
  await notice.getByText('Chat is using this product', { exact: true }).waitFor();
  assert.ok((await notice.innerText()).includes(await page.locator('h1').innerText()));
  assert.equal(updates.at(-1), 2000101);
  assert.equal(starts.length, 1, 'Navigation should retain the conversation');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${out}/${engine}-desktop.png` });
  await panel.getByRole('button', { name: 'Conversation history', exact: true }).click();
  assert.equal(await notice.count(), 0, 'History must not claim to use the live product');
  await panel.getByRole('button', { name: 'Back', exact: true }).click();
  await notice.waitFor();
  failContext = true;
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('a[href="/shops/880001"]').first().click();
  await page.waitForURL((target) => target.pathname === '/shops/880001');
  await page.getByRole('button', { name: 'Shop assistant', exact: true }).click();
  await page.getByText('Product context could not be updated. Start a new conversation to try again.', { exact: true }).waitFor();
  assert.ok(stopped > 0, 'Stop on failed context updates to avoid using the wrong product');
  assert.deepEqual(errors, []);
  console.log(`${engine}: product notice, start context, navigation, clearing, history and failure handling passed (mock assistant)`);
} finally {
  await browser.close();
}
