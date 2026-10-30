'use client';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/common';
export function Footer() {
  const t = useT(common);
  return (
    <footer className="mt-auto border-t bg-white p-8 text-center text-sm text-gray-500">
      © Huspee · {t('disclaimer')}
    </footer>
  );
}
