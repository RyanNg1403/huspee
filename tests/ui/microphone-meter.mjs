import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, webkit, devices } from 'playwright-core';
import { openSheet, pollingEventSource } from './assistant-helpers.mjs';

const url = process.env.WEB_URL;
assert.ok(url, 'Set WEB_URL to the buyer web app; the assistant, microphone and WebRTC are mocked');
const engine = process.env.BROWSER || 'chromium';
const browser = await ({ chromium, webkit }[engine]).launch({ headless: true, executablePath: process.env.BROWSER_BIN });
const out = '.token/microphone-meter';
await fs.mkdir(out, { recursive: true });
try {
  // Before hydration, the form must not submit credentials into the URL via native GET.
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noScript.newPage();
  await fallback.goto(`${url}/login`);
  const fallbackForm = fallback.locator('form').filter({ has: fallback.locator('input[name="email"]') });
  assert.equal(await fallbackForm.getAttribute('method'), 'post');
  assert.equal(await fallbackForm.locator('button[type="submit"]').isDisabled(), true);
  await fallback.locator('input[name="email"]').fill('an.nguyen@example.com');
  await fallback.locator('input[name="password"]').fill('not-a-real-password');
  await fallback.locator('input[name="password"]').press('Enter');
  assert.equal(new URL(fallback.url()).search, '');
  await noScript.close();
  const context = await browser.newContext({ ...devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 5'], viewport: { width: 375, height: 812 } });
  await context.addCookies([{ name: 'huspee_lang', value: 'en', url }]);
  await context.addInitScript(pollingEventSource);
  await context.addInitScript(() => {
    window.mockMic = { amplitude: 0, remote: 0, reads: 0, paused: false, unavailable: false, stopped: 0 };
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => {
      const track = { enabled: true, muted: false, readyState: 'live', stop() { this.readyState = 'ended'; window.mockMic.stopped++; } };
      window.mockMic.track = track;
      return { kind: 'microphone', getTracks: () => [track], getAudioTracks: () => [track] };
    } } });
    window.Audio = class { async play() {} pause() {} };
    window.AudioContext = class {
      state = 'suspended';
      sampleRate = 48000;
      constructor() {
        if (window.mockMic.unavailable) throw new Error('Mock unavailable analyser');
        window.mockMic.context = this;
      }
      resume() {
        // Reproduce a mobile resume promise that stays pending until another user gesture.
        if (window.mockMic.paused) return new Promise(() => {});
        this.state = 'running';
        return Promise.resolve();
      }
      async close() { this.state = 'closed'; }
      createAnalyser() {
        return { fftSize: 1024, kind: undefined, getFloatTimeDomainData(samples) {
          if (this.kind === 'microphone') window.mockMic.reads++;
          const amplitude = this.kind === 'microphone' ? window.mockMic.amplitude : window.mockMic.remote;
          for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i * Math.PI / 16) * amplitude;
        } };
      }
      createMediaStreamSource(stream) { return { connect(analyser) { analyser.kind = stream.kind; } }; }
    };
    window.RTCPeerConnection = class {
      iceGatheringState = 'complete';
      channel = {};
      constructor() { window.mockMic.pc = this; }
      addTrack() {}
      createDataChannel() { return this.channel; }
      async createOffer() { return { type: 'offer', sdp: 'mock-offer' }; }
      async setLocalDescription(description) { this.localDescription = description; }
      async setRemoteDescription() { this.channel.onopen?.(); }
      close() {}
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // A delayed anonymous response from before login must not hide authenticated chat controls.
  let releaseInitialSession;
  const initialSession = new Promise((resolve) => { releaseInitialSession = resolve; });
  let heldSession = false;
  await page.route('**/api/v1/auth/me', async (route) => {
    if (heldSession) return route.continue();
    heldSession = true;
    await initialSession;
    return route.fulfill({ status: 401, json: { error: { code: 'unauthorized', message: 'Not signed in' } } });
  });
  // All assistant/audio operations are fake; never contact Codex or acquire a physical microphone.
  await page.route('**/vad/**', (route) => route.abort());
  await page.route('**/api/v1/assistant/shops/880002/profile', (route) => route.fulfill({ json: { data: { enabled: true, connected: true, shop_name: 'GlowUp Beauty', greeting: { en: 'How can I help?', vi: 'Mình có thể giúp gì?' } } } }));
  const id = '00000000-0000-4000-8000-000000000004';
  await page.route('**/api/v1/assistant/text/sessions', (route) => route.fulfill({ json: { data: { conversation_id: id } } }));
  let callRequests = 0;
  await page.route(`**/api/v1/assistant/voice/sessions/${id}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/call') && ++callRequests === 1) await new Promise((resolve) => setTimeout(resolve, 1200));
    const data = path.endsWith('/call') ? { conversation_id: id, call_id: '00000000-0000-4000-8000-000000000005', sdp_answer: 'mock-answer' }
      : path.endsWith('/poll') ? { events: [], cursor: 0, closed: false }
      : path.endsWith('/context') ? route.request().postDataJSON() : { ok: true };
    return route.fulfill({ json: { data } });
  });
  await page.goto(`${url}/login?next=%2Fproducts%2F2000201`);
  await page.locator('input[name="email"]').fill('an.nguyen@example.com');
  await page.locator('input[name="password"]').fill('Password123!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((target) => target.pathname === '/products/2000201');
  const staleSession = page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/me') && response.status() === 401);
  releaseInitialSession();
  await staleSession;
  await openSheet(page);
  const panel = page.locator('.assistant-panel');
  const meter = page.getByTestId('microphone-meter');
  const level = page.getByRole('meter', { name: 'Microphone input level' });
  async function waitState(state) { await page.locator(`[data-testid="microphone-meter"][data-state="${state}"]`).waitFor(); }
  async function call() {
    await panel.getByRole('button', { name: 'Call assistant', exact: true }).click();
    await panel.getByRole('button', { name: 'End call', exact: true }).waitFor();
  }
  async function hangup() {
    await panel.getByRole('button', { name: 'End call', exact: true }).click();
    await panel.getByRole('button', { name: 'Call assistant', exact: true }).waitFor();
    assert.equal(await meter.count(), 0);
  }
  await panel.getByRole('button', { name: 'Call assistant', exact: true }).click();
  await waitState('quiet');
  await panel.getByRole('button', { name: 'Cancel call', exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Mute', exact: true }).click();
  await waitState('muted');
  await panel.getByRole('button', { name: 'End call', exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Unmute', exact: true }).click();
  await waitState('quiet');
  assert.equal(await level.getAttribute('aria-valuenow'), '0');
  // Input must be measured before any remote audio track arrives.
  await page.evaluate(() => { window.mockMic.amplitude = 0.01; });
  await waitState('sound');
  const quietLevel = Number(await level.getAttribute('aria-valuenow'));
  assert.ok(quietLevel > 0);
  await page.evaluate(() => { window.mockMic.amplitude = 0.3; });
  await page.waitForFunction(() => Number(document.querySelector('[role="meter"]').getAttribute('aria-valuenow')) > 60);
  await page.screenshot({ path: `${out}/${engine}-mobile-sound.png` });
  await panel.getByRole('button', { name: 'Mute', exact: true }).click();
  await waitState('muted');
  assert.equal(await level.getAttribute('aria-valuenow'), '0');
  await page.screenshot({ path: `${out}/${engine}-mobile-muted.png` });
  await panel.getByRole('button', { name: 'Unmute', exact: true }).click();
  await waitState('sound');
  await page.getByRole('checkbox', { name: 'Push to talk', exact: true }).check();
  await waitState('hold');
  const hold = panel.getByRole('button', { name: 'Hold to talk', exact: true });
  const holdBox = await hold.boundingBox();
  await page.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2);
  await page.mouse.down();
  await waitState('sound');
  await hold.dispatchEvent('pointercancel', { pointerId: 1 });
  await waitState('hold');
  await page.mouse.up();
  await hold.focus();
  await page.keyboard.down('Space');
  await waitState('sound');
  await page.keyboard.up('Space');
  await waitState('hold');
  await page.getByRole('checkbox', { name: 'Push to talk', exact: false }).uncheck();
  await waitState('sound');
  // Loud assistant playback must not drive the microphone meter.
  await page.evaluate(() => { window.mockMic.amplitude = 0; window.mockMic.remote = 0.8; window.mockMic.pc.ontrack({ streams: [{ kind: 'remote' }] }); });
  await waitState('quiet');
  await page.waitForFunction(() => document.querySelector('[role="meter"]').getAttribute('aria-valuenow') === '0');
  await page.evaluate(() => { window.mockMic.track.muted = true; });
  await waitState('disconnected');
  await page.evaluate(() => { window.mockMic.track.muted = false; });
  await waitState('quiet');
  await hangup();
  const reads = await page.evaluate(() => window.mockMic.reads);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.mockMic.reads), reads, 'Hangup must stop analyser sampling');
  await page.evaluate(() => { window.mockMic.paused = true; });
  await call();
  await waitState('paused');
  await page.evaluate(() => { window.mockMic.paused = false; window.mockMic.amplitude = 0.1; });
  await meter.getByRole('button', { name: 'Enable meter' }).click();
  await waitState('sound');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.screenshot({ path: `${out}/${engine}-small-phone.png` });
  const bounds = await meter.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320 && bounds.y + bounds.height <= 568);
  await hangup();
  await page.evaluate(() => { window.mockMic.unavailable = true; });
  await call();
  await waitState('unavailable');
  assert.equal(await level.getAttribute('aria-valuenow'), '0');
  await hangup();
  assert.deepEqual(errors, []);
  console.log(`${engine}: mic amplitude, silence, mute, push-to-talk, interruption, remote isolation, resume, unavailable and cleanup passed (synthetic samples)`);
} finally {
  await browser.close();
}
