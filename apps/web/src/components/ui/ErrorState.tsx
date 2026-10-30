'use client';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/common';
import { Button } from './Button';
export function ErrorState({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const t = useT(common);
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-red-100 bg-red-50/60 p-6 text-center text-sm text-red-700"
    >
      <p>{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel ?? t('retry')}
        </Button>
      )}
    </div>
  );
}
