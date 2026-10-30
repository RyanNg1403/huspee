'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Logo } from '@/components/brand/Logo';
import { CartIcon, ChevronIcon, SearchIcon, UserIcon } from '@/components/icons';
import { useSession } from '@/components/session';
import { useLang, useT } from '@/i18n';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { LanguageSwitch } from './LanguageSwitch';

function MessageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function BuyerHeader() {
  const t = useT(common);
  const { lang } = useLang();
  const messagesLabel = lang === 'vi' ? 'Tin nhắn' : 'Messages';
  const { user, status, logout } = useSession();
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (status !== 'authenticated' || !user?.roles.includes('buyer')) return;
    let active = true;
    const loadUnread = () => {
      getApiClient()
        .buyer.messages.unreadCount()
        .then((res) => {
          if (active) setUnreadMessages(res.count);
        })
        .catch(() => {
          if (active) setUnreadMessages(0);
        });
    };
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    window.addEventListener('focus', loadUnread);
    window.addEventListener('huspee:messages-changed', loadUnread);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', loadUnread);
      window.removeEventListener('huspee:messages-changed', loadUnread);
    };
  }, [status, user]);
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
            <Link className="block p-2" href="/messages">
              <span className="flex items-center justify-between">
                <span>{messagesLabel}</span>
                {unreadMessages > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-medium text-white">
                    {unreadMessages}
                  </span>
                )}
              </span>
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
          <Link href="/messages" aria-label={messagesLabel} className="relative shrink-0">
            <MessageIcon className="h-7 w-7" />
            {status === 'authenticated' && user?.roles.includes('buyer') && unreadMessages > 0 && (
              <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-white px-1 text-center text-xs font-medium text-orange-700">
                {unreadMessages}
              </span>
            )}
          </Link>
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
