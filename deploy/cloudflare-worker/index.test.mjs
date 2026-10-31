import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './index.mjs';

const env = { TUNNEL_ORIGIN: 'https://huspee-example.trycloudflare.com' };

test('forwards buyer/seller cookies, POST body, query and CSRF origin without following redirects', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (request, options) => {
    assert.equal(request.url, env.TUNNEL_ORIGIN + '/api/v1/auth/login?surface=seller');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('cookie'), 'huspee_sid=buyer; huspee_seller_sid=seller');
    assert.equal(request.headers.get('origin'), 'https://huspee.account.workers.dev');
    assert.equal(request.headers.get('x-forwarded-host'), 'huspee.account.workers.dev');
    assert.equal(request.headers.get('x-forwarded-proto'), 'https');
    assert.equal(request.headers.get('x-huspee-surface'), 'seller');
    assert.equal(await request.text(), '{"email":"demo@example.com"}');
    assert.equal(options.redirect, 'manual');
    return new Response(null, {
      status: 302,
      headers: [
        ['location', env.TUNNEL_ORIGIN + '/seller?next=orders'],
        ['set-cookie', 'huspee_sid=buyer; Secure; HttpOnly; Path=/'],
        ['set-cookie', 'huspee_seller_sid=seller; Secure; HttpOnly; Path=/'],
      ],
    });
  };
  try {
    const response = await worker.fetch(new Request('https://huspee.account.workers.dev/api/v1/auth/login?surface=seller', {
      method: 'POST',
      headers: { cookie: 'huspee_sid=buyer; huspee_seller_sid=seller', origin: 'https://huspee.account.workers.dev', 'x-huspee-surface': 'seller' },
      body: '{"email":"demo@example.com"}',
    }), env);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://huspee.account.workers.dev/seller?next=orders');
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { globalThis.fetch = originalFetch; }
});

test('double slash paths cannot select another upstream and external redirects are preserved', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (request) => {
    assert.equal(new URL(request.url).origin, env.TUNNEL_ORIGIN);
    assert.equal(new URL(request.url).pathname, '//example.com/private');
    return new Response(null, { status: 302, headers: { location: 'https://example.com/consent' } });
  };
  try {
    const response = await worker.fetch(new Request('https://huspee.account.workers.dev//example.com/private'), env);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://example.com/consent');
  } finally { globalThis.fetch = originalFetch; }
});

test('invalid configuration and unavailable tunnel return a noncached 502', async () => {
  for (const origin of ['http://localhost:3001', 'https://example.com', 'https://x.trycloudflare.com/private']) {
    const response = await worker.fetch(new Request('https://huspee.account.workers.dev/'), { TUNNEL_ORIGIN: origin });
    assert.equal(response.status, 502);
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('private connection details'); };
  try {
    const response = await worker.fetch(new Request('https://huspee.account.workers.dev/'), env);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(!(await response.text()).includes('private connection details'));
  } finally { globalThis.fetch = originalFetch; }
});
