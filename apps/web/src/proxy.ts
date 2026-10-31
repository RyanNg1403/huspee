import { NextResponse, type NextRequest } from 'next/server';

/** Runtime env: standalone deployments can point at a different Seller Centre without rebuilding. */
export function proxy(request: NextRequest) {
  const target = new URL(process.env.SELLER_APP_URL || 'http://localhost:3002');
  target.pathname = request.nextUrl.pathname.replace(/^\/seller(?=\/|$)/, '') || '/';
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
}
export const config = { matcher: ['/seller/:path*'] };
