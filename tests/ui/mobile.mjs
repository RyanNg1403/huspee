import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit, devices } from 'playwright-core';

const url = process.env.WEB_URL || 'http://127.0.0.1:3001';
const engine = process.env.BROWSER || 'chromium';
const out = process.env.SCREENSHOT_DIR || '.token/mobile-server/mobile';
await fs.mkdir(out, { recursive: true });
const browser = await ({ chromium, webkit }[engine]).launch({ headless: true, executablePath: process.env.BROWSER_BIN });
try {
  const context = await browser.newContext({
    ...devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 5'],
    viewport: { width: 375, height: 812 },
  });
  await context.addCookies([{ name: 'huspee_lang', value: 'en', url }]);
  const page = await context.newPage();
  const pageErrors = [];
  const escapedRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const target = new URL(request.url());
    if (['/api/', '/media/'].some((prefix) => target.pathname.startsWith(prefix)) && target.origin !== new URL(url).origin) escapedRequests.push(target.href);
  });
  await page.goto(`${url}/login`);
  await page.locator('input[name="email"]').fill('cuong.le@example.com');
  await page.locator('input[name="password"]').fill('Password123!');
  assert.ok(await page.locator('input[name="email"]').evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16));
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((target) => !target.pathname.includes('/login'));

  // Mobile browse: tab bar, search sheet, filter drawer, then a product from the filtered results.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${url}/`, { waitUntil: 'networkidle' });
  const tabs = page.getByRole('navigation', { name: 'Main navigation' });
  assert.equal(await tabs.getByRole('link', { name: 'Home' }).getAttribute('aria-current'), 'page');
  await page.getByRole('button', { name: 'Search Huspee' }).click();
  const sheet = page.getByRole('dialog', { name: 'Search' });
  await sheet.getByRole('searchbox').fill('iphone');
  await sheet.getByRole('searchbox').press('Enter');
  await page.waitForURL((target) => target.pathname === '/search' && target.searchParams.get('q') === 'iphone');
  assert.equal(await tabs.count(), 0, 'Search results have no tab bar');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Search filters' });
  await drawer.getByRole('button', { name: 'On sale' }).click();
  await drawer.getByRole('button', { name: 'Apply' }).click();
  await page.waitForURL((target) => target.searchParams.get('has_promotion') === 'true');
  const results = page.getByRole('region', { name: 'Search results' }).locator('a[href^="/products/"]');
  await results.first().waitFor();
  const total = await page.evaluate(
    async () => (await (await fetch('/api/v1/marketplace/products?q=iphone&has_promotion=true')).json()).page.total,
  );
  assert.equal(await results.count(), total, 'Filtered mobile results follow the API');
  await page.screenshot({ path: `${out}/${engine}-390-search-filtered.png` });
  const product = await results.first().getAttribute('href');
  await results.first().click();
  await page.waitForURL((target) => target.pathname === product);
  console.log(`${engine}: mobile tab bar, search sheet, filter drawer and product link passed`);

  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 812 });
    for (const path of ['/', '/search?q=Redmi', '/products/2000103', '/shops/880001', '/cart', '/orders', '/messages']) {
      await page.goto(`${url}${path}`, { waitUntil: 'networkidle' });
      const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(sizes.content <= sizes.viewport + 1, `${engine} ${width}px ${path}: overflow ${JSON.stringify(sizes)}`);
      const broken = await page.locator('img').evaluateAll((images) => images.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src));
      assert.deepEqual(broken, [], `${path}: broken images`);
    }
    await page.goto(`${url}/shops/880001`);
    await page.getByRole('button', { name: 'Shop assistant', exact: true }).click();
    const panel = page.locator('.assistant-panel');
    await panel.waitFor({ state: 'visible' });
    let box = await panel.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.width <= width + 1 && box.y + box.height <= 813, `${width}px: assistant outside viewport`);
    await page.screenshot({ path: `${out}/${engine}-${width}-assistant.png` });
    // Approximate the reduced visual viewport when a phone keyboard is shown.
    await page.setViewportSize({ width, height: 420 });
    await page.waitForTimeout(150);
    box = await panel.boundingBox();
    assert.ok(box.y + box.height <= 421, `${width}px: assistant clipped after keyboard resize`);
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await page.setViewportSize({ width, height: 812 });
    console.log(`${engine}: ${width}px pages, images, assistant and keyboard resize passed`);
  }

  await page.setViewportSize({ width: 812, height: 375 });
  await page.getByRole('button', { name: 'Shop assistant', exact: true }).click();
  const landscape = await page.locator('.assistant-panel').boundingBox();
  assert.ok(landscape.y >= 0 && landscape.y + landscape.height <= 375, 'Landscape assistant clipped');
  await page.setViewportSize({ width: 375, height: 812 });
  // Leaving a shop hides its idle assistant; the next page must remain scrollable.
  await page.locator('a[href="/"]').first().evaluate((link) => link.click());
  await page.waitForURL((target) => target.pathname === '/');
  await page.waitForFunction(() => getComputedStyle(document.body).overflow !== 'hidden');
  await page.goto(`${url}/products/2000103`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await page.goto(`${url}/cart`, { waitUntil: 'networkidle' });
  await page.locator('#sticky_select_all').check();
  await page.getByRole('button', { name: 'Checkout', exact: true }).click();
  await page.waitForURL((target) => target.pathname === '/checkout');
  await page.getByRole('button', { name: 'Place Order', exact: true }).waitFor();
  await page.screenshot({ path: `${out}/${engine}-checkout.png`, fullPage: true });
  const checkoutWidth = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  assert.ok(checkoutWidth, 'Checkout overflow');
  if (new URL(url).hostname.endsWith('.trycloudflare.com')) {
    // Exercise the tunnel-specific browser transport without starting a real Codex session.
    const conversationId = '00000000-0000-4000-8000-000000000001';
    const cursors = [];
    let streamOpened = false;
    await page.route('**/api/v1/assistant/text/sessions', (route) => route.fulfill({ json: { data: { conversation_id: conversationId } } }));
    await page.route(`**/api/v1/assistant/voice/sessions/${conversationId}/**`, async (route) => {
      const target = new URL(route.request().url());
      if (target.pathname.endsWith('/events')) {
        streamOpened = true;
        return route.abort();
      }
      if (target.pathname.endsWith('/poll')) {
        const cursor = Number(target.searchParams.get('after'));
        cursors.push(cursor);
        if (cursors.length === 1) return route.fulfill({ status: 503, json: { error: { code: 'temporary', message: 'Retry' } } });
        return route.fulfill({ json: { data: {
          events: cursor === 0 ? [{ type: 'transcript', role: 'assistant', text: 'Tunnel polling check', final: true, item_id: 'poll-check' }] : [],
          cursor: 1, closed: false,
        } } });
      }
      return route.fulfill({ json: { data: { ok: true } } });
    });
    await page.goto(`${url}/shops/880001`);
    await page.getByRole('button', { name: 'Shop assistant', exact: true }).click();
    await page.getByRole('button', { name: 'Type', exact: true }).click();
    await page.getByText('Tunnel polling check', { exact: true }).waitFor();
    await page.waitForTimeout(800);
    assert.deepEqual(cursors.slice(0, 3), [0, 0, 1], 'Polling should retry the cursor and advance after delivery');
    assert.equal(await page.getByText('Tunnel polling check', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'End chat', exact: true }).click();
    const count = cursors.length;
    await page.waitForTimeout(1200);
    assert.equal(cursors.length, count, 'Polling must stop when the conversation ends');
    assert.equal(streamOpened, false, 'Quick Tunnels must use JSON instead of SSE');
    console.log(`${engine}: tunnel polling, retry, cursor and cleanup passed (mock assistant)`);
  }
  assert.deepEqual(escapedRequests, [], 'API/media requests escaped the forwarded origin');
  assert.deepEqual(pageErrors, [], 'Browser JavaScript errors');
  console.log(`${engine}: mobile login, cart and checkout passed; all API/media stayed on ${new URL(url).origin}`);
} finally {
  await browser.close();
}
