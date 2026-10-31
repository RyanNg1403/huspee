'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@huspee/web-ui/i18n';
import { assistantMessages } from '../messages';

export function AssistantNav() {
  const t = useT(assistantMessages);
  const pathname = usePathname();

  const tabs = [
    {
      href: '/assistant',
      label: t('tabSettings'),
      active: pathname === '/assistant',
    },
    {
      href: '/assistant/faqs',
      label: t('tabFaqs'),
      active: pathname.startsWith('/assistant/faqs'),
    },
    {
      href: '/assistant/conversations',
      label: t('tabConversations'),
      active: pathname.startsWith('/assistant/conversations'),
    },
    {
      href: '/assistant/insights',
      label: t('tabInsights'),
      active: pathname.startsWith('/assistant/insights'),
    },
  ];

  return (
    <div className="flex border-b border-gray-200 bg-white">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            tab.active
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
