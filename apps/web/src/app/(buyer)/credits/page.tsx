'use client';
import { useEffect } from 'react';
import { useLang } from '@/i18n';
import credits from './credits.json';

/** Attribution for the openly licensed seed product photos (copy of apps/api/prisma/seed-images/credits.json). */
export default function CreditsPage() {
  const { lang } = useLang();
  const title = lang === 'vi' ? 'Nguồn ảnh sản phẩm' : 'Product photo credits';
  useEffect(() => {
    document.title = `${title} | Huspee`;
  }, [title]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-gray-500">
        {lang === 'vi'
          ? 'Ảnh sản phẩm mẫu lấy từ Wikimedia Commons theo giấy phép mở; ảnh đã được thu nhỏ. Sản phẩm và cửa hàng là mô phỏng.'
          : 'Sample product photos come from Wikimedia Commons under open licenses and were resized. Products and shops are simulated.'}
      </p>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
        {credits.map((credit) => (
          <li
            key={credit.file}
            className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:items-baseline sm:gap-3"
          >
            <a
              href={credit.source}
              className="font-medium text-ink hover:text-primary"
              rel="noreferrer"
              target="_blank"
            >
              {credit.title}
            </a>
            <span className="text-gray-500 sm:ml-auto sm:text-right">
              {credit.author || '—'} · {credit.license}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
