'use client';

import type { ReactNode } from 'react';
import { useT } from '@huspee/web-ui/i18n/client';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey } from '@huspee/web-ui/lib/api';
import { Card } from '@huspee/web-ui/components/ui/Card';
import { EmptyState } from '@huspee/web-ui/components/ui/EmptyState';
import { ErrorState } from '@huspee/web-ui/components/ui/ErrorState';
import { Skeleton } from '@huspee/web-ui/components/ui/Skeleton';
import { Spinner } from '@huspee/web-ui/components/ui/Spinner';

export interface QueryStateProps {
  loading: boolean;
  error?: unknown;
  retry?: () => void;
  retryLabel?: string;
  errorMessage?: string;
  className?: string;
  spinner?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyChildren?: ReactNode;
  card?: boolean;
  children?: ReactNode;
}

export function QueryState({
  loading,
  error,
  retry,
  retryLabel,
  errorMessage,
  className = 'h-40 w-full',
  spinner = false,
  empty = false,
  emptyTitle,
  emptyChildren,
  card = false,
  children,
}: QueryStateProps) {
  const t = useT(common);

  if (loading) {
    if (spinner) {
      return (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-white text-primary">
          <Spinner />
        </div>
      );
    }
    return <Skeleton className={className} />;
  }

  if (error) {
    const message = errorMessage ?? (typeof error === 'string' ? error : t(errorMessageKey(error)));
    return <ErrorState message={message} retryLabel={retryLabel ?? t('retry')} onRetry={retry} />;
  }

  if (empty && emptyTitle) {
    const emptyEl = <EmptyState title={emptyTitle}>{emptyChildren}</EmptyState>;
    return card ? <Card>{emptyEl}</Card> : emptyEl;
  }

  return children ? <>{children}</> : null;
}

export const ApiState = QueryState;
