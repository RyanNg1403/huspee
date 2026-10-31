'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useLang } from '@/i18n';
import credits from './credits.json';

/** Provenance for the generated demo catalog assets. */
export default function CreditsPage() {
  const { lang } = useLang();
  const title = lang === 'vi' ? 'Nguồn ảnh' : 'Image credits';
  useEffect(() => {
    document.title = `${title} | Huspee`;
  }, [title]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-gray-500">
        {lang === 'vi'
          ? 'Ảnh sản phẩm và ảnh đại diện cửa hàng được tạo bằng Image Gen cho bản mô phỏng Huspee. Hình ảnh mang tính minh họa, không phải ảnh chính thức của nhà sản xuất.'
          : 'Product images and shop avatars were created with Image Gen for the Huspee demo. Images are illustrative, not official manufacturer photography.'}
      </p>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
        {credits.map((credit) => (
          <li
            key={credit.href}
            className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:items-baseline sm:gap-3"
          >
            <Link href={credit.href} className="font-medium text-ink hover:text-primary">
              {credit.title}
            </Link>
            <span className="text-gray-500 sm:ml-auto sm:text-right">
              Image Gen · {credit.images} {lang === 'vi' ? 'ảnh' : credit.images === 1 ? 'image' : 'images'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
