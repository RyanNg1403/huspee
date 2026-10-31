// Seller Centre commerce smoke: variant stock/price → public API, ship an order, approve a return,
// create a voucher. Needs a seeded API, the buyer API reachable at API_URL and seller-web at SELLER_URL.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const SELLER_URL = process.env.SELLER_URL || 'http://localhost:3002';
const API_URL = process.env.API_URL || 'http://localhost:3000';
const MOUSE = { itemId: 2000106, modelId: 3000152, name: 'Đỏ' };
const PASSWORD = 'Password123!';

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
  console.log(`PASS ${message}`);
}

/** Cookie session against the API for buyer-side setup and public reads. */
async function apiSession(email) {
  const login = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'smoke' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(login.status, 200, `login ${email}`);
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return async (method, path, body) => {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { cookie, 'content-type': 'application/json', 'x-requested-with': 'smoke' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    return json.data;
  };
}

async function publicModel() {
  const res = await fetch(`${API_URL}/api/v1/marketplace/products/${MOUSE.itemId}`);
  const { data } = await res.json();
  return data.models.find((m) => m.model_id === MOUSE.modelId);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const buyer = await apiSession('an.nguyen@example.com');
  const [address] = await buyer('GET', '/api/v1/buyer/addresses');
  const checkout = await buyer('POST', '/api/v1/checkout', {
    items: [{ model_id: 3000121, quantity: 1 }],
    payment_method: 'COD',
    address_id: address.address_id,
  });
  const orderSn = checkout.order_sn_list[0];
  check(Boolean(orderSn), `buyer placed order ${orderSn}`);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(30000);
  const page = await context.newPage();
  await page.goto(`${SELLER_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[name=email]').fill('huy.techzone@example.com');
  await page.locator('input[name=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((url) => url.pathname === '/');
  const shops = await page.evaluate(async () => {
    const res = await fetch('/api/v1/seller/shops', { headers: { 'X-Huspee-Surface': 'seller' } });
    return (await res.json()).data;
  });
  if (!shops.find((s) => s.shop_id === 880001).connection.connected) {
    await page.goto(`${SELLER_URL}/shops`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^(Kết nối shop|Connect shop)$/ }).first().click();
    await page.waitForURL((url) => url.pathname === '/api/v2/shop/auth_partner/consent');
    await page.locator('button[value=approve]').click();
    await page.waitForURL((url) => url.searchParams.get('connected') === '1');
  }

  // Variant stock in the product list, then variant price in the editor.
  const before = await publicModel();
  const stock = before.stock === 61 ? 62 : 61;
  await page.goto(`${SELLER_URL}/products`, { waitUntil: 'networkidle' });
  await page.getByRole('searchbox', { name: 'Tìm sản phẩm' }).fill('M331');
  const productRow = page.locator('tr', { hasText: 'Logitech M331' }).first();
  await productRow.getByRole('button', { name: /Phân loại/ }).click();
  await page.getByLabel(`Kho hàng ${MOUSE.name}`).fill(String(stock));
  await page.getByRole('button', { name: 'Lưu kho hàng' }).click();
  await page.getByText('Đã lưu kho hàng').waitFor();
  check((await publicModel()).stock === stock, `variant stock ${stock} is public after saving in the list`);

  const price = before.original_price === 359000 ? 369000 : 359000;
  await page.goto(`${SELLER_URL}/products/${MOUSE.itemId}`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Bán hàng' }).click();
  await page.getByLabel(`Giá gốc ${MOUSE.name}`).fill(String(price));
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.getByText('Đã lưu sản phẩm').waitFor();
  const after = await publicModel();
  check(after.original_price === price && after.price === price, `variant price ${price} is public after editing`);
  check(after.stock === stock, 'saving the editor keeps the variant stock');

  // Ship the ready-to-ship order and advance the simulated carrier.
  await page.goto(`${SELLER_URL}/orders?status=READY_TO_SHIP`, { waitUntil: 'networkidle' });
  check(
    (await page.getByRole('tab', { selected: true }).textContent()).startsWith('Chờ lấy hàng'),
    '?status=READY_TO_SHIP opens the to-ship tab',
  );
  await page.evaluate(() => {
    window.__ordersChanged = 0;
    window.addEventListener('huspee:orders-changed', () => window.__ordersChanged++);
  });
  const orderRow = page.locator('tr', { hasText: orderSn });
  await orderRow.getByRole('button', { name: 'Chuẩn bị hàng' }).click();
  const shipDialog = page.getByRole('dialog');
  await shipDialog.getByRole('button', { name: 'Xác nhận' }).click();
  await orderRow.getByText('Đã xử lý').waitFor();
  check((await page.evaluate(() => window.__ordersChanged)) === 1, 'shipping notifies the shell');
  await page.getByRole('tab', { name: /^Đang giao/ }).click();
  await page.waitForURL((url) => url.searchParams.get('status') === 'SHIPPED');
  await page.getByRole('tab', { name: /^Tất cả/ }).click();
  await page.waitForURL((url) => !url.searchParams.has('status'));
  check(await orderRow.getByRole('button', { name: 'Chuẩn bị hàng' }).count() === 0, 'shipped order no longer offers shipping');
  await page.goto(`${SELLER_URL}/orders/${orderSn}`, { waitUntil: 'networkidle' });
  check(await page.getByRole('button', { name: 'Huỷ đơn' }).count() === 0, 'processed order cannot be cancelled');
  await page.getByRole('button', { name: 'Lấy hàng thành công' }).click();
  await page.getByRole('button', { name: 'Giao thành công' }).waitFor();
  await page.getByRole('button', { name: 'Giao thành công' }).click();
  await page.locator('h1 + span', { hasText: 'Đã giao' }).waitFor();
  const tracked = await buyer('GET', `/api/v1/buyer/orders/${orderSn}`);
  check(tracked.status === 'TO_CONFIRM_RECEIVE', 'buyer sees the delivered order');

  // Buyer asks for a return; the seller approves it.
  const ret = await buyer('POST', '/api/v1/buyer/returns', {
    order_sn: orderSn,
    reason: 'FUNCTIONAL_DMG',
    text_reason: 'Tai nghe bên trái bị rè',
  });
  await page.goto(`${SELLER_URL}/returns`, { waitUntil: 'networkidle' });
  const returnRow = page.locator('tr', { hasText: ret.return_sn });
  await returnRow.getByRole('link', { name: 'Xử lý' }).click();
  await page.waitForURL((url) => url.pathname === `/returns/${ret.return_sn}`);
  await page.getByRole('button', { name: 'Duyệt yêu cầu' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Duyệt yêu cầu' }).click();
  await page.getByText('Đã hoàn tiền').first().waitFor();
  const approved = await buyer('GET', `/api/v1/buyer/returns/${ret.return_sn}`);
  check(approved.status === 'ACCEPTED' && approved.refund_paid, 'buyer sees the approved, refunded return');
  check(await page.getByRole('button', { name: 'Duyệt yêu cầu' }).count() === 0, 'approved return offers no further approval');

  // Create a voucher, find it in the list, and see the duplicate-code error.
  const code = `SMK${Date.now().toString().slice(-8)}`;
  const fillVoucher = async () => {
    await page.goto(`${SELLER_URL}/vouchers/new`, { waitUntil: 'networkidle' });
    await page.locator('#v-name').fill(`Smoke ${code}`);
    await page.locator('#v-code').fill(code);
    await page.getByLabel('Mức giảm', { exact: true }).fill('20000');
    await page.getByLabel('Giá trị đơn tối thiểu').fill('100000');
    await page.locator('#v-usage').fill('50');
    await page.getByRole('button', { name: 'Xác nhận' }).click();
  };
  await fillVoucher();
  await page.waitForURL((url) => url.pathname === '/vouchers');
  await page.getByRole('searchbox', { name: 'Tìm mã giảm giá' }).fill(code);
  const voucherRow = page.locator('tr', { hasText: code });
  await voucherRow.waitFor();
  check((await voucherRow.textContent()).includes('Sắp diễn ra'), `voucher ${code} is listed as upcoming`);
  await fillVoucher();
  await page.getByRole('alert').filter({ hasText: 'Dữ liệu đã tồn tại' }).waitFor();
  check(new URL(page.url()).pathname === '/vouchers/new', 'duplicate voucher code shows an error and stays on the form');

  console.log(`Seller commerce smoke: ${checks} checks passed, 0 failed`);
} finally {
  await browser.close();
}
