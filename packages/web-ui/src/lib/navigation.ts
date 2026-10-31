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
