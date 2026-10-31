'use client';
import Link from 'next/link';
import { useT } from '@huspee/web-ui/i18n';
import { MessageIcon } from '@/components/layout/icons';
import { OrdersIcon, ReturnIcon } from './icons';
import { messages } from './messages';

/** Shortcuts to the buyer's own orders, returns and shop replies. */
export function Services() {
  const t = useT(messages);
  const items = [
    { href: '/orders', label: t('orders'), Icon: OrdersIcon },
    { href: '/returns', label: t('returns'), Icon: ReturnIcon },
    { href: '/messages', label: t('shopMessages'), Icon: MessageIcon },
  ];
  return (
    <nav
      aria-label={t('services')}
      className="flex justify-around bg-white px-1 pt-3 pb-2.5 md:rounded-sm md:py-3.5 md:shadow-card"
    >
      {items.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex w-24 flex-col items-center gap-1.5 text-center text-[11px] leading-tight text-ink hover:text-primary md:w-40 md:gap-2 md:text-[13px]"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon className="h-[22px] w-[22px]" />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
