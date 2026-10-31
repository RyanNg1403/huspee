'use client';
import { ErrorState } from '@huspee/web-ui/components/ui';
import { common } from '@huspee/web-ui/i18n/common';
import { useT } from '@huspee/web-ui/i18n/client';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT(common);
  return <ErrorState message={t('unknown')} onRetry={reset} retryLabel={t('retry')} />;
}
