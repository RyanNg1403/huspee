import { NextResponse, type NextRequest } from 'next/server';

/** Runtime env: standalone deployments can point at a different Seller Centre without rebuilding. */
export function proxy(request: NextRequest) {
  if (process.env.SELLER_INTERNAL_URL) {
    const upstream = new URL(process.env.SELLER_INTERNAL_URL);
    upstream.pathname = request.nextUrl.pathname;
    upstream.search = request.nextUrl.search;
    return NextResponse.rewrite(upstream);
  }
  const target = new URL(process.env.SELLER_APP_URL || 'http://localhost:3002');
  const prefix = target.pathname.replace(/\/$/, '');
  target.pathname = prefix + (request.nextUrl.pathname.replace(/^\/seller(?=\/|$)/, '') || '/');
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
}
export const config = { matcher: ['/seller/:path*'] };
