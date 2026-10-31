/** Keep the browser on a stable workers.dev origin while the local tunnel changes. */
export default {
  async fetch(request, env) {
    try {
      const origin = new URL(env.TUNNEL_ORIGIN);
      if (
        origin.protocol !== 'https:' ||
        !origin.hostname.endsWith('.trycloudflare.com') ||
        origin.username || origin.password || origin.port ||
        origin.pathname !== '/' || origin.search || origin.hash
      ) throw new Error('Invalid tunnel origin');

      const incoming = new URL(request.url);
      // Assign the path separately: a path beginning with // must never choose an upstream.
      const target = new URL(origin);
      target.pathname = incoming.pathname;
      target.search = incoming.search;
      const forwarded = new Request(target, request);
      forwarded.headers.delete('host');
      forwarded.headers.set('x-forwarded-host', incoming.host);
      forwarded.headers.set('x-forwarded-proto', 'https');
      const response = await fetch(forwarded, {
        redirect: 'manual',
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      if (response.status === 101) return response;

      const headers = new Headers(response.headers);
      const location = headers.get('location');
      if (location) {
        const redirect = new URL(location, target);
        if (redirect.origin === origin.origin) {
          headers.set('location', incoming.origin + redirect.pathname + redirect.search + redirect.hash);
        }
      }
      if (incoming.pathname.startsWith('/api/')) headers.set('cache-control', 'no-store');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch {
      return new Response('Huspee is temporarily unavailable. Please try again.', {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
  },
};
