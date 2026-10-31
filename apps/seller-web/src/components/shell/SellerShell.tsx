'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useT } from '@huspee/web-ui/i18n/client';
import { AccountMenu } from './AccountMenu';
import { Brand, HeaderBar } from './Brand';
import { ShellIcon } from './icons';
import { shellMessages } from './messages';
import { activeNavKey } from './nav';
import { SellerSidebar } from './SellerSidebar';
import { ShopSwitcher } from './ShopSwitcher';

/** Seller Centre frame: header with shop and account, grouped sidebar, page content. */
export function SellerShell({ storefrontUrl, children }: { storefrontUrl: string; children: ReactNode }) {
  const t = useT(shellMessages);
  const [open, setOpen] = useState(false);
  const active = activeNavKey(usePathname(), useSearchParams().get('status'));
  const title = t(active ?? 'channel');
  const channel = t('channel');

  useEffect(() => {
    document.title = `${title} | Huspee ${channel}`;
  }, [title, channel]);

  return (
    <div className="min-h-screen bg-page">
      <HeaderBar>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={t(open ? 'closeMenu' : 'openMenu')}
          aria-expanded={open}
          aria-controls="seller-sidebar"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded text-ink hover:bg-gray-100 md:hidden"
        >
          <ShellIcon name="menu" className="h-5 w-5" strokeWidth={2} />
        </button>
        <Brand channel={channel} />
        <div className="ml-auto flex min-w-0 items-center gap-5">
          <ShopSwitcher />
          <AccountMenu />
        </div>
      </HeaderBar>
      <div className="flex min-h-[calc(100vh-56px)]">
        {open && (
          <div
            aria-hidden="true"
            className="fixed inset-0 top-14 z-20 bg-gray-900/30 md:hidden"
            onClick={() => setOpen(false)}
          />
        )}
        <aside
          id="seller-sidebar"
          className={`${open ? 'block' : 'hidden'} fixed top-14 bottom-0 left-0 z-20 w-[216px] overflow-y-auto bg-white md:static md:block md:shrink-0 md:overflow-visible`}
        >
          <div className="md:sticky md:top-14 md:max-h-[calc(100vh-56px)] md:overflow-y-auto">
            <SellerSidebar storefrontUrl={storefrontUrl} onNavigate={() => setOpen(false)} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 pt-5 pb-10 md:px-6">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
