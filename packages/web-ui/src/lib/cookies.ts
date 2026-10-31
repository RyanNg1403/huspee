/** Pure header transforms: cookie values and Set-Cookie attributes remain opaque. */
export function requestCookies(cookie: string | null, surface: 'buyer' | 'seller'): string {
  return (cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separator = part.indexOf('=');
      const name = part.slice(0, separator).trim();
      if (surface === 'buyer') return name === 'huspee_seller_sid' ? [] : [part];
      if (name === 'huspee_sid') return [];
      return [name === 'huspee_seller_sid' ? `huspee_sid${part.slice(separator)}` : part];
    })
    .join('; ');
}

export function sellerSetCookie(cookie: string): string {
  return cookie.replace(/^huspee_sid=/, 'huspee_seller_sid=');
}

/** Only known application origins become local paths; external redirects are preserved. */
export function localLocation(location: string, upstream: string, origins: string[]): string {
  const target = new URL(location, upstream);
  return [new URL(upstream).origin, ...origins.map((origin) => new URL(origin).origin)].includes(
    target.origin,
  )
    ? `${target.pathname}${target.search}${target.hash}`
    : location;
}

export function localAuthorizationUrl(url: string, publicOrigin: string): string {
  return localLocation(url, publicOrigin, []);
}
