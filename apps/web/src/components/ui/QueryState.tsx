'use client';

import type { ReactNode } from 'react';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/common';
import { errorMessageKey } from '@/lib/api';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';

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
        <div className="flex h-64 items-center justify-center rounded bg-white shadow-sm">
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
