'use client';

import { Badge, Card, EmptyState } from '@/components/ui';
import { useT } from '@/i18n';
import { assistantMessages } from '../../messages';
import { TicketIcon } from './icons';

interface Campaign {
  code: string;
  count: number;
}

export function CampaignsCard({ campaigns }: { campaigns: Campaign[] }) {
  const t = useT(assistantMessages);

  return (
    <Card className="flex flex-col h-full p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">{t('campaignsTitle')}</h2>
            <Badge tone="neutral">{t('verifiedLogsBadge')}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{t('campaignsDesc')}</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="py-8">
          <EmptyState title={t('noCampaigns')} />
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-y-auto max-h-[360px]">
          {campaigns.map((c) => (
            <li
              key={c.code}
              className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50/50 px-2 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                  <TicketIcon className="h-4 w-4" />
                </span>
                <span className="font-mono text-xs font-semibold text-gray-800 truncate">{c.code}</span>
              </div>

              <div className="shrink-0">
                <Badge tone="warning">{t('voucherQueries', { count: c.count })}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
