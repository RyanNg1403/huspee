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
    'fixed inset-y-16 left-0 z-30 w-64 bg-white p-4 shadow md:static md:block md:min-h-screen md:shadow-none';
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
      <div className="min-h-screen">
        <header className="flex items-center gap-4 bg-white p-4 shadow-sm">
          <button onClick={() => setOpen(!open)} className="md:hidden" aria-label="Menu" aria-expanded={open}>
            ☰
          </button>
          <Logo className="text-primary text-xl" />
          <span className="hidden font-semibold sm:inline">{t('seller')}</span>
          <div className="ml-auto">
            <LanguageSwitch />
          </div>
        </header>
        <div className="mx-auto flex max-w-7xl">
          <aside className={`${open ? 'block' : 'hidden'} ${asideClass}`}>
            <Select
              aria-label={t('selectShop')}
              value={selectedShopId ?? ''}
              onChange={(e) => setSelectedShopId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{loading ? t('loading') : t('noShops')}</option>
              {shops.map((s) => (
                <option key={s.shop_id} value={s.shop_id}>
                  {s.shop_name}
                </option>
              ))}
            </Select>
            {error && (
              <button className="text-red-600" onClick={() => setVersion((v) => v + 1)}>
                {t('retry')}
              </button>
            )}
            <nav className="mt-5 flex flex-col gap-1">
              {navItems.map((item) => {
                const active =
                  pathname === item.href || (item.href !== '/seller' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between rounded px-3 py-2 text-sm transition-colors hover:bg-orange-50 hover:text-primary ${
                      active ? 'bg-orange-50 font-medium text-primary' : 'text-gray-700'
                    }`}
                    href={item.href}
                  >
                    <span>{item.label}</span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <Button variant="ghost" className="mt-4 md:hidden" onClick={() => setOpen(false)}>
              {t('close')}
            </Button>
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </Context.Provider>
  );
}
