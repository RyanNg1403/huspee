'use client';
import { ErrorState } from '@/components/ui';
import { common } from '@/i18n/common';
import { useT } from '@/i18n/client';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT(common);
  return <ErrorState message={t('unknown')} onRetry={reset} retryLabel={t('retry')} />;
}
