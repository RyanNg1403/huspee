import { sellerRouteAllowed } from './proxy-policy';
import {
  requestCookies,
  sellerSetCookie,
  localLocation,
  localAuthorizationUrl,
} from '@huspee/web-ui/lib/cookies';
/** Fixed upstream only: browsers use the web origin for API, cookies, media and SSE. */
export async function proxyApi(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  if (!sellerRouteAllowed(incoming.pathname, request.method)) {
    return Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
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
  headers.set('cookie', requestCookies(headers.get('cookie'), 'seller'));
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
    for (const cookie of response.headers.getSetCookie())
      outgoing.append('set-cookie', sellerSetCookie(cookie));
    const location = outgoing.get('location');
    if (location) {
      outgoing.set(
        'location',
        localLocation(location, upstream.href, [
          process.env.API_PUBLIC_URL || 'http://localhost:3000',
          process.env.WEB_APP_URL || 'http://localhost:3001',
        ]),
      );
    }
    // A buyer login must never become a Seller Centre session, even via a direct proxy call.
    if (response.ok && /^\/api\/v1\/auth\/(login|signup|me)$/.test(incoming.pathname)) {
      const payload: { data?: { roles?: string[] } } = await response.clone().json();
      if (!payload.data?.roles?.includes('seller')) {
        const issued = response.headers.getSetCookie().find((cookie) => cookie.startsWith('huspee_sid='));
        const logoutHeaders = new Headers(headers);
        if (issued) logoutHeaders.set('cookie', issued.split(';')[0]);
        logoutHeaders.set('x-requested-with', 'huspee-sdk');
        const logout = await fetch(new URL('/api/v1/auth/logout', upstream), {
          method: 'POST',
          headers: logoutHeaders,
          redirect: 'manual',
          cache: 'no-store',
        });
        const rejectedHeaders = new Headers();
        for (const cookie of logout.headers.getSetCookie())
          rejectedHeaders.append('set-cookie', sellerSetCookie(cookie));
        return Response.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'A seller account is required.',
            },
          },
          {
            status: 403,
            headers: rejectedHeaders,
          },
        );
      }
    }
    if (response.ok && /^\/api\/v1\/seller\/shops\/\d+\/authorization-url$/.test(incoming.pathname)) {
      const payload: { data: { authorization_url: string } } = await response.json();
      payload.data.authorization_url = localAuthorizationUrl(
        payload.data.authorization_url,
        process.env.API_PUBLIC_URL || 'http://localhost:3000',
      );
      return Response.json(payload, {
        status: response.status,
        headers: outgoing,
      });
    }
    outgoing.set('x-accel-buffering', 'no');
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      {
        error: {
          code: 'API_UNAVAILABLE',
          message: 'The shop is temporarily unavailable.',
        },
      },
      { status: 502 },
    );
  }
}
