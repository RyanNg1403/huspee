import { requestCookies } from '@huspee/web-ui/lib/cookies';
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
  headers.set('cookie', requestCookies(headers.get('cookie'), 'buyer'));
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
      const target = new URL(location, upstream);
      const publicOrigin = new URL(process.env.API_PUBLIC_URL || 'http://localhost:3000').origin;
      const webOrigin = new URL(process.env.WEB_APP_URL || 'http://localhost:3001').origin;
      if ([upstream.origin, publicOrigin, webOrigin].includes(target.origin)) {
        outgoing.set('location', `${target.pathname}${target.search}${target.hash}`);
      }
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
