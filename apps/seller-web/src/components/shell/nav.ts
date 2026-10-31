/** Sidebar labels; each is a key of `shellMessages`. Kept free of imports so tests can load this file. */
export type NavKey =
  | 'overview'
  | 'orders'
  | 'ordersAll'
  | 'ordersToShip'
  | 'returns'
  | 'products'
  | 'productsAll'
  | 'productsNew'
  | 'marketing'
  | 'vouchers'
  | 'assistant'
  | 'inbox'
  | 'conversations'
  | 'insights'
  | 'faqs'
  | 'settings'
  | 'shop'
  | 'shopProfile'
  | 'connection'
  | 'viewShop';
export type NavIcon = 'home' | 'orders' | 'products' | 'marketing' | 'assistant' | 'shop';
export type NavCount = 'toShip' | 'inbox';
export type NavItem = { key: NavKey; href: string; count?: NavCount; external?: boolean };
export type NavGroup = { key: NavKey; icon: NavIcon; items: NavItem[] };

/** Order status the "To ship" entry filters on; the orders page reads it from `?status=`. */
export const TO_SHIP_STATUS = 'READY_TO_SHIP';

export function sellerNav(shopId: number | null, storefrontUrl: string): NavGroup[] {
  return [
    {
      key: 'orders',
      icon: 'orders',
      items: [
        { key: 'ordersAll', href: '/orders' },
        { key: 'ordersToShip', href: `/orders?status=${TO_SHIP_STATUS}`, count: 'toShip' },
        { key: 'returns', href: '/returns' },
      ],
    },
    {
      key: 'products',
      icon: 'products',
      items: [
        { key: 'productsAll', href: '/products' },
        { key: 'productsNew', href: '/products/new' },
      ],
    },
    { key: 'marketing', icon: 'marketing', items: [{ key: 'vouchers', href: '/vouchers' }] },
    {
      key: 'assistant',
      icon: 'assistant',
      items: [
        { key: 'inbox', href: '/inbox', count: 'inbox' },
        { key: 'conversations', href: '/assistant/conversations' },
        { key: 'insights', href: '/assistant/insights' },
        { key: 'faqs', href: '/assistant/faqs' },
        { key: 'settings', href: '/assistant' },
      ],
    },
    {
      key: 'shop',
      icon: 'shop',
      items: [
        { key: 'shopProfile', href: shopId ? `/shops/${shopId}` : '/shops' },
        { key: 'connection', href: '/shops' },
        ...(shopId
          ? [
              {
                key: 'viewShop' as const,
                href: `${storefrontUrl.replace(/\/$/, '')}/shops/${shopId}`,
                external: true,
              },
            ]
          : []),
      ],
    },
  ];
}

const PREFIXES: Array<[string, NavKey]> = [
  ['/orders', 'ordersAll'],
  ['/returns', 'returns'],
  ['/products', 'productsAll'],
  ['/vouchers', 'vouchers'],
  ['/inbox', 'inbox'],
  ['/assistant/conversations', 'conversations'],
  ['/assistant/insights', 'insights'],
  ['/assistant/faqs', 'faqs'],
];

/** The sidebar entry for a route; `status` is the `?status=` query value. */
export function activeNavKey(pathname: string, status: string | null): NavKey | null {
  if (pathname === '/') return 'overview';
  if (pathname === '/orders' && status === TO_SHIP_STATUS) return 'ordersToShip';
  if (pathname === '/products/new') return 'productsNew';
  if (pathname === '/assistant') return 'settings';
  if (pathname === '/shops') return 'connection';
  if (/^\/shops\/\d+$/.test(pathname)) return 'shopProfile';
  const match = PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? match[1] : null;
}
