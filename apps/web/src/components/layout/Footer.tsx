'use client';
import Link from 'next/link';
import { useLang, useT } from '@/i18n/client';
import { common } from '@/i18n/common';
export function Footer() {
  const t = useT(common);
  const { lang } = useLang();
  return (
    <footer className="mt-auto border-t border-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold text-ink">Huspee</span> · {t('disclaimer')}
        </p>
        <Link href="/credits" className="hover:text-ink">
          {lang === 'vi' ? 'Nguồn ảnh sản phẩm' : 'Product photo credits'}
        </Link>
      </div>
    </footer>
  );
}
