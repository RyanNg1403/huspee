'use client';
import Link from 'next/link';
import { useState, type ComponentType, type SVGProps } from 'react';
import { flushSync } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { CartIcon, SearchIcon } from '@huspee/web-ui/components/icons';
import { LanguageSwitch } from '@huspee/web-ui/components/layout/LanguageSwitch';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { categoryLabel, shortcutCategories, useCategories } from '@/components/catalog';
import { AccountMenu } from './AccountMenu';
import { mobileChrome } from './chrome';
import { BackIcon, BagLogoIcon, MessageIcon } from './icons';
import { messages } from './messages';
import { MobileSearchSheet } from './MobileSearchSheet';
import { MobileTabBar } from './MobileTabBar';
import { SearchBox } from './SearchBox';
import { useHeaderCounts } from './use-header-counts';

function IconLink({
  href,
  label,
  count,
  icon: Icon,
  large = false,
}: {
  href: string;
  label: string;
  count: number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  large?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`relative flex shrink-0 items-center justify-center text-white ${large ? 'h-11 w-11' : 'h-10 w-10'}`}
    >
      <Icon className={large ? 'h-7 w-7' : 'h-6 w-6'} strokeWidth={1.7} />
      {count > 0 && (
        <span
          className={`absolute top-0.5 right-0 rounded-full bg-white px-1 text-center font-bold text-primary ${large ? 'h-[18px] min-w-[18px] text-[11px] leading-[18px]' : 'h-4 min-w-4 text-[10px] leading-4'}`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/** Subcategory shortcuts under the desktop search box. */
function CategoryShortcuts() {
  const t = useT(messages);
  const { lang } = useLang();
  const categories = useCategories();
  return (
    <nav
      aria-label={t('shortcuts')}
      className="mt-1.5 flex h-[18px] flex-wrap gap-x-3.5 overflow-hidden text-xs"
    >
      {shortcutCategories(categories.data ?? [], 6).map((category) => (
        <Link
          key={category.category_id}
          href={`/search?category_id=${category.category_id}`}
          className="hover:opacity-85"
        >
          {categoryLabel(category, lang)}
        </Link>
      ))}
    </nav>
  );
}

function DesktopHeader({ sellerUrl, cart, unread }: { sellerUrl: string; cart: number; unread: number }) {
  const t = useT(messages);
  return (
    <div className="hidden md:block">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-6 pt-1.5 text-[13px]">
        <nav aria-label={t('quickLinks')} className="flex gap-4">
          <a href={sellerUrl} className="hover:opacity-85">
            {t('sellerCentre')}
          </a>
        </nav>
        <div className="flex items-center gap-4">
          <div className="rounded-sm has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-white [&_label]:text-white [&_select]:py-0 [&_select]:text-white [&_select:hover]:text-white">
            <LanguageSwitch />
          </div>
          <AccountMenu unread={unread} />
        </div>
      </div>
      <div className="mx-auto flex max-w-[1200px] items-center gap-8 px-6 pt-3.5 pb-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 text-[28px] font-bold tracking-[-0.02em]"
        >
          <BagLogoIcon className="h-9 w-9" />
          Huspee
        </Link>
        <div className="min-w-0 flex-1">
          <SearchBox />
          <CategoryShortcuts />
        </div>
        <div className="flex shrink-0 gap-2">
          <IconLink
            href="/messages"
            label={unread ? t('messagesUnread', { count: unread }) : t('messages')}
            count={unread}
            icon={MessageIcon}
            large
          />
          <IconLink
            href="/cart"
            label={cart ? t('cartCount', { count: cart }) : t('cart')}
            count={cart}
            icon={CartIcon}
            large
          />
        </div>
      </div>
    </div>
  );
}

function MobileHeader({
  back,
  cart,
  unread,
  onSearch,
}: {
  back: boolean;
  cart: number;
  unread: number;
  onSearch: () => void;
}) {
  const t = useT(messages);
  const router = useRouter();
  return (
    <div className="flex items-center gap-1 py-2.5 pr-2 pl-3 md:hidden">
      {back && (
        <button
          type="button"
          aria-label={t('back')}
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
          className="-ml-2 flex h-10 w-9 shrink-0 items-center justify-center"
        >
          <BackIcon className="h-[22px] w-[22px]" />
        </button>
      )}
      <button
        type="button"
        onClick={onSearch}
        className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-sm bg-white px-2.5 text-left text-sm text-subtle"
      >
        <SearchIcon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
        <span className="truncate">{t('searchPlaceholder')}</span>
      </button>
      <IconLink
        href="/cart"
        label={cart ? t('cartCount', { count: cart }) : t('cart')}
        count={cart}
        icon={CartIcon}
      />
      <IconLink
        href="/messages"
        label={unread ? t('messagesUnread', { count: unread }) : t('messages')}
        count={unread}
        icon={MessageIcon}
      />
    </div>
  );
}

/** Buyer header: the full orange header on desktop; a search bar (and tab bar on tab roots) on mobile. */
export function BuyerHeader({ sellerUrl }: { sellerUrl: string }) {
  const pathname = usePathname();
  const chrome = mobileChrome(pathname);
  const { cart, unread } = useHeaderCounts();
  const [searching, setSearching] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-40 bg-primary text-white">
        <DesktopHeader sellerUrl={sellerUrl} cart={cart} unread={unread} />
        {chrome.header && (
          <MobileHeader
            back={chrome.back}
            cart={cart}
            unread={unread}
            // Mount synchronously inside the tap so the autofocused input raises the phone keyboard.
            onSearch={() => flushSync(() => setSearching(true))}
          />
        )}
      </header>
      {searching && <MobileSearchSheet initial="" onClose={() => setSearching(false)} />}
      {chrome.tabs && <MobileTabBar cart={cart} unread={unread} />}
    </>
  );
}
