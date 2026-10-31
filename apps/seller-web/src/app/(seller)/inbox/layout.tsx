'use client';

import type { ReactNode } from 'react';
import { InboxLayout } from '@/components/assistant-review/inbox/InboxLayout';
import { InboxShopGuard } from './_components/InboxShopGuard';

export default function SellerInboxLayout({ children }: { children: ReactNode }) {
  return (
    <InboxShopGuard>{(shop) => <InboxLayout shopId={shop.shop_id}>{children}</InboxLayout>}</InboxShopGuard>
  );
}
