'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useT } from '@huspee/web-ui/i18n/client';
import { useSelectedShop } from '@/components/layout/SelectedShop';
import { ShellIcon } from './icons';
import { shellMessages } from './messages';
import { activeNavKey, sellerNav, type NavCount } from './nav';
import { useShopStats } from './ShopStats';

export function SellerSidebar({
  storefrontUrl,
  onNavigate,
}: {
  storefrontUrl: string;
  onNavigate?: () => void;
}) {
  const t = useT(shellMessages);
  const pathname = usePathname();
  const active = activeNavKey(pathname, useSearchParams().get('status'));
  const { selectedShopId } = useSelectedShop();
  const { summary, openTickets } = useShopStats();
  const counts: Record<NavCount, number> = {
    toShip: summary?.order_count_by_status.READY_TO_SHIP ?? 0,
    inbox: openTickets ?? 0,
  };
  return (
    <nav aria-label={t('menu')} className="pt-3 pb-6">
      <Link
        href="/"
        onClick={onNavigate}
        aria-current={active === 'overview' ? 'page' : undefined}
        className={`flex h-10 items-center gap-3 px-4 ${
          active === 'overview' ? 'font-semibold text-primary' : 'text-ink hover:text-primary'
        }`}
      >
        <ShellIcon
          name="home"
          className={`h-[18px] w-[18px] ${active === 'overview' ? '' : 'text-[#8c8c8c]'}`}
        />
        {t('overview')}
      </Link>
      {sellerNav(selectedShopId, storefrontUrl).map((group) => (
        <div key={group.key} className="mt-1">
          <p id={`nav-${group.key}`} className="flex h-10 items-center gap-3 px-4 font-semibold text-ink">
            <ShellIcon name={group.icon} className="h-[18px] w-[18px] text-[#8c8c8c]" />
            {t(group.key)}
          </p>
          <ul aria-labelledby={`nav-${group.key}`}>
            {group.items.map((item) => {
              const current = active === item.key;
              const count = item.count ? counts[item.count] : 0;
              const className = `flex h-8 items-center justify-between gap-2 pr-4 pl-[46px] ${
                current ? 'font-semibold text-primary' : 'text-muted hover:text-ink'
              }`;
              return (
                <li key={item.key}>
                  {item.external ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
                      <span>
                        {t(item.key)}
                        <span className="sr-only"> ({t('newTab')})</span>
                      </span>
                    </a>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={current ? 'page' : undefined}
                      className={className}
                    >
                      <span>{t(item.key)}</span>
                      {count > 0 && <span className="font-normal text-primary">{count}</span>}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
