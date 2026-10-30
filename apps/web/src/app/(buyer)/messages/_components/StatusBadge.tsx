'use client';

import { Badge } from '@/components/ui';
import { useT } from '@/i18n';
import { messages } from '../messages';

export function StatusBadge({ status }: { status: 'OPEN' | 'ANSWERED' | 'CLOSED' }) {
  const t = useT(messages);

  switch (status) {
    case 'OPEN':
      return <Badge tone="warning">{t('statusOpen')}</Badge>;
    case 'ANSWERED':
      return <Badge tone="success">{t('statusAnswered')}</Badge>;
    case 'CLOSED':
      return <Badge tone="neutral">{t('statusClosed')}</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}
