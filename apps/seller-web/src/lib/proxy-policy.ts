/** Routes used by seller SDK methods, consent HTML, studio voices and card detail reads. */
export function sellerRouteAllowed(path: string, method: string): boolean {
  // Reject encoded separators/dot segments rather than letting upstream decode a different path.
  if (/%|\\|\/\//.test(path) || path.split('/').some((part) => part === '.' || part === '..')) return false;
  if (/^\/api\/v1\/auth\/(login|signup|logout)$/.test(path)) return method === 'POST';
  if (path === '/api/v1/auth/me') return method === 'GET';
  if (path.startsWith('/api/v1/seller/')) return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (/^\/api\/v2\/shop\/auth_partner(?:\/(?:login|consent|approve))?$/.test(path))
    return ['GET', 'POST'].includes(method);
  if (path === '/api/v1/integrations/shopee/callback') return method === 'GET';
  if (!['GET', 'HEAD'].includes(method)) return false;
  return (
    path === '/healthz' ||
    path.startsWith('/media/') ||
    path === '/api/v1/assistant/voices' ||
    /^\/api\/v1\/marketplace\/products\/\d+(?:\/reviews)?$/.test(path)
  );
}
