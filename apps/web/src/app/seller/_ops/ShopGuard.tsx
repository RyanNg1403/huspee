'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { useSelectedShop } from '@/components/layout';
import { Button, EmptyState, ErrorState, Spinner } from '@/components/ui';
import { useT } from '@/i18n/client';
import { opsMessages } from './messages';

export function ShopGuard({ children }: { children: (shop: SellerShop) => ReactNode }) {
  const t = useT(opsMessages);
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
    return <ErrorState message={t('failed')} onRetry={refresh} retryLabel={t('retry')} />;
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

  if (!shop.connection?.connected) {
    return (
      <EmptyState title={t('notConnected')}>
        <div className="mt-3">
          <Link href={`/seller/shops/${shop.shop_id}`}>
            <Button variant="primary">{t('connect')}</Button>
          </Link>
        </div>
      </EmptyState>
    );
  }

  return <>{children(shop)}</>;
}
