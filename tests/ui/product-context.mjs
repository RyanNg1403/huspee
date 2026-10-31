import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit, devices } from 'playwright-core';
import { openSheet, pollingEventSource, say, signIn } from './assistant-helpers.mjs';

const url = process.env.WEB_URL;
assert.ok(url, 'Set WEB_URL to the buyer web app; every assistant route is mocked (no real Codex session)');
const engine = process.env.BROWSER || 'chromium';
const browser = await ({ chromium, webkit }[engine]).launch({ headless: true, executablePath: process.env.BROWSER_BIN });
const out = '.token/product-context';
await fs.mkdir(out, { recursive: true });
try {
  const context = await browser.newContext({ ...devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 5'], viewport: { width: 375, height: 812 } });
  await context.addCookies([{ name: 'huspee_lang', value: 'en', url }]);
  await context.addInitScript(pollingEventSource);
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
  await signIn(page, url, '/products/2000103');
  const firstName = await page.locator('h1').innerText();
  await openSheet(page);
  const panel = page.locator('.assistant-panel');
  const notice = page.getByTestId('product-context-notice');
  await notice.getByText('Viewing', { exact: true }).waitFor();
  assert.ok((await notice.innerText()).includes(firstName));
  await say(page, 'Is it in stock?', { echo: false });
  await page.waitForFunction(() => document.querySelector('[data-testid="product-context-notice"]')?.getAttribute('aria-busy') === 'false');
  assert.equal(starts[0].item_id, 2000103);
  assert.deepEqual(Object.keys(starts[0]).sort(), ['item_id', 'lang', 'shop_id']);
  await page.screenshot({ path: `${out}/${engine}-mobile.png` });
  await panel.getByRole('button', { name: 'Minimize assistant', exact: true }).click();
  await page.locator('a[href="/shops/880001"]').first().click();
  await page.waitForURL((target) => target.pathname === '/shops/880001');
  await page.waitForResponse((r) => r.url().endsWith('/context') && r.request().postDataJSON().item_id === null);
  assert.equal(updates.at(-1), null);
  await page.locator('a[href="/products/2000101"]').first().click();
  await page.waitForURL((target) => target.pathname === '/products/2000101');
  await page.locator('h1').waitFor();
  await page.waitForResponse((r) => r.url().endsWith('/context') && r.request().postDataJSON().item_id === 2000101);
  // Picking a variant on the page changes what the assistant row says the buyer is viewing.
  // Phones pick variants in the product page's variation sheet.
  await page.getByRole('button', { name: /^Choose / }).click();
  await page.getByRole('button', { name: 'Đen', exact: true }).last().click();
  await page.keyboard.press('Escape');
  await openSheet(page);
  await page.waitForFunction(() => document.querySelector('[data-testid="product-context-notice"]')?.getAttribute('aria-busy') === 'false');
  const viewing = await notice.innerText();
  assert.ok(viewing.includes(await page.locator('h1').innerText()) && viewing.includes('Đen'), `Variant shown: ${viewing}`);
  assert.equal(updates.at(-1), 2000101);
  assert.equal(starts.length, 1, 'Navigation should retain the conversation');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${out}/${engine}-desktop.png` });
  await panel.getByRole('button', { name: 'Conversation history', exact: true }).click();
  assert.equal(await notice.count(), 0, 'History must not claim to use the live product');
  await panel.getByRole('button', { name: 'Back', exact: true }).click();
  await notice.waitFor();
  await notice.getByRole('button', { name: 'Remove the viewed product', exact: true }).click();
  await page.waitForResponse((r) => r.url().endsWith('/context') && r.request().postDataJSON().item_id === null);
  assert.equal(await notice.count(), 0, 'A removed product is no longer shown or used');
  failContext = true;
  await page.locator('a[href="/shops/880001"]').first().click();
  await page.waitForURL((target) => target.pathname === '/shops/880001');
  await page.locator('a[href="/products/2000102"]').first().click();
  await page.waitForURL((target) => target.pathname === '/products/2000102');
  await page.getByText('Product context could not be updated. Start a new conversation to try again.', { exact: true }).waitFor();
  assert.ok(stopped > 0, 'Stop on failed context updates to avoid using the wrong product');
  // Another shop's page brings that shop's assistant; nothing from the previous shop comes along.
  failContext = false;
  await say(page, 'Question for TechZone', { echo: false });
  await panel.getByRole('button', { name: 'End chat', exact: true }).waitFor();
  const stoppedBefore = stopped;
  await page.locator('header input').first().fill('Cocoon');
  await page.locator('header input').first().press('Enter');
  await page.waitForURL((target) => target.pathname === '/search');
  await page.locator('a[href="/products/2000202"]').first().click();
  await page.waitForURL((target) => target.pathname === '/products/2000202');
  await page.waitForFunction(() => document.querySelector('.assistant-panel')?.getAttribute('aria-label')?.includes('GlowUp'));
  assert.equal(await panel.getByRole('button', { name: 'End chat', exact: true }).count(), 0, 'The previous shop’s conversation is not carried over');
  assert.ok((await notice.innerText()).includes(await page.locator('h1').innerText()), 'The new shop’s product is the one viewed');
  await page.waitForTimeout(300);
  assert.ok(stopped > stoppedBefore, 'Leaving for another shop ends the previous conversation');
  assert.deepEqual(errors, []);
  console.log(`${engine}: viewed product and variant, start context, navigation, removal, history, failure handling and shop switch passed (mock assistant)`);
} finally {
  await browser.close();
}
