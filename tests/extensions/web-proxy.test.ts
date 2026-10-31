import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { proxyApi } from '../../apps/web/src/lib/api-proxy.js';

let upstream: Server;
beforeAll(async () => {
  upstream = createServer(async (req, res) => {
    if (req.url === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"type":"ready"}\n\n');
      return; // Leave open: the proxy must deliver this event before the stream ends.
    }
    if (req.url === '/api/redirect') {
      res.writeHead(303, { location: 'http://localhost:3000/api/callback?code=demo' });
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': ['session=demo; Path=/; HttpOnly; SameSite=Lax', 'state=demo; Path=/api/callback; HttpOnly'],
    });
    res.end(JSON.stringify({ method: req.method, path: req.url, cookie: req.headers.cookie, csrf: req.headers['x-requested-with'], body: Buffer.concat(chunks).toString() }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('API_INTERNAL_URL', `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`);
  vi.stubEnv('API_PUBLIC_URL', 'http://localhost:3000');
});
afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  vi.unstubAllEnvs();
});

it('forwards session, CSRF, method, query and body from an arbitrary phone origin', async () => {
  const response = await proxyApi(new Request('https://phone.example/api/cart?shop=1', {
    method: 'POST', headers: { cookie: 'session=buyer', 'x-requested-with': 'huspee-sdk', 'content-type': 'application/json' },
    body: '{"quantity":2}',
  }));
  expect(await response.json()).toEqual({ method: 'POST', path: '/api/cart?shop=1', cookie: 'session=buyer', csrf: 'huspee-sdk', body: '{"quantity":2}' });
  expect(response.headers.getSetCookie()).toHaveLength(2);
});

it('keeps registered OAuth callbacks on the forwarded browser origin', async () => {
  const response = await proxyApi(new Request('https://phone.example/api/redirect'));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/api/callback?code=demo');
});

it('streams assistant events immediately without waiting for the connection to close', async () => {
  const abort = new AbortController();
  const response = await proxyApi(new Request('https://phone.example/api/events', { signal: abort.signal }));
  const reader = response.body!.getReader();
  const chunk = await reader.read();
  expect(new TextDecoder().decode(chunk.value)).toContain('"type":"ready"');
  abort.abort();
  await reader.cancel().catch(() => undefined);
});

it('does not act as a proxy outside its fixed API/media routes', async () => {
  expect((await proxyApi(new Request('https://phone.example/private'))).status).toBe(404);
});
