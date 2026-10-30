'use client';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/common';

export function Spinner() {
  const t = useT(common);
  return (
    <span
      role="status"
      aria-label={t('loading')}
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
