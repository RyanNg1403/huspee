'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { Logo } from '@/components/brand/Logo';
import { Button, Select } from '@/components/ui';
import { useLang, useT } from '@/i18n/client';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { Context } from './SelectedShop';
import { LanguageSwitch } from './LanguageSwitch';
const NAV_ICONS: Record<string, string> = {
  '/seller': 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z',
  '/seller/products': 'M20 7 12 3 4 7m16 0v10l-8 4m8-14-8 4m0 10L4 17V7m8 14V11M4 7l8 4',
  '/seller/orders':
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 7h6m-6 4h4',
  '/seller/returns': 'M9 14 4 9m0 0 5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  '/seller/vouchers':
    'M15 5v2m0 4v2m0 4v2M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2Z',
  '/seller/assistant': 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3',
  '/seller/inbox': 'M4 13h4l1.5 3h5L16 13h4M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-8Z',
  '/seller/shops': 'M3 9 4.5 4h15L21 9M3 9v1a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M3 9h18M5 13v7h14v-7',
};

export function SellerShell({ children }: { children: ReactNode }) {
  const t = useT(common);
  const { lang } = useLang();
  const pathname = usePathname();
  useEffect(() => {
    const section = pathname.split('/')[2];
    const key =
      section === 'products'
        ? 'products'
        : section === 'shops'
          ? 'shops'
          : section === 'orders'
            ? 'orders'
            : section === 'returns'
              ? 'returns'
              : section === 'vouchers'
                ? 'vouchers'
                : 'seller';
    const title =
      section === 'assistant'
        ? lang === 'vi'
          ? 'Trợ lý ảo'
          : 'Assistant'
        : section === 'inbox'
          ? lang === 'vi'
            ? 'Hộp thư'
            : 'Inbox'
          : t(key);
    document.title = `${title} | Huspee`;
  }, [pathname, t, lang]);
  const [shops, setShops] = useState<SellerShop[]>([]);
  const [selectedShopId, setId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);

  useEffect(() => {
    if (!selectedShopId) return;
    let active = true;
    const fetchUnread = () => {
      getApiClient()
        .seller.inbox.list(selectedShopId, { status: 'OPEN', page_size: 50 })
        .then((res) => {
          if (!active) return;
          const count = (res.data ?? []).reduce(
            (sum: number, item: { seller_unread?: number }) => sum + (item.seller_unread || 0),
            0,
          );
          setInboxUnread(count);
        })
        .catch(() => {
          if (active) setInboxUnread(0);
        });
    };
    fetchUnread();
    window.addEventListener('huspee:inbox-changed', fetchUnread);
    return () => {
      active = false;
      window.removeEventListener('huspee:inbox-changed', fetchUnread);
    };
  }, [selectedShopId]);

  const effectiveInboxUnread = selectedShopId ? inboxUnread : 0;
  useEffect(() => {
    let active = true;
    getApiClient()
      .seller.shops.list()
      .then((list) => {
        if (!active) return;
        setShops(list);
        // Restore only a shop still available to this seller.
        const saved = Number(localStorage.getItem('huspee_seller_shop'));
        const id = list.some((s) => s.shop_id === saved) ? saved : (list[0]?.shop_id ?? null);
        setId(id);
        if (id !== null) localStorage.setItem('huspee_seller_shop', String(id));
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);
  function setSelectedShopId(id: number | null) {
    setId(id);
    if (id === null) localStorage.removeItem('huspee_seller_shop');
    else localStorage.setItem('huspee_seller_shop', String(id));
  }
  const asideClass =
    'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-white shadow-panel md:sticky md:top-0 md:flex md:h-screen md:shadow-none';
  const navItems = [
    { href: '/seller', label: t('home') },
    { href: '/seller/products', label: t('products') },
    { href: '/seller/orders', label: t('orders') },
    { href: '/seller/returns', label: t('returns') },
    { href: '/seller/vouchers', label: t('vouchers') },
    {
      href: '/seller/assistant',
      label: lang === 'vi' ? 'Trợ lý ảo' : 'Assistant',
    },
    {
      href: '/seller/inbox',
      label: lang === 'vi' ? 'Hộp thư' : 'Inbox',
      badge: effectiveInboxUnread,
    },
    { href: '/seller/shops', label: t('shops') },
  ];
  return (
    <Context.Provider
      value={{
        shops,
        selectedShopId,
        setSelectedShopId,
        loading,
        error,
        refresh: () => {
          setLoading(true);
          setVersion((v) => v + 1);
        },
      }}
    >
      <div className="min-h-screen md:flex">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur-md md:hidden">
          <button
            onClick={() => setOpen(!open)}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100"
            aria-label="Menu"
            aria-expanded={open}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Logo className="text-lg text-ink" />
          <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {t('seller')}
          </span>
        </header>
        {open && (
          <div className="fixed inset-0 z-30 bg-gray-900/30 md:hidden" onClick={() => setOpen(false)} />
        )}
        <aside className={`${open ? 'flex' : 'hidden'} ${asideClass}`}>
          <div className="flex items-center gap-2 px-5 pt-5 pb-4">
            <Logo className="text-lg text-ink" />
            <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {t('seller')}
            </span>
          </div>
          <div className="px-3">
            <Select
              aria-label={t('selectShop')}
              value={selectedShopId ?? ''}
              onChange={(e) => setSelectedShopId(e.target.value ? Number(e.target.value) : null)}
              className="font-medium"
            >
              <option value="">{loading ? t('loading') : t('noShops')}</option>
              {shops.map((s) => (
                <option key={s.shop_id} value={s.shop_id}>
                  {s.shop_name}
                </option>
              ))}
            </Select>
            {error && (
              <button className="mt-2 text-sm text-red-600" onClick={() => setVersion((v) => v + 1)}>
                {t('retry')}
              </button>
            )}
          </div>
          <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
            {navItems.map((item) => {
              const active =
                pathname === item.href || (item.href !== '/seller' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  onClick={() => setOpen(false)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? 'bg-primary-soft font-semibold text-primary'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-ink'
                  }`}
                  href={item.href}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-primary' : 'text-gray-400 group-hover:text-gray-600'}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={NAV_ICONS[item.href]} />
                  </svg>
                  <span className="flex-1">{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="space-y-3 border-t border-line px-5 py-4 text-sm">
            <Link href="/" className="block font-medium text-gray-600 hover:text-primary">
              {lang === 'vi' ? 'Xem trang mua sắm' : 'View storefront'} →
            </Link>
            <LanguageSwitch />
          </div>
          <Button variant="ghost" className="mx-3 mb-3 md:hidden" onClick={() => setOpen(false)}>
            {t('close')}
          </Button>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </Context.Provider>
  );
}
