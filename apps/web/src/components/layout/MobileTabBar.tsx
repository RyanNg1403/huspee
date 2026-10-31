'use client';
import Link from 'next/link';
import { useState, type ComponentType, type SVGProps } from 'react';
import { usePathname } from 'next/navigation';
import { CartIcon, UserIcon } from '@huspee/web-ui/components/icons';
import { useT } from '@huspee/web-ui/i18n';
import { AccountSheet } from './AccountMenu';
import { HomeIcon, MessageIcon } from './icons';
import { messages } from './messages';

const tab = 'relative flex flex-col items-center justify-center gap-0.5 text-[11px]';

function TabBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute top-1.5 left-[calc(50%+6px)] h-4 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-white">
      {count}
    </span>
  );
}

function TabLink({
  href,
  label,
  current,
  count = 0,
  icon: Icon,
}: {
  href: string;
  label: string;
  current: boolean;
  count?: number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`${tab} ${current ? 'text-primary' : 'text-muted'}`}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={current ? 1.8 : 1.7} />
      {label}
      <TabBadge count={count} />
    </Link>
  );
}

/** Bottom navigation on the mobile tab roots (home, messages, account). */
export function MobileTabBar({ cart, unread }: { cart: number; unread: number }) {
  const t = useT(messages);
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const onAccount = pathname.startsWith('/account');
  return (
    <>
      <nav
        aria-label={t('mainNav')}
        className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(60px+env(safe-area-inset-bottom))] grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <TabLink href="/" label={t('home')} current={pathname === '/'} icon={HomeIcon} />
        <TabLink
          href="/messages"
          label={t('messages')}
          current={pathname === '/messages'}
          count={unread}
          icon={MessageIcon}
        />
        <TabLink href="/cart" label={t('cart')} current={false} count={cart} icon={CartIcon} />
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={accountOpen}
          aria-current={onAccount ? 'page' : undefined}
          onClick={() => setAccountOpen(true)}
          className={`${tab} ${onAccount ? 'text-primary' : 'text-muted'}`}
        >
          <UserIcon className="h-[22px] w-[22px]" strokeWidth={onAccount ? 1.8 : 1.7} />
          {t('me')}
        </button>
      </nav>
      {accountOpen && <AccountSheet unread={unread} onClose={() => setAccountOpen(false)} />}
    </>
  );
}
