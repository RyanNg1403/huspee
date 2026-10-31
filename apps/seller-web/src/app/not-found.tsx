import Link from 'next/link';
import { common } from '@huspee/web-ui/i18n/common';
import { getT } from '@huspee/web-ui/i18n/server';

export default async function NotFound() {
  const t = await getT(common);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-12 text-center">
      <p className="text-primary text-5xl font-semibold">404</p>
      <h1 className="text-lg text-gray-700">{t('not_found')}</h1>
      <Link href="/" className="bg-primary rounded-sm px-6 py-2 text-white hover:opacity-90">
        {t('home')}
      </Link>
    </main>
  );
}
