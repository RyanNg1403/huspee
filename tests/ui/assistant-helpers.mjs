// Shared pieces for the assistant UI smoke scripts. They mock every assistant route; no real Codex.

/**
 * Cloudflare Quick Tunnel hosts make the widget poll `/poll` instead of opening SSE. On any other host
 * this init script swaps EventSource for one that reads the same mocked `/poll` route, so the scripts
 * run against a local dev server too.
 */
export function pollingEventSource() {
  if (location.hostname.endsWith('.trycloudflare.com')) return;
  window.EventSource = class {
    constructor(target) {
      this.closed = false;
      let cursor = 0;
      const poll = async () => {
        if (this.closed) return;
        try {
          const response = await fetch(String(target).replace(/\/events$/, `/poll?after=${cursor}`), { credentials: 'include' });
          const body = await response.json();
          if (body.data) {
            cursor = body.data.cursor;
            for (const event of body.data.events) if (!this.closed) this.onmessage?.({ data: JSON.stringify(event) });
          }
        } catch {
          // A failed mock poll is retried like the tunnel transport.
        }
        if (!this.closed) setTimeout(poll, 300);
      };
      setTimeout(poll, 0);
    }
    close() {
      this.closed = true;
    }
  };
}

export async function signIn(page, url, next) {
  await page.goto(`${url}/login?next=${encodeURIComponent(next)}`);
  await page.locator('input[name="email"]').fill('an.nguyen@example.com');
  await page.locator('input[name="password"]').fill('Password123!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((target) => target.pathname === next);
}

/** Phone: open the sheet from the launcher bar. */
export async function openSheet(page) {
  await page.getByTestId('assistant-launcher').click();
  await page.locator('.assistant-panel').waitFor({ state: 'visible' });
}

/** Phone: switch the sheet's footer to typing. */
export async function showTyping(page) {
  const panel = page.locator('.assistant-panel');
  const box = panel.getByRole('textbox', { name: 'Message the assistant' });
  if (!(await box.isVisible())) await panel.getByRole('button', { name: 'Type', exact: true }).click();
  return box;
}

/** Types a message; the first one starts the text conversation. */
export async function say(page, text, { echo = true } = {}) {
  const box = await showTyping(page);
  await box.fill(text);
  await box.press('Enter');
  if (echo) await page.locator('.assistant-panel').getByText(text, { exact: true }).first().waitFor();
}
