import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const WEB_URL = process.env.WEB_URL || 'http://localhost:3001';
const SELLER_URL = process.env.SELLER_URL || 'http://localhost:3002';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; console.log(`PASS ${message}`); }
async function identity(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/me', { headers: document.documentElement.dataset.huspeeSurface === 'seller' ? { 'X-Huspee-Surface': 'seller' } : {} });
    return { status: response.status, body: await response.json() };
  });
}
async function login(page, url, email) {
  await page.goto(`${url}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('Password123!');
  await page.locator('button[type=submit]').click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 20000 });
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(20000);
  const buyer = await context.newPage();
  const seller = await context.newPage();
  await login(buyer, WEB_URL, 'an.nguyen@example.com');
  await seller.goto(`${SELLER_URL}/login`, { waitUntil: 'networkidle' });
  check((await identity(seller)).status === 401, 'buyer cookie alone does not sign into Seller Centre');
  await seller.locator('input[name=email]').fill('an.nguyen@example.com');
  await seller.locator('input[name=password]').fill('Password123!');
  await seller.locator('button[type=submit]').click();
  await seller.getByRole('alert').waitFor();
  check((await identity(seller)).status === 401, 'Seller Centre rejects a buyer login');
  await login(seller, SELLER_URL, 'huy.techzone@example.com');
  await buyer.reload({ waitUntil: 'networkidle' });
  await seller.reload({ waitUntil: 'networkidle' });
  check((await identity(buyer)).body.data.email === 'an.nguyen@example.com', 'buyer survives reload');
  check((await identity(seller)).body.data.email === 'huy.techzone@example.com', 'seller survives reload');
  const cookies = await context.cookies();
  check(cookies.some((c) => c.name === 'huspee_sid' && c.httpOnly) && cookies.some((c) => c.name === 'huspee_seller_sid' && c.httpOnly), 'both HttpOnly cookies coexist');
  await seller.evaluate(() => fetch('/api/v1/seller/shops/880001/disconnect', {
    method: 'POST', headers: { 'x-requested-with': 'huspee-sdk', 'X-Huspee-Surface': 'seller' },
  }));
  await seller.goto(`${SELLER_URL}/shops`, { waitUntil: 'networkidle' });
  await seller.getByRole('button', { name: /^(Kết nối shop|Connect shop)$/ }).first().click();
  await seller.waitForURL((url) => url.pathname === '/api/v2/shop/auth_partner/consent');
  check(new URL(seller.url()).origin === new URL(SELLER_URL).origin, 'Partner consent stays on seller origin');
  await seller.locator('button[value=approve]').click();
  await seller.waitForURL((url) => url.pathname === '/shops/880001' && url.searchParams.get('connected') === '1');
  check(new URL(seller.url()).origin === new URL(SELLER_URL).origin, 'Partner callback returns to connected seller shop');
  await seller.goto(`${SELLER_URL}/orders`, { waitUntil: 'networkidle' });
  await seller.locator('h1').waitFor();
  check(new URL(seller.url()).pathname === '/orders', 'seller orders opens without /seller prefix');
  await buyer.goto(`${WEB_URL}/cart`, { waitUntil: 'networkidle' });
  await buyer.locator('main h2, main input[type=checkbox]').first().waitFor();
  check(new URL(buyer.url()).pathname === '/cart', 'buyer cart remains accessible');
  const blocked = await seller.evaluate(async () => (await fetch('/api/v1/cart', { headers: { 'X-Huspee-Surface': 'seller' } })).status);
  check(blocked === 403, 'backend blocks buyer cart for seller surface');
  // Sign-out lives in the account menu of the Seller Centre header.
  await seller.getByRole('button', { name: /^(Tài khoản|Account):/ }).click();
  await seller.getByRole('button', { name: /Đăng xuất|Log out|Logout/ }).click();
  await seller.waitForURL((url) => url.pathname === '/login');
  await buyer.reload({ waitUntil: 'networkidle' });
  check((await identity(buyer)).body.data.email === 'an.nguyen@example.com', 'seller logout preserves buyer');
  await login(seller, SELLER_URL, 'huy.techzone@example.com');
  await buyer.evaluate(() => fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'huspee-sdk' } }));
  await seller.reload({ waitUntil: 'networkidle' });
  check((await identity(seller)).body.data.email === 'huy.techzone@example.com', 'buyer logout preserves seller');
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/search?q=Redmi', '/shops/880001', '/products/2000103']) {
    await mobile.goto(`${WEB_URL}${path}`, { waitUntil: 'networkidle' });
    check(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `buyer has no horizontal overflow at 390px: ${path}`);
  }
  await mobile.goto(`${WEB_URL}/seller/orders?source=legacy`, { waitUntil: 'networkidle' });
  check(mobile.url() === `${SELLER_URL}/orders?source=legacy`, 'legacy seller redirect preserves path/query');
  await seller.goto(`${SELLER_URL}/setup/codex`, { waitUntil: 'networkidle' });
  check(seller.url() === `${WEB_URL}/setup/codex`, 'Codex setup link opens buyer origin without starting login');
  console.log(`Dual-session smoke: ${checks} checks passed, 0 failed`);
} finally {
  await browser.close();
}
