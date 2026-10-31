'use client';

import Link from 'next/link';
import { ConnectionCard } from './ConnectionCard';
import { Logo } from '@huspee/web-ui/components/brand/Logo';
import { LanguageSwitch } from '@huspee/web-ui/components/layout/LanguageSwitch';
import { useT } from '@huspee/web-ui/i18n';
import { setupMessages } from './messages';

export default function CodexSetupPage() {
  const t = useT(setupMessages);
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Logo className="text-xl text-ink" />
          <LanguageSwitch />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="text-sm text-gray-600">{t('description')}</p>
        </div>
        <ConnectionCard />
        <Link href="/" className="inline-flex text-sm font-semibold text-primary hover:underline">
          {t('marketplace')}
        </Link>
      </main>
    </div>
  );
}
