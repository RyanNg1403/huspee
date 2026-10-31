'use client';
import { useT } from '@huspee/web-ui/i18n/client';
import { common } from '@huspee/web-ui/i18n/common';

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
