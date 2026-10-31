'use client';

import { useT } from '@huspee/web-ui/i18n';
import { inboxMessages } from './messages';

export function InboxEmptyPane() {
  const t = useT(inboxMessages);
  return <p className="flex flex-1 items-center justify-center py-16 text-muted">{t('noSelection')}</p>;
}
