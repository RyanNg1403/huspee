'use client';

import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Spinner } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { useErrorText } from './errors';
import { commerceMessages } from './messages';

/** Loading, error and empty states inside a commerce panel. */
export function ListState({
  loading,
  error,
  empty,
  emptyTitle,
  onRetry,
  children,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyTitle: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  const t = useT(commerceMessages);
  const errorText = useErrorText();
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-primary">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-6">
        <ErrorState
          message={`${t('loadFailed')}. ${errorText(error)}`}
          onRetry={onRetry}
          retryLabel={t('retry')}
        />
      </div>
    );
  }
  if (empty) return <EmptyState title={emptyTitle} />;
  return <>{children}</>;
}
