import { getT } from '@huspee/web-ui/i18n/server';
import { common } from '@huspee/web-ui/i18n/common';
import { Logo } from '@huspee/web-ui/components/brand/Logo';
import { LanguageSwitch } from '@huspee/web-ui/components/layout/LanguageSwitch';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT(common);
  return (
    <>
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Logo />
          <span>{t('seller')}</span>
        </div>
        <LanguageSwitch />
      </header>
      <main className="px-4 pb-8">{children}</main>
    </>
  );
}
