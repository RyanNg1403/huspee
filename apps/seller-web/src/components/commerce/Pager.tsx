'use client';

import { useT } from '@huspee/web-ui/i18n/client';
import { commerceMessages } from './messages';

const arrow =
  'flex h-8 w-8 items-center justify-center rounded-[4px] border border-line-strong bg-white text-muted hover:bg-gray-50 disabled:opacity-40';

/** "1–20 / 45" with previous/next buttons for client-side pages. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useT(commerceMessages);
  if (!total) return null;
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-end gap-2 pt-4 text-sm text-muted">
      <span>{t('range', { start, end, total })}</span>
      <button
        type="button"
        className={arrow}
        aria-label={t('prevPage')}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m15 6-6 6 6 6" />
        </svg>
      </button>
      <button
        type="button"
        className={arrow}
        aria-label={t('nextPage')}
        disabled={end >= total}
        onClick={() => onPage(page + 1)}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
