'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { useSelectedShop } from '@/components/layout';
import { Button, EmptyState, ErrorState, Spinner } from '@/components/ui';
import { useT } from '@/i18n';
import { assistantMessages } from '../messages';

export function AssistantShopGuard({ children }: { children: (shop: SellerShop) => ReactNode }) {
  const t = useT(assistantMessages);
  const { shops, selectedShopId, loading, error, refresh } = useSelectedShop();
  const shop = shops.find((s) => s.shop_id === selectedShopId);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={t('loadFailed')} onRetry={refresh} retryLabel={t('retry')} />;
  }

  if (!shop) {
    return (
      <EmptyState title={t('noShop')}>
        <div className="mt-3">
          <Link href="/seller/shops">
            <Button variant="primary">{t('goToShops')}</Button>
          </Link>
        </div>
      </EmptyState>
    );
  }

  return <>{children(shop)}</>;
}
