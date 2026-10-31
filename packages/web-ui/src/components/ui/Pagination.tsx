'use client';
import { useT } from '@huspee/web-ui/i18n/client';
import { common } from '@huspee/web-ui/i18n/common';
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const t = useT(common);
  const button =
    'flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-gray-700 transition hover:border-gray-300 disabled:opacity-40';
  return (
    <nav aria-label={t('pagination')} className="flex items-center justify-center gap-3 text-sm">
      <button className={button} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹
      </button>
      <span className="min-w-12 text-center text-gray-600 tabular-nums">
        {page} / {totalPages}
      </span>
      <button className={button} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        ›
      </button>
    </nav>
  );
}
