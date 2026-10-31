'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { useSelectedShop } from '@/components/layout';
import { EmptyState, ErrorState, Spinner } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { commerceMessages } from './messages';
import { btn } from './ui';

/** Renders commerce pages only for a selected, connected shop. */
export function ShopGuard({ children }: { children: (shop: SellerShop) => ReactNode }) {
  const t = useT(commerceMessages);
  const { shops, selectedShopId, loading, error, refresh } = useSelectedShop();
  const shop = shops.find((s) => s.shop_id === selectedShopId);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-primary">
        <Spinner />
      </div>
    );
  }
  if (error) return <ErrorState message={t('loadFailed')} onRetry={refresh} retryLabel={t('retry')} />;
  if (!shop) {
    return (
      <EmptyState title={t('noShop')}>
        <Link href="/shops" className={btn.primary}>
          {t('goToShops')}
        </Link>
      </EmptyState>
    );
  }
  if (!shop.connection?.connected) {
    return (
      <EmptyState title={t('notConnected')}>
        <Link href={`/shops/${shop.shop_id}`} className={btn.primary}>
          {t('connect')}
        </Link>
      </EmptyState>
    );
  }
  return <>{children(shop)}</>;
}
