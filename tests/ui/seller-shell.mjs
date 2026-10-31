// Seller Centre shell smoke: sign in, overview counts match the API, every sidebar entry opens,
// a second shop is created and connected through onboarding, and switching shops updates counts.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const SELLER_URL = process.env.SELLER_URL || 'http://localhost:3002';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3001';
const SELLER = { email: 'huy.techzone@example.com', shopId: 880001 };
const OTHER_SELLER = { email: 'lan.glowup@example.com', shopId: 880002 };
const BUYER = 'an.nguyen@example.com';
const PASSWORD = 'Password123!';
const SIDEBAR = [
  ['Tất cả', '/orders'],
  ['Chờ lấy hàng', '/orders?status=READY_TO_SHIP'],
  ['Trả hàng / Hoàn tiền', '/returns'],
  ['Tất cả sản phẩm', '/products'],
  ['Thêm sản phẩm', '/products/new'],
  ['Mã giảm giá', '/vouchers'],
  ['Hộp thư', '/inbox'],
  ['Hội thoại', '/assistant/conversations'],
  ['Insights', '/assistant/insights'],
  ['FAQ', '/assistant/faqs'],
  ['Cấu hình', '/assistant'],
  ['Hồ sơ shop', `/shops/${SELLER.shopId}`],
  ['Kết nối & ủy quyền', '/shops'],
  ['Tổng quan', '/'],
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
  console.log(`PASS ${message}`);
}
const errors = [];

/** Seller API through the seller origin with the page's own session. */
function api(page, path) {
  return page.evaluate(async (p) => {
    const res = await fetch(p, {
      headers: { 'X-Huspee-Surface': 'seller', 'x-requested-with': 'huspee-sdk' },
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${p} ${res.status}`);
    return body;
  }, path);
}
async function shops(page) {
  return (await api(page, '/api/v1/seller/shops')).data;
}
async function expected(page, shopId) {
  const summary = (await api(page, `/api/v1/seller/dashboard/summary?shop_id=${shopId}&time_from=1`)).data;
  const inbox = await api(page, `/api/v1/seller/shops/${shopId}/inbox?status=OPEN&page_size=1`);
  return { toShip: summary.order_count_by_status.READY_TO_SHIP ?? 0, questions: inbox.page.total };
}
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Opens the account menu unless it is already open. */
async function accountMenu(page) {
  if (!(await page.getByLabel('Language').isVisible()))
    await page.getByRole('button', { name: /^(Tài khoản|Account):/ }).click();
}
const sidebar = (page) => page.getByRole('navigation', { name: /Menu Kênh Người Bán|Seller Centre menu/ });
const todo = (page, key) => page.locator(`[data-todo=${key}] span`).first();

async function expectOverview(page, shopId, label) {
  const want = await expected(page, shopId);
  await page.waitForURL((url) => url.pathname === '/');
  await todo(page, 'todoToShip').waitFor();
  await page.waitForFunction(
    ([value]) => document.querySelector('[data-todo=todoToShip] span')?.textContent === value,
    [String(want.toShip)],
  );
  check(
    (await todo(page, 'todoToShip').textContent()) === String(want.toShip),
    `${label}: to-ship count matches API (${want.toShip})`,
  );
  check(
    (await todo(page, 'todoQuestions').textContent()) === String(want.questions),
    `${label}: open questions match API (${want.questions})`,
  );
  const toShipLink = sidebar(page).getByRole('link', { name: /^Chờ lấy hàng/ });
  await page.waitForFunction(
    ([value]) => {
      const link = [...document.querySelectorAll('nav a')].find((a) =>
        a.textContent?.startsWith('Chờ lấy hàng'),
      );
      return link?.textContent === `Chờ lấy hàng${value ? value : ''}`;
    },
    [want.toShip],
  );
  check(
    (await toShipLink.textContent()) === `Chờ lấy hàng${want.toShip ? want.toShip : ''}`,
    `${label}: sidebar to-ship count matches API`,
  );
  return want;
}

async function signIn(page, email) {
  await page.goto(`${SELLER_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((url) => url.pathname === '/');
}

async function approveConsent(page, shopId) {
  await page.waitForURL((url) => url.pathname === '/api/v2/shop/auth_partner/consent');
  check(
    new URL(page.url()).origin === new URL(SELLER_URL).origin,
    `consent for ${shopId} stays on the seller origin`,
  );
  await page.locator(`input[name=shop_id][value="${shopId}"]`).check();
  await page.locator('button[value=approve]').click();
  await page.waitForURL(
    (url) => url.pathname === `/shops/${shopId}` && url.searchParams.get('connected') === '1',
  );
}

/** The overview and gateway-backed pages need the shop's Partner grant. */
async function ensureConnected(page, shopId) {
  const shop = (await shops(page)).find((s) => s.shop_id === shopId);
  if (shop.connection.connected) return;
  await page.goto(`${SELLER_URL}/shops`, { waitUntil: 'networkidle' });
  await page
    .getByRole('row', { name: new RegExp(escape(shop.shop_name)) })
    .getByRole('button', { name: 'Kết nối shop' })
    .click();
  await approveConsent(page, shopId);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  await signIn(page, SELLER.email);
  check(true, 'seller signs in to the overview');
  await ensureConnected(page, SELLER.shopId);

  // Make sure the shop has an order waiting to ship, so switching shops changes the count.
  if ((await expected(page, SELLER.shopId)).toShip === 0) {
    const buyer = await browser.newContext();
    const buyerPage = await buyer.newPage();
    await buyerPage.goto(`${SELLER_URL}/healthz`);
    await buyerPage.evaluate(
      async ({ email, password }) => {
        const headers = { 'content-type': 'application/json', 'x-requested-with': 'huspee-sdk' };
        await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers,
          body: JSON.stringify({ email, password }),
        });
        const addresses = await (await fetch('/api/v1/buyer/addresses', { headers })).json();
        const body = {
          address_id: addresses.data[0].address_id,
          payment_method: 'COD',
          items: [{ model_id: 3000121, quantity: 1 }],
        };
        const res = await fetch('/api/v1/checkout', { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`checkout ${res.status}`);
      },
      { email: BUYER, password: PASSWORD },
    );
    await buyer.close();
  }

  const list = await shops(page);
  const techzone = list.find((s) => s.shop_id === SELLER.shopId);
  await page.goto(`${SELLER_URL}/`, { waitUntil: 'networkidle' });
  await page.getByLabel(/Chọn shop|Select shop/).selectOption(String(SELLER.shopId));
  const switcher = page.getByLabel(/Chọn shop|Select shop/);
  check(
    (await switcher.locator('option:checked').textContent()) === techzone.shop_name,
    `header shows the selected shop name from the API (${techzone.shop_name})`,
  );
  check(
    (await sidebar(page).getByRole('link', { name: 'Tổng quan' }).getAttribute('aria-current')) === 'page',
    'overview is the current sidebar entry',
  );
  const techzoneCounts = await expectOverview(page, SELLER.shopId, techzone.shop_name);
  check(techzoneCounts.toShip > 0, 'TechZone has an order waiting to ship');

  for (const [name, href] of SIDEBAR) {
    const link = sidebar(page).getByRole('link', { name: new RegExp(`^${escape(name)}( ?\\d+)?$`) });
    await link.click();
    const target = new URL(href, SELLER_URL);
    await page.waitForURL((url) => url.pathname === target.pathname && url.search === target.search);
    await page.waitForLoadState('networkidle');
    check(
      (await link.getAttribute('aria-current')) === 'page',
      `sidebar "${name}" opens ${href} and is marked current`,
    );
    await page.waitForFunction(() => (document.querySelector('main')?.innerText ?? '').trim().length > 0);
    check(true, `${href} renders content`);
  }
  const storefront = sidebar(page).getByRole('link', { name: /Xem shop trên Huspee/ });
  check(
    (await storefront.getAttribute('href')) === `${WEB_URL.replace(/\/$/, '')}/shops/${SELLER.shopId}` &&
      (await storefront.getAttribute('target')) === '_blank',
    'storefront link opens the shop on the buyer site in a new tab',
  );

  // Second shop: reuse one from an earlier run, otherwise create it through onboarding.
  let second = list.find((s) => s.shop_id !== SELLER.shopId);
  if (!second) {
    await page.goto(`${SELLER_URL}/shops`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Tạo shop' }).click();
    await page.waitForURL((url) => url.pathname === '/shops/new');
    check(
      (await page.getByRole('navigation', { name: /Menu Kênh Người Bán/ }).count()) === 0,
      'shop onboarding has no sidebar',
    );
    await page.locator('input[name=shop_name]').fill(`Shop Kiểm Thử ${Date.now() % 100000}`);
    await page.locator('input[name=state]').fill('Hà Nội');
    await page.locator('input[name=district]').fill('Quận Ba Đình');
    await page.locator('input[name=address]').fill('1 Hoàng Hoa Thám');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await page.waitForURL((url) => /^\/shops\/\d+\/connect$/.test(url.pathname));
    second = (await shops(page)).find((s) => s.shop_id !== SELLER.shopId);
    check(
      new URL(page.url()).pathname === `/shops/${second.shop_id}/connect`,
      'new shop continues to the connect step',
    );
  }
  if (!second.connection.connected) {
    await page.goto(`${SELLER_URL}/shops/${second.shop_id}/connect`, { waitUntil: 'networkidle' });
    check(
      (await page.getByRole('radio', { name: new RegExp(second.shop_name) }).isChecked()) === true,
      'connect step selects the new shop',
    );
    await page.getByRole('button', { name: 'Cho phép' }).click();
    await approveConsent(page, second.shop_id);
    check(true, 'new shop connects through the platform consent');
  }

  await page.goto(`${SELLER_URL}/`, { waitUntil: 'networkidle' });
  await switcher.selectOption(String(second.shop_id));
  const secondCounts = await expectOverview(page, second.shop_id, second.shop_name);
  check(secondCounts.toShip !== techzoneCounts.toShip, 'switching shops changes the to-ship count');
  await switcher.selectOption(String(SELLER.shopId));
  await expectOverview(page, SELLER.shopId, `${techzone.shop_name} again`);

  // Another seller sees only their own shop and numbers.
  const otherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  otherContext.setDefaultTimeout(20000);
  const other = await otherContext.newPage();
  other.on('pageerror', (e) => errors.push(e.message));
  await signIn(other, OTHER_SELLER.email);
  await ensureConnected(other, OTHER_SELLER.shopId);
  const otherShops = await shops(other);
  check(
    otherShops.every((s) => s.shop_id !== SELLER.shopId),
    'GlowUp seller does not see TechZone',
  );
  await other.goto(`${SELLER_URL}/`, { waitUntil: 'networkidle' });
  const glowup = otherShops.find((s) => s.shop_id === OTHER_SELLER.shopId);
  check(
    (await other
      .getByLabel(/Chọn shop|Select shop/)
      .locator('option:checked')
      .textContent()) === glowup.shop_name,
    `header shows ${glowup.shop_name}`,
  );
  await expectOverview(other, OTHER_SELLER.shopId, glowup.shop_name);
  await otherContext.close();

  // English labels come from the same message keys.
  await accountMenu(page);
  await page.getByLabel('Language').selectOption('en');
  await sidebar(page).getByRole('link', { name: 'Overview' }).waitFor();
  check(
    await sidebar(page)
      .getByRole('link', { name: /^To ship/ })
      .isVisible(),
    'sidebar switches to English',
  );
  await accountMenu(page);
  await page.getByLabel('Language').selectOption('vi');
  await sidebar(page).getByRole('link', { name: 'Tổng quan' }).waitFor();

  await accountMenu(page);
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForURL((url) => url.pathname === '/login');
  check(true, 'account menu signs out to the login page');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  console.log(`Seller shell smoke: ${checks} checks passed, 0 failed`);
} finally {
  await browser.close();
}
