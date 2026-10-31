/**
 * Mobile chrome per buyer route (desktop always shows the full header).
 * - header: the orange search bar; the search page draws its own bar with filters.
 * - tabs: the bottom tab bar, only on the tab roots (home, messages, account).
 */
export function mobileChrome(pathname: string) {
  const tabs = pathname === '/' || pathname === '/messages' || pathname.startsWith('/account');
  return { header: pathname !== '/search', tabs, back: !tabs };
}
