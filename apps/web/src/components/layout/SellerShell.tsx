'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { Logo } from '@/components/brand/Logo';
import { Button, Select } from '@/components/ui';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { Context } from './SelectedShop';
import { LanguageSwitch } from './LanguageSwitch';
export function SellerShell({ children }: { children: ReactNode }) {
  const t = useT(common);
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
    document.title = `${t(key)} | Huspee`;
  }, [pathname, t]);
  const [shops, setShops] = useState<SellerShop[]>([]);
  const [selectedShopId, setId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
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
  const nav = [
    ['/seller', 'home'],
    ['/seller/products', 'products'],
    ['/seller/orders', 'orders'],
    ['/seller/returns', 'returns'],
    ['/seller/vouchers', 'vouchers'],
    ['/seller/shops', 'shops'],
  ] as const;
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
            <nav className="mt-5 flex flex-col">
              {nav.map(([href, key]) => (
                <Link
                  key={href}
                  onClick={() => setOpen(false)}
                  className="rounded px-3 py-2 hover:bg-orange-50 hover:text-primary"
                  href={href}
                >
                  {t(key)}
                </Link>
              ))}
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
