import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const buyerUrl = (process.env.WEB_URL || 'http://localhost:3001').replace(/\/$/, '');
const sellerUrl = buyerUrl + '/seller';
const browser = await chromium.launch({ headless: true });
let checks = 0;
function check(ok, name) { assert.ok(ok, name); checks++; console.log('PASS', name); }
async function login(page, base, email) {
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('Password123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL(url => url.pathname.replace(/\/$/, '') === new URL(base).pathname.replace(/\/$/, ''), { timeout: 20000 });
}
async function identity(page, surface) {
  return page.evaluate(async surface => {
    const r = await fetch('/api/v1/auth/me', { headers: { 'X-Huspee-Surface': surface } });
    return { status: r.status, json: await r.json() };
  }, surface);
}
try {
  const context = await browser.newContext();
  const buyer = await context.newPage(), seller = await context.newPage();
  const errors = [];
  for (const page of [buyer, seller]) page.on('pageerror', error => errors.push(error.message));
  await login(buyer, buyerUrl, 'an.nguyen@example.com');
  await login(seller, sellerUrl, 'huy.techzone@example.com');
  check((await identity(buyer, 'buyer')).json.data.email === 'an.nguyen@example.com', 'buyer identity');
  check((await identity(seller, 'seller')).json.data.email === 'huy.techzone@example.com', 'seller identity');
  await buyer.reload({ waitUntil: 'networkidle' });
  check((await identity(buyer, 'buyer')).status === 200, 'buyer stays signed in with seller open');
  await buyer.goto(buyerUrl + '/seller/orders?source=legacy', { waitUntil: 'networkidle' });
  check(buyer.url() === sellerUrl + '/orders?source=legacy', 'legacy seller URL redirects to public seller');
  await seller.goto(sellerUrl + '/setup/codex', { waitUntil: 'networkidle' });
  check(seller.url() === buyerUrl + '/setup/codex', 'Codex setup redirects to buyer origin');
  await seller.goto(sellerUrl + '/', { waitUntil: 'networkidle' });
  const blocked = await seller.evaluate(async () => (await fetch('/api/v1/cart', { headers: { 'X-Huspee-Surface': 'seller' } })).status);
  check(blocked === 403, 'seller cannot use buyer cart');
  await seller.getByRole('link', { name: /View storefront|Xem trang mua sắm/ }).click();
  await seller.waitForURL(buyerUrl + '/');
  check((await identity(seller, 'buyer')).status === 200, 'storefront link changes app and retains buyer session');
  await seller.goto(sellerUrl + '/orders', { waitUntil: 'networkidle' });
  check((await identity(seller, 'seller')).status === 200, 'seller navigation retains seller session');
  await seller.evaluate(() => fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'huspee-sdk', 'X-Huspee-Surface': 'seller' } }));
  await buyer.goto(buyerUrl + '/cart', { waitUntil: 'networkidle' });
  check((await identity(buyer, 'buyer')).status === 200, 'seller logout preserves buyer login');
  await buyer.setViewportSize({ width: 375, height: 812 });
  for (const path of ['/', '/products/2000201', '/products/2000220']) {
    const r = await buyer.goto(buyerUrl + path, { waitUntil: 'networkidle' });
    check(r.status() === 200 && await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile buyer layout ' + path);
  }
  check(await buyer.evaluate(() => [...document.images].some(i => i.src.includes('/media/generated-') && i.complete && i.naturalWidth > 0)), 'generated product images load');
  check(errors.length === 0, 'no browser JavaScript errors');
  console.log('Single-origin smoke:', checks, 'checks passed');
} finally { await browser.close(); }
