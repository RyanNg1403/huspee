'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Logo } from '@huspee/web-ui/components/brand/Logo';
import { CartIcon, ChevronIcon, SearchIcon, UserIcon } from '@huspee/web-ui/components/icons';
import { useSession } from '@huspee/web-ui/components/session';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { LanguageSwitch } from '@huspee/web-ui/components/layout/LanguageSwitch';

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

export function BuyerHeader({ sellerUrl }: { sellerUrl: string }) {
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
  const isBuyer = status === 'authenticated' && !!user?.roles.includes('buyer');
  const iconLink =
    'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 hover:text-ink';
  const dot =
    'absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-none font-semibold text-white ring-2 ring-white';
  const menuItem = 'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-gray-50';
  const menu = (mobile: boolean) => (
    <details className="relative">
      <summary
        aria-label={status === 'authenticated' ? user?.name : t('login')}
        className="flex cursor-pointer list-none items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm font-medium text-gray-700 transition hover:bg-gray-100 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
          {mobile || !user?.name ? (
            <UserIcon className="h-4 w-4" />
          ) : (
            user.name.trim().split(/\s+/).pop()?.[0]
          )}
        </span>
        {!mobile && (
          <>
            <span className="max-w-32 truncate">{user?.name}</span>
            <ChevronIcon className="h-4 w-4 text-gray-400" />
          </>
        )}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-line bg-white p-1.5 text-sm text-gray-800 shadow-lift">
        {status === 'authenticated' ? (
          <>
            <Link className={menuItem} href="/orders">
              {t('orders')}
            </Link>
            <Link className={menuItem} href="/messages">
              <span>{messagesLabel}</span>
              {unreadMessages > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-white">
                  {unreadMessages}
                </span>
              )}
            </Link>
            {user?.roles.includes('seller') && (
              <a className={menuItem} href={sellerUrl}>
                {t('seller')}
              </a>
            )}
            <div className="my-1 border-t border-line" />
            <button
              className={`${menuItem} text-gray-500`}
              onClick={() => void logout().then(() => router.push('/'))}
            >
              {t('logout')}
            </button>
          </>
        ) : (
          <>
            <Link className={menuItem} href="/login">
              {t('login')}
            </Link>
            <Link className={menuItem} href="/signup">
              {t('signup')}
            </Link>
          </>
        )}
        {mobile && (
          <div className="border-t border-line px-3 py-2">
            <LanguageSwitch />
          </div>
        )}
      </div>
    </details>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:gap-x-6">
        <Logo className="text-xl text-ink" />
        <div className="flex-1 sm:hidden" />
        <form
          onSubmit={search}
          className="relative order-3 w-full min-w-0 sm:order-none sm:max-w-2xl sm:flex-1"
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            name="q"
            aria-label={t('search')}
            placeholder={t('search')}
            className="h-11 w-full rounded-full border border-transparent bg-gray-100 pr-24 pl-11 text-sm text-ink transition placeholder:text-gray-500 focus:border-primary/40 focus:bg-white focus:ring-4 focus:ring-primary/10 focus:outline-none"
          />
          <button
            className="absolute top-1/2 right-1.5 h-8 -translate-y-1/2 rounded-full bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover"
            aria-label={t('search')}
          >
            <span aria-hidden="true">{t('search').split(' ')[0]}</span>
          </button>
        </form>
        <nav className="flex items-center gap-1 sm:ml-auto">
          <a href={sellerUrl} className="hidden text-sm text-gray-600 lg:block">{t('seller')}</a>
          <div className="hidden text-sm sm:block">
            <LanguageSwitch />
          </div>
          <Link href="/messages" aria-label={messagesLabel} className={iconLink}>
            <MessageIcon className="h-[22px] w-[22px]" />
            {isBuyer && unreadMessages > 0 && <span className={dot}>{unreadMessages}</span>}
          </Link>
          <Link href="/cart" aria-label={t('cart')} className={iconLink}>
            <CartIcon className="h-[22px] w-[22px]" />
            <span className={isBuyer && count > 0 ? dot : 'sr-only'}>{isBuyer ? count : 0}</span>
          </Link>
          {status === 'authenticated' ? (
            <>
              <div className="hidden sm:block">{menu(false)}</div>
              <div className="sm:hidden">{menu(true)}</div>
            </>
          ) : (
            <div className="ml-1 flex items-center gap-1 text-sm font-semibold">
              <Link href="/login" className="rounded-full px-3 py-2 text-gray-700 hover:bg-gray-100">
                {t('login')}
              </Link>
              <Link
                href="/signup"
                className="hidden rounded-full bg-ink px-4 py-2 text-white hover:bg-gray-800 sm:block"
              >
                {t('signup')}
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
