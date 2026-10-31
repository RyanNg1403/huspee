import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const target = new URL(process.env.WEB_APP_URL || 'http://localhost:3001');
  target.pathname = request.nextUrl.pathname === '/storefront' ? '/' : request.nextUrl.pathname;
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
}
export const config = { matcher: ['/storefront', '/setup/codex'] };
