'use client';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/common';
import { Button } from './Button';
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
  return (
    <nav aria-label={t('pagination')} className="flex items-center justify-center gap-3">
      <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹
      </Button>
      <span>
        {page} / {totalPages}
      </span>
      <Button variant="outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        ›
      </Button>
    </nav>
  );
}
