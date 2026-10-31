'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@huspee/web-ui/i18n';
import { mobileChrome } from './chrome';
import { messages } from './messages';

export function BuyerFooter() {
  const t = useT(messages);
  const { tabs } = mobileChrome(usePathname());
  return (
    <footer className="border-t-4 border-primary bg-white">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-5 text-[13px] text-muted md:px-6">
        <p>{t('footer')}</p>
        <Link href="/credits" className="hover:text-primary">
          {t('credits')}
        </Link>
      </div>
      {/* Keeps the end of the page clear of the fixed mobile tab bar. */}
      {tabs && <div aria-hidden="true" className="h-[calc(60px+env(safe-area-inset-bottom))] md:hidden" />}
    </footer>
  );
}
