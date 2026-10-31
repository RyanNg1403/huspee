'use client';

import Link from 'next/link';
import { Badge, Card, EmptyState } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { assistantMessages } from '../../messages';

interface TopProduct {
  item_id: number;
  name: string;
  count: number;
}

export function TopProductsCard({ products }: { products: TopProduct[] }) {
  const t = useT(assistantMessages);

  return (
    <Card className="flex flex-col h-full p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">{t('topProductsTitle')}</h2>
            <Badge tone="neutral">{t('verifiedLogsBadge')}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{t('topProductsDesc')}</p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="py-8">
          <EmptyState title={t('noTopProducts')} />
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-y-auto max-h-[360px]">
          {products.map((p, idx) => (
            <li
              key={p.item_id}
              className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50/50 px-2 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    idx === 0
                      ? 'bg-amber-100 text-amber-800'
                      : idx === 1
                        ? 'bg-gray-200 text-gray-700'
                        : idx === 2
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {idx + 1}
                </span>

                <div className="min-w-0">
                  <Link
                    href={`/products/${p.item_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-gray-900 hover:text-primary hover:underline line-clamp-1"
                  >
                    {p.name}
                  </Link>
                  <span className="text-[11px] text-gray-400">ID: #{p.item_id}</span>
                </div>
              </div>

              <div className="shrink-0">
                <Badge tone="info">{t('inquiriesCount', { count: p.count })}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
