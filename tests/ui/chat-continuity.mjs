import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit, devices } from 'playwright-core';
import { openSheet, pollingEventSource, say, signIn } from './assistant-helpers.mjs';

const url = process.env.WEB_URL;
assert.ok(url, 'Set WEB_URL to the buyer web app; every assistant route and WebRTC are mocked');
const engine = process.env.BROWSER || 'chromium';
const browser = await ({ chromium, webkit }[engine]).launch({ headless: true, executablePath: process.env.BROWSER_BIN });
const out = '.token/chat-continuity';
await fs.mkdir(out, { recursive: true });
try {
  const context = await browser.newContext({ ...devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 5'], viewport: { width: 375, height: 812 } });
  await context.addCookies([{ name: 'huspee_lang', value: 'en', url }]);
  await context.addInitScript(pollingEventSource);
  await context.addInitScript(() => {
    window.mockVoice = { stopped: 0, deny: false, calls: 0, pc: null };
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => {
      if (window.mockVoice.deny) throw new DOMException('Denied', 'NotAllowedError');
      const track = { enabled: true, stop() { window.mockVoice.stopped++; } };
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    } } });
    // No actual microphone, remote media, VAD download or paid/live assistant session.
    window.AudioContext = class { constructor() { throw new Error('Mock audio'); } };
    window.Audio = class { async play() {} pause() {} };
    window.RTCPeerConnection = class {
      iceGatheringState = 'complete';
      connectionState = 'connected';
      channel = {};
      constructor() { window.mockVoice.pc = this; }
      addTrack() {}
      createDataChannel() { return this.channel; }
      async createOffer() { return { type: 'offer', sdp: 'mock-offer' }; }
      async setLocalDescription(description) { this.localDescription = description; }
      async setRemoteDescription() {
        this.channel.onopen?.();
        const text = ++window.mockVoice.calls === 1 ? 'Tell me about Cocoon.' : 'Compare both products again.';
        for (const type of ['turn.created', 'turn.done']) {
          this.channel.onmessage?.({ data: JSON.stringify({ type, turn: { id: 'reused-turn', role: 'user', transcript: text } }) });
        }
      }
      close() { this.connectionState = 'closed'; }
    };
  });
  const page = await context.newPage();
  const errors = [], requests = [], events = [];
  let starts = 0, ends = 0, callNumber = 0, failCall = false, delayCall = false;
  const id = '00000000-0000-4000-8000-000000000003';
  const laRoche = { item_id: 2000201, name: 'Sữa rửa mặt La Roche-Posay Effaclar Gel 400ml', image: '/media/seed-photo-2000201-0', price_min: 400000, price_max: 400000, stock: 1, rating: null };
  const cocoon = { item_id: 2000202, name: 'Nước bí đao Cocoon cân bằng da 310ml', image: '/media/seed-photo-2000202-0', price_min: 245000, price_max: 245000, stock: 1, rating: null };
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/v1/assistant/text/sessions', (route) => {
    starts++;
    events.length = 0;
    return route.fulfill({ json: { data: { conversation_id: id } } });
  });
  await page.route(`**/api/v1/assistant/voice/sessions/${id}/**`, async (route) => {
    const target = new URL(route.request().url());
    const path = target.pathname;
    requests.push(path);
    if (path.endsWith('/poll')) return route.fulfill({ json: { data: { events: events.slice(Number(target.searchParams.get('after') || 0)), cursor: events.length, closed: false } } });
    if (path.endsWith('/context')) return route.fulfill({ json: { data: route.request().postDataJSON() } });
    if (path.endsWith('/call')) {
      if (failCall) return route.fulfill({ status: 503, json: { error: { code: 'assistant_unavailable', message: 'Fake failed call' } } });
      const callId = `00000000-0000-4000-8000-${String(++callNumber).padStart(12, '0')}`;
      if (delayCall) await new Promise((r) => setTimeout(r, 900));
      events.push({ type: 'card', source: 'voice', card: { kind: 'products', items: [cocoon] } });
      return route.fulfill({ json: { data: { conversation_id: id, call_id: callId, sdp_answer: 'mock-answer' } } });
    }
    if (path.endsWith('/call/stop')) return route.fulfill({ json: { data: { ok: true } } });
    if (path.endsWith('/stop')) ends++;
    if (path.endsWith('/text')) {
      const { text } = route.request().postDataJSON();
      events.push({ type: 'transcript', role: 'user', text, final: true, source: 'text', item_id: `text-${events.length}` });
      if (text === 'Does La Roche have a discount?') events.push({ type: 'card', source: 'text', card: { kind: 'products', items: [laRoche] } });
      if (text === 'Remember both?') events.push({ type: 'transcript', role: 'assistant', text: 'We discussed La Roche and Cocoon.', final: true, source: 'text', item_id: 'recall' });
    }
    return route.fulfill({ json: { data: { ok: true } } });
  });
  await signIn(page, url, '/products/2000201');
  await page.locator('h1').waitFor();
  await openSheet(page);
  const panel = page.locator('.assistant-panel');
  const original = 'Does La Roche have a discount?';
  await say(page, original);
  const productContext = page.getByTestId('conversation-products');
  // The list of products found in this conversation starts collapsed to one line.
  await productContext.getByRole('button').click();
  await productContext.getByRole('link', { name: `Text ${laRoche.name}`, exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).click();
  await panel.getByRole('button', { name: 'End call', exact: true }).waitFor();
  await panel.getByText('Tell me about Cocoon.', { exact: true }).waitFor();
  await productContext.getByRole('link', { name: `Voice ${cocoon.name}`, exact: true }).waitFor();
  await productContext.getByText('2 products', { exact: true }).waitFor();
  assert.equal(await panel.getByText(original, { exact: true }).count(), 1, 'Opening the channel must retain text');
  await page.screenshot({ path: `${out}/${engine}-mobile-call.png` });
  await panel.getByRole('button', { name: 'End call', exact: true }).click();
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).waitFor();
  await say(page, 'Remember both?');
  await panel.getByText('We discussed La Roche and Cocoon.', { exact: true }).waitFor();
  assert.equal(ends, 0, 'Hanging up must not end chat');
  assert.equal(await page.evaluate(() => window.mockVoice.stopped), 1, 'Microphone must stop');
  assert.equal(await productContext.getByRole('link').count(), 2, 'Hanging up must retain both product contexts');
  await page.screenshot({ path: `${out}/${engine}-mobile-text.png` });
  await productContext.getByRole('link', { name: `Voice ${cocoon.name}`, exact: true }).click();
  await page.waitForURL((target) => target.pathname === '/products/2000202');
  await page.getByTestId('product-context-notice').getByText('Viewing', { exact: true }).waitFor();
  assert.ok((await page.getByTestId('product-context-notice').innerText()).includes(cocoon.name.slice(0, 20)), 'The viewed row follows the page');
  assert.equal(await productContext.getByRole('link').count(), 2, 'Viewing Cocoon must keep La Roche in the conversation context');
  await productContext.getByRole('button').click();
  assert.equal(await productContext.getByRole('button').getAttribute('aria-expanded'), 'false');
  await productContext.getByRole('button').click();
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).click();
  await panel.getByText('Compare both products again.', { exact: true }).waitFor();
  assert.equal(await panel.getByText('Tell me about Cocoon.', { exact: true }).count(), 1, 'Repeated channel IDs must retain earlier calls');
  // Simulate a disconnected peer: text remains usable.
  await page.evaluate(() => { const pc = window.mockVoice.pc; pc.connectionState = 'disconnected'; pc.onconnectionstatechange(); });
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).waitFor();
  await page.evaluate(() => { window.mockVoice.deny = true; });
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).click();
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).waitFor();
  await panel.getByText('The browser is blocking the microphone', { exact: true }).waitFor();
  await say(page, 'Continue after microphone denial');
  await page.evaluate(() => { window.mockVoice.deny = false; });
  failCall = true;
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).click();
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).waitFor();
  await say(page, 'Continue after call failure');
  failCall = false; delayCall = true;
  const joining = page.waitForRequest((request) => request.url().endsWith('/call'));
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).click();
  await joining;
  await panel.getByRole('button', { name: 'Cancel call', exact: true }).click();
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).waitFor();
  await say(page, 'Continue after cancelling');
  await page.waitForTimeout(1000); // let the delayed answer exercise stale-call cleanup
  assert.equal(await panel.getByRole('button', { name: 'End call', exact: true }).count(), 0);
  assert.equal(starts, 1, 'All modes must use one conversation');
  assert.equal(ends, 0);
  assert.ok(requests.some((path) => path.endsWith('/call/stop')));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${out}/${engine}-desktop-text.png` });
  await panel.getByRole('button', { name: 'End chat', exact: true }).click();
  await page.waitForTimeout(100);
  assert.equal(ends, 1);
  assert.equal(await productContext.count(), 0, 'Ended chat must not advertise live context');
  await say(page, 'A new chat');
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).waitFor();
  assert.equal(starts, 2);
  assert.equal(await productContext.count(), 0, 'A new conversation must not inherit the old product indicator');
  assert.deepEqual(errors, []);
  console.log(`${engine}: shared text/voice, product context, navigation, reset and call failure cases passed (mock WebRTC/assistant)`);
} finally {
  await browser.close();
}
