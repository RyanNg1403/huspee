import { localAuthorizationUrl, localLocation } from '@huspee/web-ui/lib/navigation';

const REQUEST_HOP_HEADERS = [
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'upgrade',
  'accept-encoding',
];
const RESPONSE_HOP_HEADERS = [
  'connection',
  'transfer-encoding',
  'content-length',
  'content-encoding',
  'set-cookie',
];
const AUTHORIZATION_URL_PATH = /^\/api\/v1\/seller\/shops\/\d+\/authorization-url$/;

/**
 * Fixed upstream only: browsers use their app origin for API, cookies, media and SSE.
 * `appOrigin` is read per request so standalone deployments can change it without rebuilding.
 */
export function createApiProxy(appOrigin: () => string, basePath = '') {
  return async function proxyApi(request: Request): Promise<Response> {
    const incoming = new URL(request.url);
    if (basePath && incoming.pathname.startsWith(`${basePath}/`)) {
      incoming.pathname = incoming.pathname.slice(basePath.length);
    }
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
    const publicOrigin = process.env.API_PUBLIC_URL || 'http://localhost:3000';
    const headers = new Headers(request.headers);
    for (const name of REQUEST_HOP_HEADERS) headers.delete(name);
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
      for (const name of RESPONSE_HOP_HEADERS) outgoing.delete(name);
      for (const cookie of response.headers.getSetCookie()) outgoing.append('set-cookie', cookie);
      const location = outgoing.get('location');
      if (location) {
        outgoing.set(
          'location',
          localLocation(location, upstream.href, [publicOrigin, appOrigin(), incoming.origin]),
        );
      }
      // PUBLIC_BASE_URL is absolute with BROWSER_PROXY_ENABLED=false. Keep browser consent local.
      if (response.ok && AUTHORIZATION_URL_PATH.test(incoming.pathname)) {
        const payload: { data: { authorization_url: string } } = await response.json();
        payload.data.authorization_url = localAuthorizationUrl(payload.data.authorization_url, publicOrigin);
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
  };
}
