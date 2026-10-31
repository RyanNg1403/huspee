'use client';
import { Skeleton } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { messages } from './messages';

/** Loading and error state for one row of secondary data; renders nothing once loaded. */
export function InlineState({
  loading,
  error,
  retry,
  className = 'h-4 w-40',
}: {
  loading: boolean;
  error: unknown;
  retry: () => void;
  className?: string;
}) {
  const t = useT(messages);
  const c = useT(common);
  if (loading) return <Skeleton className={`rounded ${className}`} />;
  if (!error) return null;
  return (
    <span role="alert" className="text-sm text-muted">
      {t('loadFailed')}{' '}
      <button type="button" onClick={retry} className="font-medium text-link hover:underline">
        {c('retry')}
      </button>
    </span>
  );
}
