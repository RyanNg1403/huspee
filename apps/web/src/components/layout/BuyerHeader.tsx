'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Logo } from '@/components/brand/Logo';
import { CartIcon, ChevronIcon, SearchIcon, UserIcon } from '@/components/icons';
import { useSession } from '@/components/session';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { LanguageSwitch } from './LanguageSwitch';

export function BuyerHeader() {
  const t = useT(common);
  const { user, status, logout } = useSession();
  const router = useRouter();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (status !== 'authenticated' || !user?.roles.includes('buyer')) return;
    let active = true;
    const load = () => {
      getApiClient()
        .cart.get()
        .then((cart) => {
          if (active) setCount(cart.item_count);
        })
        .catch(() => {
          if (active) setCount(0);
        });
    };
    load();
    window.addEventListener('focus', load);
    window.addEventListener('huspee:cart-changed', load);
    return () => {
      active = false;
      window.removeEventListener('focus', load);
      window.removeEventListener('huspee:cart-changed', load);
    };
  }, [status, user]);
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q');
    router.push(`/search?q=${encodeURIComponent(String(q ?? ''))}`);
  }
  const menu = (mobile: boolean) => (
    <details className="relative">
      <summary
        aria-label={status === 'authenticated' ? user?.name : t('login')}
        className="flex cursor-pointer list-none items-center gap-1"
      >
        {mobile ? (
          <UserIcon className="h-6 w-6" />
        ) : (
          <>
            {user?.name}
            <ChevronIcon className="h-4 w-4" />
          </>
        )}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-48 rounded bg-white p-2 text-sm text-gray-800 shadow-lg">
        {status === 'authenticated' ? (
          <>
            <Link className="block p-2" href="/orders">
              {t('orders')}
            </Link>
            {user?.roles.includes('seller') && (
              <Link className="block p-2" href="/seller">
                {t('seller')}
              </Link>
            )}
            <button className="block p-2" onClick={() => void logout().then(() => router.push('/'))}>
              {t('logout')}
            </button>
          </>
        ) : (
          <>
            <Link className="block p-2" href="/login">
              {t('login')}
            </Link>
            <Link className="block p-2" href="/signup">
              {t('signup')}
            </Link>
          </>
        )}
        {mobile && <LanguageSwitch />}
      </div>
    </details>
  );
  return (
    <header className="bg-primary text-white">
      <div className="mx-auto max-w-7xl px-4 pb-3 pt-2">
        <div className="hidden items-center justify-end gap-4 text-sm sm:flex">
          <LanguageSwitch />
          {status === 'authenticated' ? (
            menu(false)
          ) : (
            <div className="flex gap-3">
              <Link href="/login">{t('login')}</Link>
              <Link href="/signup">{t('signup')}</Link>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2 sm:flex-nowrap sm:py-3">
          <Logo className="text-2xl" />
          <div className="flex-1 sm:hidden" />
          <form onSubmit={search} className="order-3 flex w-full min-w-0 sm:order-none sm:flex-1">
            <input
              name="q"
              aria-label={t('search')}
              placeholder={t('search')}
              className="min-w-0 flex-1 rounded-l bg-white px-3 py-2 text-gray-900"
            />
            <button className="rounded-r bg-orange-700 px-4" aria-label={t('search')}>
              <SearchIcon className="h-5 w-5" />
            </button>
          </form>
          <Link href="/cart" aria-label={t('cart')} className="relative shrink-0">
            <CartIcon className="h-7 w-7" />
            <span className="absolute -right-3 -top-2 min-w-5 rounded-full bg-white px-1 text-center text-xs font-medium text-orange-700">
              {status === 'authenticated' && user?.roles.includes('buyer') ? count : 0}
            </span>
          </Link>
          <div className="ml-2 sm:hidden">{menu(true)}</div>
        </div>
      </div>
    </header>
  );
}
