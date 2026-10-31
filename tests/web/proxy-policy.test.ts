import { describe, expect, it } from 'vitest';
import { requestCookies, sellerSetCookie, localLocation, localAuthorizationUrl } from '../../packages/web-ui/src/lib/cookies.js';
import { sellerRouteAllowed } from '../../apps/seller-web/src/lib/proxy-policy.js';

describe('surface cookies', () => {
  it('isolates both sessions while preserving unrelated cookies and opaque values', () => {
    const cookies = 'huspee_sid=buyer; huspee_oauth_state=a=b; huspee_seller_sid=seller==; huspee_lang=vi';
    expect(requestCookies(cookies, 'seller')).toBe('huspee_oauth_state=a=b; huspee_sid=seller==; huspee_lang=vi');
    expect(requestCookies(cookies, 'buyer')).toBe('huspee_sid=buyer; huspee_oauth_state=a=b; huspee_lang=vi');
    expect(requestCookies('huspee_sid=buyer', 'seller')).toBe('');
    expect(requestCookies('huspee_seller_sid=seller', 'buyer')).toBe('');
    expect(requestCookies(null, 'seller')).toBe('');
  });
  it.each([
    'huspee_sid=value==; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800',
    'huspee_sid=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0',
  ])('renames only the session name, including deletion: %s', (cookie) => {
    expect(sellerSetCookie(cookie)).toBe(cookie.replace('huspee_sid=', 'huspee_seller_sid='));
  });
  it('keeps separate Set-Cookie headers and other names intact', () => {
    const cookies = ['huspee_sid=x; HttpOnly', 'huspee_oauth_state=y; Path=/api', 'other=huspee_sid=x'];
    expect(cookies.map(sellerSetCookie)).toEqual(['huspee_seller_sid=x; HttpOnly', cookies[1], cookies[2]]);
  });
});

describe('seller proxy route policy', () => {
  it.each([
    ['POST', '/api/v1/auth/login'], ['POST', '/api/v1/auth/signup'], ['POST', '/api/v1/auth/logout'],
    ['GET', '/api/v1/auth/me'], ['GET', '/api/v1/seller/shops'], ['POST', '/api/v1/seller/shops/880001/shopee'],
    ['PUT', '/api/v1/seller/shops/880001/assistant/config'], ['GET', '/api/v1/seller/shops/880001/inbox'],
    ['GET', '/api/v1/assistant/voices'], ['GET', '/api/v1/marketplace/products/2000101'],
    ['GET', '/api/v1/marketplace/products/2000101/reviews'], ['GET', '/api/v2/shop/auth_partner'],
    ['GET', '/api/v2/shop/auth_partner/login'], ['POST', '/api/v2/shop/auth_partner/login'],
    ['GET', '/api/v2/shop/auth_partner/consent'], ['POST', '/api/v2/shop/auth_partner/consent'],
    ['POST', '/api/v2/shop/auth_partner/approve'], ['GET', '/api/v1/integrations/shopee/callback'], ['GET', '/media/image.webp'], ['HEAD', '/healthz'],
  ])('permits %s %s', (method, path) => expect(sellerRouteAllowed(path, method)).toBe(true));
  it.each([
    '/api/v1/cart', '/api/v1/cart/items', '/api/v1/checkout', '/api/v1/shipping/quote',
    '/api/v1/buyer/orders', '/api/v1/buyer/returns', '/api/v1/buyer/messages',
    '/api/v1/assistant/text/sessions', '/api/v1/assistant/voice/sessions/a/events',
    '/api/v1/assistant/actions/a/confirm', '/api/v1/assistant/connection',
    '/api/v1/assistant/shops/880001/conversations', '/api/v1/assistant/conversations/a',
    '/api/v2/auth/token/get', '/api/v2/shop/auth_partner_evil', '/api/v1/sellerevil/shops',
    '/api/v1/seller/../buyer/orders', '/api/v1/seller/%2e%2e/buyer/orders',
    '/api/v1/seller//shops', '/api/v1/seller/shops%2f..', '/api/v1/marketplace/products',
  ])('blocks %s for every method', (path) => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) expect(sellerRouteAllowed(path, method)).toBe(false);
  });
  it('does not turn public reads into writes or me into a mutation', () => {
    for (const path of ['/api/v1/marketplace/products/1', '/api/v1/assistant/voices', '/healthz', '/media/a', '/api/v1/auth/me']) {
      expect(sellerRouteAllowed(path, 'POST')).toBe(false);
    }
  });
});

describe('origin-preserving navigation', () => {
  const upstream = 'http://api:3000/api/v2/shop/auth_partner';
  const origins = ['http://localhost:4101', 'http://localhost:4201'];
  it.each(['http://api:3000', ...origins])('localizes known origin %s with query and fragment intact', (origin) => {
    expect(localLocation(`${origin}/seller/shops/880001?connected=1#status`, upstream, origins))
      .toBe('/seller/shops/880001?connected=1#status');
  });
  it('preserves external destinations and local callbacks', () => {
    expect(localLocation('https://example.com/callback?code=x', upstream, origins)).toBe('https://example.com/callback?code=x');
    expect(localLocation('/api/callback?code=x', upstream, origins)).toBe('/api/callback?code=x');
    expect(localLocation('http://localhost.evil.test:4101/callback', upstream, origins)).toContain('evil.test');
  });
  it('localizes absolute authorization URLs only for the API public origin', () => {
    expect(localAuthorizationUrl('http://localhost:4101/api/v2/shop/auth_partner?sign=a%2Bb', origins[0]))
      .toBe('/api/v2/shop/auth_partner?sign=a%2Bb');
    expect(localAuthorizationUrl('/api/v2/shop/auth_partner?sign=x', origins[0])).toBe('/api/v2/shop/auth_partner?sign=x');
    expect(localAuthorizationUrl('https://external.test/authorize', origins[0])).toBe('https://external.test/authorize');
  });
});
