import { localLocation, localAuthorizationUrl } from '@huspee/web-ui/lib/navigation';
/** Fixed upstream only: browsers use the web origin for API, cookies, media and SSE. */
export async function proxyApi(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  if (
    !incoming.pathname.startsWith('/api/') &&
    !incoming.pathname.startsWith('/media/') &&
    incoming.pathname !== '/healthz'
  ) {
    return new Response('Not found', { status: 404 });
  }
  const upstream = new URL(process.env.API_INTERNAL_URL || 'http://127.0.0.1:3000');
  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;
  const headers = new Headers(request.headers);
  for (const name of [
    'host',
    'connection',
    'content-length',
    'transfer-encoding',
    'upgrade',
    'accept-encoding',
  ])
    headers.delete(name);
  headers.set('accept-encoding', 'identity');
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
      signal: request.signal,
    });
    const outgoing = new Headers(response.headers);
    for (const name of [
      'connection',
      'transfer-encoding',
      'content-length',
      'content-encoding',
      'set-cookie',
    ])
      outgoing.delete(name);
    for (const cookie of response.headers.getSetCookie()) outgoing.append('set-cookie', cookie);
    const location = outgoing.get('location');
    if (location) {
      outgoing.set(
        'location',
        localLocation(location, upstream.href, [
          process.env.API_PUBLIC_URL || 'http://localhost:3000',
          process.env.SELLER_APP_URL || 'http://localhost:3002',
          incoming.origin,
        ]),
      );
    }
    // PUBLIC_BASE_URL is absolute with BROWSER_PROXY_ENABLED=false. Keep browser consent local.
    if (response.ok && /^\/api\/v1\/seller\/shops\/\d+\/authorization-url$/.test(incoming.pathname)) {
      const payload: { data: { authorization_url: string } } = await response.json();
      payload.data.authorization_url = localAuthorizationUrl(
        payload.data.authorization_url,
        process.env.API_PUBLIC_URL || 'http://localhost:3000',
      );
      return Response.json(payload, { status: response.status, headers: outgoing });
    }
    outgoing.set('x-accel-buffering', 'no');
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json(
      { error: { code: 'API_UNAVAILABLE', message: 'The shop is temporarily unavailable.' } },
      { status: 502 },
    );
  }
}
