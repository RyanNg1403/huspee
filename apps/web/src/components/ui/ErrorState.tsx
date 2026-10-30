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
    <div role="alert" className="p-5 text-center text-red-700">
      <p>{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel ?? t('retry')}
        </Button>
      )}
    </div>
  );
}
