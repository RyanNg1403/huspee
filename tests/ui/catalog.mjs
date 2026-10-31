// Shop → product → variation → cart journey on desktop and phone widths. Checks prices and stock
// against the marketplace API and the resulting cart through the API; restores the cart afterwards.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const url = process.env.WEB_URL || 'http://localhost:3001';
const out = process.env.SCREENSHOT_DIR || '.token/catalog';
const SHOP = 880001;
const GALAXY = 2000102;
const IPHONE = 2000101;
const MOUSE = 2000106;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const vnd = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n).replace(/\s+/g, ' ');
const text = (s) => s.replace(/\s+/g, ' ').trim();

let restore;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Counts the event that refreshes the header cart badge.
  await context.addInitScript(() => {
    window.__cartChanged = 0;
    window.addEventListener('huspee:cart-changed', () => window.__cartChanged++);
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const api = async (path, init) => {
    // Writes need the header the API checks for CSRF protection, like the SDK sends.
    const res = await page.request.fetch(`${url}/api/v1${path}`, { ...init, headers: { 'X-Requested-With': 'huspee-sdk' } });
    assert.ok(res.ok(), `${path}: ${res.status()}`);
    return (await res.json()).data;
  };
  const lines = async () => (await api('/cart')).shops.flatMap((s) => s.items);
  const noOverflow = async (label) => {
    const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(sizes.content <= sizes.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(sizes)}`);
  };

  await page.goto(`${url}/login`);
  await page.locator('input[name="email"]').fill('an.nguyen@example.com');
  await page.locator('input[name="password"]').fill('Password123!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((target) => target.pathname !== '/login');
  const before = await lines();
  // Put the cart back the way it was, even after a failure.
  restore = async () => {
    for (const line of await lines()) {
      const old = before.find((l) => l.cart_item_id === line.cart_item_id);
      if (!old) await api(`/cart/items/${line.cart_item_id}`, { method: 'DELETE' });
      else if (old.quantity !== line.quantity)
        await api(`/cart/items/${line.cart_item_id}`, { method: 'PATCH', data: { quantity: old.quantity } });
    }
  };
  const inCart = (modelId) => before.find((l) => l.model_id === modelId)?.quantity ?? 0;

  // Shop page: header, vouchers and products all come from the API.
  const shop = await api(`/marketplace/shops/${SHOP}`);
  await page.goto(`${url}/shops/${SHOP}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: shop.shop_name, exact: true }).waitFor();
  for (const v of await api(`/marketplace/shops/${SHOP}/vouchers`)) await page.getByText(v.voucher_name).first().waitFor();
  await noOverflow('shop 1440');
  await page.screenshot({ path: `${out}/shop-1440.png` });
  // "Ask assistant" is only an entry point: it asks the assistant dock to open.
  const asked = page.evaluate(
    () => new Promise((resolve) => window.addEventListener('huspee:assistant-open', () => resolve(true), { once: true })),
  );
  await page.getByRole('button', { name: 'Hỏi trợ lý', exact: true }).click();
  assert.equal(await asked, true);

  // Sold-out variations cannot be chosen.
  const iphone = await api(`/marketplace/products/${IPHONE}`);
  const soldOut = iphone.models.find((m) => !m.available);
  await page.goto(`${url}/products/${IPHONE}`, { waitUntil: 'networkidle' });
  assert.ok(await page.getByRole('button', { name: new RegExp(`^${soldOut.name},`) }).isDisabled(), 'sold-out option enabled');

  // Shop → product → choose a two-tier variation → add to cart.
  const galaxy = await api(`/marketplace/products/${GALAXY}`);
  const room = (m) => m.available && m.stock - inCart(m.model_id) >= 2;
  const target = galaxy.models.find((m) => room(m) && m.tier_index.every((n) => n > 0)) ?? galaxy.models.find(room);
  await page.goto(`${url}/shops/${SHOP}`, { waitUntil: 'networkidle' });
  await page.locator(`a[href="/products/${GALAXY}"]`).first().click();
  await page.waitForURL((u) => u.pathname === `/products/${GALAXY}`);
  await page.getByRole('heading', { level: 1, name: galaxy.name, exact: true }).waitFor();
  const addButton = page.getByRole('button', { name: 'Thêm vào giỏ hàng', exact: true });
  await addButton.click();
  await page.getByRole('alert').filter({ hasText: 'Vui lòng chọn phân loại hàng' }).waitFor();
  for (const [tier, option] of target.tier_index.entries()) {
    const name = galaxy.tier_variations[tier].options[option].option;
    await page.getByRole('group', { name: galaxy.tier_variations[tier].name }).getByRole('button', { name, exact: true }).click();
  }
  const priceText = text(await page.locator('[aria-live="polite"]').first().innerText());
  assert.ok(priceText.includes(vnd(target.price)), `price ${priceText} should show ${vnd(target.price)}`);
  await page.getByText(`${target.stock} sản phẩm có sẵn`).waitFor();
  await page.getByRole('button', { name: 'Tăng số lượng' }).first().click();
  const events = await page.evaluate(() => window.__cartChanged);
  const added = page.waitForResponse((r) => r.url().endsWith('/api/v1/cart/items') && r.request().method() === 'POST');
  await addButton.click();
  assert.equal((await added).status(), 201);
  await page.waitForFunction((n) => window.__cartChanged > n, events);
  const galaxyLine = (await lines()).find((l) => l.model_id === target.model_id);
  assert.equal(galaxyLine?.quantity, inCart(target.model_id) + 2, 'cart has the chosen variation and quantity');
  await noOverflow('product 1440');
  await page.screenshot({ path: `${out}/product-1440.png`, fullPage: true });

  // Phone: buy bar opens the variation sheet; English labels.
  await context.addCookies([{ name: 'huspee_lang', value: 'en', url }]);
  await page.setViewportSize({ width: 390, height: 844 });
  const mouse = await api(`/marketplace/products/${MOUSE}`);
  const red = mouse.models.find((m) => m.available && m.tier_index[0] === 1);
  await page.goto(`${url}/products/${MOUSE}`, { waitUntil: 'networkidle' });
  await noOverflow('product 390');
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Variation' });
  await sheet.waitFor();
  await sheet.getByRole('button', { name: mouse.tier_variations[0].options[1].option, exact: true }).click();
  assert.ok(text(await sheet.innerText()).includes(vnd(red.price)));
  const mobileAdded = page.waitForResponse((r) => r.url().endsWith('/api/v1/cart/items') && r.request().method() === 'POST');
  await sheet.getByRole('button', { name: 'Add to cart', exact: true }).click();
  assert.equal((await mobileAdded).status(), 201);
  await sheet.waitFor({ state: 'detached' });
  assert.equal((await lines()).find((l) => l.model_id === red.model_id)?.quantity, inCart(red.model_id) + 1);
  await page.screenshot({ path: `${out}/product-390.png` });
  await page.goto(`${url}/shops/${SHOP}`, { waitUntil: 'networkidle' });
  await noOverflow('shop 390');
  await page.screenshot({ path: `${out}/shop-390.png` });

  assert.deepEqual(errors, []);
  console.log('catalog: shop → product → variation → cart passed on 1440 and 390 (vi/en)');
} finally {
  await restore?.();
  await browser.close();
}
