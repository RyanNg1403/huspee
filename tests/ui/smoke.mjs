import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const WEB_URL = process.env.WEB_URL || 'http://localhost:3210';
const SELLER_URL = process.env.SELLER_URL || 'http://localhost:3220';
const API_URL = process.env.API_URL || 'http://localhost:3110';
const CHROME_BIN =
  process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const OUT_DIR =
  process.env.SCREENSHOT_DIR ||
  path.resolve(process.cwd(), '.orca/p2w0/p2w0-closeout-ops/out/screenshots');

fs.mkdirSync(OUT_DIR, { recursive: true });

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function dismissOverlay(page) {
  await page
    .addStyleTag({
      content:
        'nextjs-portal { display: none !important; pointer-events: none !important; }',
    })
    .catch(() => {});
}

async function run() {
  log(`Starting UI smoke test`);
  log(`WEB_URL: ${WEB_URL}`);
  log(`API_URL: ${API_URL}`);
  log(`CHROME_BIN: ${CHROME_BIN}`);
  log(`OUT_DIR: ${OUT_DIR}`);

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
  });

  try {
    // ----------------------------------------------------
    // Context 1: Buyer Flow
    // ----------------------------------------------------
    log('--- [Step 1] Buyer Flow ---');
    const buyerContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await buyerContext.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.innerHTML =
          'nextjs-portal { display: none !important; pointer-events: none !important; }';
        document.head.appendChild(style);
      });
    });
    const buyerPage = await buyerContext.newPage();

    // 1.1 Buyer Login
    log('1.1 Navigating to buyer login...');
    await buyerPage.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await buyerPage.fill('input[name="email"]', 'an.nguyen@example.com');
    await buyerPage.fill('input[name="password"]', 'Password123!');
    await buyerPage.click('button[type="submit"]');

    // Wait for redirect to home
    await buyerPage.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15000,
    });
    log('1.1 Buyer logged in successfully.');
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '01-buyer-logged-in.png'),
    });

    // 1.2a Header search -> filter -> sort -> product, checked against the API
    log('1.2a Searching "iphone" from the header...');
    await buyerPage.goto(`${WEB_URL}/`, { waitUntil: 'networkidle' });
    const searchBox = buyerPage.getByRole('combobox', { name: 'Tìm sản phẩm' });
    await searchBox.fill('iphone');
    await buyerPage.getByRole('listbox').getByRole('option').first().waitFor();
    await searchBox.press('Enter');
    await buyerPage.waitForURL((url) => url.pathname === '/search' && url.searchParams.get('q') === 'iphone');
    const results = buyerPage.getByRole('region', { name: 'Kết quả tìm kiếm' });
    await results.locator('a[href^="/products/"]').first().waitFor({ timeout: 10000 });
    const apiCount = async (qs) =>
      buyerPage.evaluate(
        async (query) => (await (await fetch(`/api/v1/marketplace/products?${query}`)).json()).page.total,
        qs,
      );
    const cardCount = () => results.locator('a[href^="/products/"]').count();
    if ((await cardCount()) !== (await apiCount('q=iphone&page_size=30'))) {
      throw new Error('Search results differ from the API');
    }
    await buyerPage.getByRole('checkbox', { name: 'Đang giảm giá' }).check();
    await buyerPage.waitForURL((url) => url.searchParams.get('has_promotion') === 'true');
    await results.locator('a[href^="/products/"]').first().waitFor({ timeout: 10000 });
    if ((await cardCount()) !== (await apiCount('q=iphone&has_promotion=true&page_size=30'))) {
      throw new Error('Filtered results differ from the API');
    }
    await buyerPage.getByRole('button', { name: 'Bán chạy', exact: true }).first().click();
    await buyerPage.waitForURL(
      (url) => url.searchParams.get('sort') === 'top_sales' && url.searchParams.get('has_promotion') === 'true',
    );
    const firstCard = results.locator('a[href^="/products/"]').first();
    await firstCard.waitFor({ timeout: 10000 });
    const productHref = await firstCard.getAttribute('href');
    await buyerPage.screenshot({ path: path.join(OUT_DIR, '02a-search-iphone-filtered.png') });
    await firstCard.click();
    await buyerPage.waitForURL((url) => url.pathname === productHref, { timeout: 15000 });
    await buyerPage.waitForSelector('h1', { timeout: 10000 });
    log(`1.2a Search, filter and sort followed the API; opened ${productHref}.`);

    // 1.2b The header cart badge follows huspee:cart-changed
    log('1.2b Checking the header cart badge...');
    await buyerPage.goto(`${WEB_URL}/`, { waitUntil: 'networkidle' });
    const itemCount = await buyerPage.evaluate(async () => {
      const headers = { 'content-type': 'application/json', 'x-requested-with': 'huspee-sdk' };
      const body = JSON.stringify({ model_id: 3000121, quantity: 1 });
      const res = await fetch('/api/v1/cart/items', { method: 'POST', headers, body });
      const cart = (await res.json()).data;
      window.dispatchEvent(new Event('huspee:cart-changed'));
      return cart.item_count;
    });
    await buyerPage
      .locator(`header a[href="/cart"][aria-label="Giỏ hàng, ${itemCount} sản phẩm"]`)
      .first()
      .waitFor({ timeout: 10000 });
    log(`1.2b Cart badge shows ${itemCount}.`);

    // 1.2 Search for product
    log('1.2 Searching for "Redmi Buds 5"...');
    await buyerPage.goto(`${WEB_URL}/search?q=Redmi+Buds+5`, {
      waitUntil: 'networkidle',
    });
    await buyerPage.waitForSelector('a[href*="/products/"]', {
      timeout: 10000,
    });
    log('1.2 Search results loaded.');
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '02-search-results.png'),
    });

    // 1.3 View Product Detail
    log('1.3 Navigating to product detail (2000103)...');
    await buyerPage.goto(`${WEB_URL}/products/2000103`, {
      waitUntil: 'networkidle',
    });
    await buyerPage.waitForSelector('h1', { timeout: 10000 });
    const productName = await buyerPage.textContent('h1');
    log(`1.3 Product loaded: "${productName?.trim()}"`);
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '03-product-detail.png'),
    });

    // 1.4 Add to Cart
    log('1.4 Adding product to cart...');
    // Look for add to cart button (contains 'Thêm vào giỏ hàng' or 'Add to cart')
    const addBtn = buyerPage.locator(
      'button:has-text("Thêm vào giỏ"), button:has-text("Add to cart")',
    );
    await addBtn.first().click();

    // Wait for toast or brief delay for cart state update
    await buyerPage.waitForTimeout(1000);
    log('1.4 Added to cart.');

    // 1.5 Go to Cart & Select Item
    log('1.5 Navigating to /cart...');
    await buyerPage.goto(`${WEB_URL}/cart`, { waitUntil: 'networkidle' });
    await buyerPage.waitForSelector('input[type="checkbox"]', {
      timeout: 10000,
    });

    await dismissOverlay(buyerPage);
    // Select all items if not selected
    const selectAllCheckbox = buyerPage.locator('#sticky_select_all');
    if ((await selectAllCheckbox.count()) > 0) {
      const isChecked = await selectAllCheckbox.isChecked();
      if (!isChecked) {
        await selectAllCheckbox.check({ force: true });
      }
    } else {
      const firstCheck = buyerPage.locator('input[type="checkbox"]').first();
      if (!(await firstCheck.isChecked())) {
        await firstCheck.check({ force: true });
      }
    }

    await buyerPage.waitForTimeout(500);
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '04-cart-selected.png'),
    });

    // Click checkout button
    log('1.5 Proceeding to checkout...');
    const checkoutBtn = buyerPage.locator(
      'button:has-text("Mua hàng"), button:has-text("Checkout")',
    );
    await checkoutBtn.first().click({ force: true });

    await buyerPage.waitForURL((url) => url.pathname.includes('/checkout'), {
      timeout: 15000,
    });
    log('1.5 Navigated to /checkout.');

    // 1.6 Checkout & Place Order
    log('1.6 Completing checkout with prefix p2w0...');
    // Enter message to seller with prefix p2w0
    const messageInput = buyerPage
      .locator('input[placeholder*="Lưu ý"], input[placeholder*="message"]')
      .first();
    if ((await messageInput.count()) > 0) {
      await messageInput.fill('p2w0 closeout test order');
    }

    await buyerPage.waitForTimeout(500);
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '05-checkout-quote.png'),
    });

    // Click Place Order button
    const placeOrderBtn = buyerPage.locator(
      'button:has-text("Đặt hàng"), button:has-text("Place order")',
    );
    await placeOrderBtn.first().click({ force: true });

    // Wait for success page
    await buyerPage.waitForURL(
      (url) => url.pathname.includes('/checkout/success'),
      { timeout: 15000 },
    );
    log('1.6 Order placed successfully! On checkout success page.');
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '06-checkout-success.png'),
    });

    // Extract order SN
    const currentUrl = new URL(buyerPage.url());
    const orderSnsParam = currentUrl.searchParams.get('orders');
    if (!orderSnsParam) {
      throw new Error('Expected orders query param on checkout/success page');
    }
    const orderSn = orderSnsParam.split(',')[0].trim();
    log(`1.6 Created Order SN: ${orderSn}`);

    // 1.7 View Order in Buyer Orders List and Detail
    log(`1.7 Navigating to /orders to verify order visibility...`);
    await buyerPage.goto(`${WEB_URL}/orders`, { waitUntil: 'networkidle' });
    await buyerPage.waitForSelector(`text=${orderSn}`, { timeout: 10000 });
    log(`1.7 Order ${orderSn} is visible in buyer orders list.`);
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '07-buyer-orders-list.png'),
    });

    log(`1.7 Navigating to /orders/${orderSn} to check initial tracking...`);
    await buyerPage.goto(`${WEB_URL}/orders/${orderSn}`, {
      waitUntil: 'networkidle',
    });
    await buyerPage.waitForSelector('text=Chờ lấy hàng', {
      timeout: 10000,
    });
    log(`1.7 Buyer order detail and tracking loaded.`);
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '08-buyer-order-detail-initial.png'),
    });

    // ----------------------------------------------------
    // Context 2: Seller Flow
    // ----------------------------------------------------
    log('--- [Step 2] Seller Flow ---');
    const sellerContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await sellerContext.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.innerHTML =
          'nextjs-portal { display: none !important; pointer-events: none !important; }';
        document.head.appendChild(style);
      });
    });
    const sellerPage = await sellerContext.newPage();

    // 2.1 Seller Login
    log('2.1 Logging in as seller huy.techzone@example.com (shop 880001)...');
    await sellerPage.goto(`${SELLER_URL}/login`, { waitUntil: 'networkidle' });
    await sellerPage.fill('input[name="email"]', 'huy.techzone@example.com');
    await sellerPage.fill('input[name="password"]', 'Password123!');
    await sellerPage.click('button[type="submit"]');

    await sellerPage.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15000,
    });
    log('2.1 Seller logged in.');

    // 2.2 Check shop connection
    log('2.2 Checking shop connection at /shops...');
    await sellerPage.goto(`${SELLER_URL}/shops`, {
      waitUntil: 'networkidle',
    });

    // Check if connect button exists for shop 880001 (exact match, avoiding "Ngắt kết nối")
    const connectBtn = sellerPage.locator(
      'button:text-is("Kết nối shop"), button:text-is("Connect shop")',
    );
    if ((await connectBtn.count()) > 0) {
      log('2.2 Shop needs connection. Clicking connect...');
      await connectBtn.first().click();

      // Consent HTML is rendered by the API through the seller origin
      await sellerPage.waitForURL(
        (url) => url.pathname.includes('/auth_partner/consent'),
        { timeout: 15000 },
      );
      log('2.2 Consent page loaded. Authorizing access...');
      await sellerPage.screenshot({
        path: path.join(OUT_DIR, '09-seller-oauth-consent.png'),
      });

      // Click Authorize button: button[value="approve"]
      await sellerPage.click('button[value="approve"]');

      // Wait for redirect back to seller shops
      await sellerPage.waitForURL(
        (url) => url.origin === new URL(SELLER_URL).origin && url.pathname.startsWith('/shops'),
        { timeout: 15000 },
      );
      log('2.2 Shop connected successfully.');
    } else {
      log('2.2 Shop already connected.');
    }

    await sellerPage.screenshot({
      path: path.join(OUT_DIR, '10-seller-shops-connected.png'),
    });

    // 2.3 Seller Orders List
    log(`2.3 Navigating to /orders to find order ${orderSn}...`);
    await sellerPage.goto(`${SELLER_URL}/orders`, {
      waitUntil: 'networkidle',
    });
    await sellerPage.waitForSelector(`text=${orderSn}`, { timeout: 30000 });
    log(`2.3 Order ${orderSn} is visible in seller orders list.`);
    await sellerPage.screenshot({
      path: path.join(OUT_DIR, '11-seller-orders-list.png'),
    });

    // 2.4 Navigate to order detail in seller ops
    log(`2.4 Navigating to /orders/${orderSn}...`);
    await sellerPage.goto(`${SELLER_URL}/orders/${orderSn}`, {
      waitUntil: 'networkidle',
    });
    const shipBtn = sellerPage.locator(
      'button:has-text("Chuẩn bị hàng"), button:has-text("Arrange shipment")',
    );
    await shipBtn.waitFor({ state: 'visible', timeout: 30000 });
    log('2.4 Seller order detail loaded. Ready to ship.');
    await sellerPage.screenshot({
      path: path.join(OUT_DIR, '12-seller-order-detail.png'),
    });

    // 2.5 Ship the order
    log('2.5 Opening ShipModal to ship order...');
    await shipBtn.first().click({ force: true });

    // In modal, click confirm ship
    const confirmShipBtn = sellerPage
      .getByRole('dialog')
      .getByRole('button', { name: /^(Xác nhận|Confirm)$/ });
    await confirmShipBtn.waitFor({ state: 'visible', timeout: 15000 });
    await sellerPage.screenshot({
      path: path.join(OUT_DIR, '13-seller-ship-modal.png'),
    });

    await confirmShipBtn.first().click({ force: true });

    // Wait for modal to close and status to update to PROCESSED
    await sellerPage.waitForSelector('text=Đã xử lý', {
      timeout: 20000,
    });
    log('2.5 Order shipped. Current status: PROCESSED.');
    await sellerPage.screenshot({
      path: path.join(OUT_DIR, '14-seller-status-processed.png'),
    });

    // 2.6 Advance shipment via SimulationPanel
    log('2.6 Advancing shipment using simulation panel...');
    const advanceBtn = sellerPage.locator(
      'button:has-text("Lấy hàng thành công"), button:has-text("Picked up")',
    );
    await advanceBtn.waitFor({ state: 'visible', timeout: 15000 });
    await advanceBtn.click({ force: true });

    // Wait for status to become SHIPPED
    await sellerPage.waitForSelector('text=Đang giao', { timeout: 20000 });
    log('2.6 Shipment advanced to SHIPPED!');
    await sellerPage.screenshot({
      path: path.join(OUT_DIR, '15-seller-status-shipped.png'),
    });

    // ----------------------------------------------------
    // Context 1 Followup: Verify Buyer Tracking updated
    // ----------------------------------------------------
    log('--- [Step 3] Verify Buyer Tracking Status ---');
    log(`Reloading buyer order detail at /orders/${orderSn}...`);
    await buyerPage.goto(`${WEB_URL}/orders/${orderSn}`, {
      waitUntil: 'networkidle',
    });

    // Verify tracking shows SHIPPED or 'Đang giao hàng'
    await buyerPage.waitForSelector('text=Đang giao hàng', {
      timeout: 15000,
    });
    log('3.1 Buyer tracking successfully shows updated SHIPPED status!');
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '16-buyer-tracking-shipped.png'),
    });

    // ----------------------------------------------------
    // Step 4: Language Switch vi -> en
    // ----------------------------------------------------
    log('--- [Step 4] Language Switch vi -> en ---');
    await buyerPage.goto(`${WEB_URL}/`, { waitUntil: 'networkidle' });
    const langSelect = buyerPage.locator('select[aria-label="Language"]').first();
    await langSelect.waitFor({ state: 'visible', timeout: 5000 });
    await langSelect.selectOption('en');
    await buyerPage.waitForTimeout(500);

    // Verify English text appeared
    await buyerPage.waitForSelector('text=Categories', { timeout: 5000 });
    log('4.1 Language switched to English successfully.');
    await buyerPage.screenshot({
      path: path.join(OUT_DIR, '17-language-en.png'),
    });

    // Switch back to Vietnamese
    await langSelect.selectOption('vi');
    await buyerPage.waitForTimeout(500);

    // ----------------------------------------------------
    // Step 5: Responsive Check at 375 px (no horizontal overflow)
    // ----------------------------------------------------
    log('--- [Step 5] Responsive 375 px No Horizontal Overflow ---');
    const mobilePage = await buyerContext.newPage();
    await mobilePage.setViewportSize({ width: 375, height: 667 });

    const testPages = [
      { name: 'home', url: `${WEB_URL}/`, file: '18-mobile-home-375.png' },
      {
        name: 'product',
        url: `${WEB_URL}/products/2000103`,
        file: '19-mobile-product-375.png',
      },
      { name: 'cart', url: `${WEB_URL}/cart`, file: '20-mobile-cart-375.png' },
    ];

    for (const p of testPages) {
      log(`Checking 375 px layout on ${p.name} (${p.url})...`);
      await mobilePage.goto(p.url, { waitUntil: 'networkidle' });
      await mobilePage.waitForTimeout(500);

      const hasOverflow = await mobilePage.evaluate(() => {
        const docWidth = document.documentElement.clientWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        return scrollWidth > docWidth;
      });

      if (hasOverflow) {
        const widths = await mobilePage.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        throw new Error(
          `Horizontal overflow detected on ${p.name}: clientWidth=${widths.clientWidth}, scrollWidth=${widths.scrollWidth}`,
        );
      }

      log(`5.1 Page ${p.name}: NO horizontal overflow (PASS).`);
      await mobilePage.screenshot({ path: path.join(OUT_DIR, p.file) });
    }

    log('=============================================');
    log('ALL UI SMOKE TESTS PASSED SUCCESSFULLY! (100%)');
    log('=============================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('[FAIL] Smoke test error:', err);
  process.exit(1);
});
