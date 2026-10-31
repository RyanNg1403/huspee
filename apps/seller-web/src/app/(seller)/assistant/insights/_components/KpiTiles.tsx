'use client';

import type { AssistantInsightsTotals } from '@huspee/sdk';
import { Card } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { assistantMessages } from '../../messages';
import { CartIcon, KeyboardIcon, MessageSquareIcon, MicIcon, RotateCcwIcon, UsersIcon } from './icons';

export function KpiTiles({ totals }: { totals: AssistantInsightsTotals }) {
  const t = useT(assistantMessages);

  const tiles = [
    {
      key: 'conversations',
      label: t('kpiConversations'),
      value: totals.conversations,
      icon: MessageSquareIcon,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    },
    {
      key: 'voice',
      label: t('kpiVoice'),
      value: totals.voice,
      icon: MicIcon,
      color: 'text-blue-600 bg-blue-50 border-blue-100',
    },
    {
      key: 'text',
      label: t('kpiText'),
      value: totals.text,
      icon: KeyboardIcon,
      color: 'text-sky-600 bg-sky-50 border-sky-100',
    },
    {
      key: 'handoffs',
      label: t('kpiHandoffs'),
      value: totals.handoffs,
      icon: UsersIcon,
      color: 'text-amber-600 bg-amber-50 border-amber-100',
    },
    {
      key: 'orders_placed',
      label: t('kpiOrdersPlaced'),
      value: totals.orders_placed,
      icon: CartIcon,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    },
    {
      key: 'returns_opened',
      label: t('kpiReturnsOpened'),
      value: totals.returns_opened,
      icon: RotateCcwIcon,
      color: 'text-rose-600 bg-rose-50 border-rose-100',
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{t('kpiHeading')}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Card
              key={tile.key}
              className="flex flex-col justify-between p-3.5 transition-shadow hover:shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">{tile.label}</span>
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${tile.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold tracking-tight text-gray-900">
                  {tile.value.toLocaleString()}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
