import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit, devices } from 'playwright-core';
import { openSheet, pollingEventSource, say, signIn } from './assistant-helpers.mjs';

const url = process.env.WEB_URL;
assert.ok(url, 'Set WEB_URL to the buyer web app; every assistant route is mocked');
const engine = process.env.BROWSER || 'chromium';
const browser = await ({ chromium, webkit }[engine]).launch({ headless: true, executablePath: process.env.BROWSER_BIN });
const out = '.token/chat-layout';
await fs.mkdir(out, { recursive: true });
try {
  const context = await browser.newContext({ ...devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 5'], viewport: { width: 375, height: 812 } });
  await context.addCookies([{ name: 'huspee_lang', value: 'en', url }]);
  await context.addInitScript(pollingEventSource);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const id = '00000000-0000-4000-8000-000000000006';
  const events = Array.from({ length: 40 }, (_, index) => ({ type: 'transcript', role: index % 2 ? 'assistant' : 'user', text: `Shopping question ${index}: Which product suits my preferences and budget?`, final: true, source: 'text' }));
  events.push({ type: 'card', source: 'text', card: { kind: 'products', items: [
    { item_id: 2000201, name: 'Sữa rửa mặt La Roche-Posay Effaclar Gel 400ml', image: '/media/seed-photo-2000201-0', price_min: 400000, price_max: 400000, stock: 1, rating: null },
    { item_id: 2000202, name: 'Nước bí đao Cocoon cân bằng da 310ml', image: '/media/seed-photo-2000202-0', price_min: 245000, price_max: 245000, stock: 1, rating: null },
  ] } });
  await page.route('**/api/v1/assistant/shops/880002/profile', (route) => route.fulfill({ json: { data: { enabled: true, connected: true, shop_name: 'GlowUp Beauty', greeting: { en: 'How can I help?', vi: 'Mình có thể giúp gì?' } } } }));
  await page.route('**/api/v1/assistant/text/sessions', (route) => route.fulfill({ json: { data: { conversation_id: id } } }));
  await page.route(`**/api/v1/assistant/voice/sessions/${id}/**`, (route) => {
    const target = new URL(route.request().url());
    const data = target.pathname.endsWith('/poll') ? { events: target.searchParams.get('after') === '0' ? events : [], cursor: events.length, closed: false }
      : target.pathname.endsWith('/context') ? route.request().postDataJSON() : { ok: true };
    return route.fulfill({ json: { data } });
  });
  await signIn(page, url, '/products/2000201');
  await page.locator('h1').waitFor();
  await page.evaluate(() => {
    // Reproduce a scrolled product page and a layout ancestor that traps position:fixed children.
    document.querySelector('main').parentElement.style.transform = 'translateZ(0)';
    window.scrollTo(0, 600);
  });
  const originalScroll = await page.evaluate(() => scrollY);
  assert.ok(originalScroll > 0);
  await openSheet(page);
  const panel = page.locator('.assistant-panel');
  const transcript = page.getByTestId('chat-transcript');
  const composer = page.getByTestId('chat-composer');
  /** The sheet sits on the bottom edge at full width; a short (keyboard) viewport gives it all the height. */
  async function checkLayout(width, height) {
    const box = await panel.boundingBox(), footer = await composer.boundingBox(), messages = await transcript.boundingBox();
    assert.ok(box && Math.abs(box.x) < 1 && Math.abs(box.width - width) < 1 && Math.abs(box.y + box.height - height) < 1 && box.y >= 0, `Sheet must sit on the bottom edge: ${JSON.stringify(box)}`);
    if (height < 520) assert.ok(Math.abs(box.y) < 1, `A short viewport gives the sheet all the height: ${JSON.stringify(box)}`);
    else assert.ok(box.y > 0 && box.height >= height * 0.6 - 1, `The sheet leaves the page visible above it: ${JSON.stringify(box)}`);
    assert.ok(footer && footer.y + footer.height <= height + 1 && footer.y >= 0, 'Composer must stay on screen');
    assert.ok(messages && messages.height > 30 && messages.y + messages.height <= footer.y + 1, 'Transcript must own the remaining scroll area');
    assert.equal(await page.evaluate(() => document.querySelector('.assistant-dock').parentElement === document.body), true, 'Chat must escape layout ancestors');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).position), 'fixed');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
  }
  await say(page, 'Hello', { echo: false });
  await page.getByTestId('conversation-products').waitFor();
  await checkLayout(375, 812);
  assert.equal(await panel.getAttribute('role'), 'dialog');
  await page.screenshot({ path: `${out}/${engine}-phone.png` });
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.evaluate(() => window.scrollTo(0, 4000));
  await transcript.evaluate((element) => { element.scrollTop = 0; });
  if (engine === 'chromium') {
    await transcript.hover();
    await page.mouse.wheel(0, 600);
  } else {
    // Playwright does not support wheel events in mobile WebKit; native touch is covered above
    // by Chromium/CDP, while WebKit checks the independent scroll container and its bounds.
    await transcript.evaluate((element) => element.scrollBy(0, 600));
  }
  await page.waitForTimeout(250);
  assert.ok(await transcript.evaluate((element) => element.scrollTop > 0), 'Messages must scroll');
  assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'Background must not scroll with the chat');
  await checkLayout(375, 812);
  if (engine === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const bounds = await transcript.boundingBox();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height - 20;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 5; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 30 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
    await checkLayout(375, 812);
    assert.equal(await page.evaluate(() => scrollY), scrollBefore);
  }
  await panel.getByRole('textbox', { name: 'Message the assistant' }).focus();
  await page.setViewportSize({ width: 375, height: 420 });
  await page.waitForTimeout(150);
  await checkLayout(375, 420);
  await page.screenshot({ path: `${out}/${engine}-keyboard.png` });
  for (const size of [{ width: 320, height: 568 }, { width: 720, height: 900 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    await checkLayout(size.width, size.height);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(150);
  await panel.getByRole('button', { name: 'Minimize assistant', exact: true }).click();
  await page.waitForFunction(() => getComputedStyle(document.body).position !== 'fixed');
  assert.ok(Math.abs((await page.evaluate(() => scrollY)) - originalScroll) < 2, 'Closing must restore the original page position');
  await openSheet(page);
  await checkLayout(375, 812);
  await page.keyboard.press('Escape');
  await page.getByTestId('assistant-launcher').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), 'assistant-launcher', 'Escape returns focus to the launcher');
  await openSheet(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => getComputedStyle(document.body).position !== 'fixed');
  const desktop = await panel.boundingBox();
  assert.ok(desktop.width <= 401 && desktop.x > 800 && desktop.y + desktop.height <= 901, `Desktop pins the panel to the right: ${JSON.stringify(desktop)}`);
  const pageRight = await page.evaluate(() => document.querySelector('main').getBoundingClientRect().right);
  assert.ok(pageRight <= desktop.x + 1, 'The pinned panel must not cover the page');
  await page.screenshot({ path: `${out}/${engine}-desktop.png` });
  await panel.getByRole('button', { name: 'End chat', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(`${engine}: scrolled page, transformed ancestor, scroll isolation, keyboard, portrait/landscape, restoration, focus and pinned desktop passed${engine === 'chromium' ? ' (wheel + touch gestures)' : ''}`);
} finally {
  await browser.close();
}
