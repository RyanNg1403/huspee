'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '@huspee/web-ui/i18n';
import { inboxMessages } from './messages';
import { TicketList } from './TicketList';

/** Questions on the left, the open one on the right; on narrow screens one pane at a time. */
export function InboxLayout({ shopId, children }: { shopId: number; children: ReactNode }) {
  const t = useT(inboxMessages);
  const params = useParams<{ id?: string }>();
  const selectedId = params.id ? Number(params.id) : null;
  const router = useRouter();
  const shown = useRef(shopId);
  // A ticket belongs to one shop; switching shops goes back to that shop's list.
  useEffect(() => {
    if (shown.current === shopId) return;
    shown.current = shopId;
    if (selectedId !== null) router.replace('/inbox');
  }, [shopId, selectedId, router]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <div className="flex min-h-[720px] flex-col rounded bg-white shadow-card xl:flex-row">
        <section
          aria-label={t('listLabel')}
          className={`min-w-0 flex-col border-line-soft xl:flex xl:w-[380px] xl:shrink-0 xl:border-r ${
            selectedId ? 'hidden' : 'flex'
          }`}
        >
          {/* A different shop starts from a fresh list. */}
          <TicketList key={shopId} shopId={shopId} selectedId={selectedId} />
        </section>
        <section
          aria-label={t('detailLabel')}
          className={`min-w-0 flex-1 flex-col xl:flex ${selectedId ? 'flex' : 'hidden'}`}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
