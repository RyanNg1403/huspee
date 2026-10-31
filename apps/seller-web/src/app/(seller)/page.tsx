'use client';
import Link from 'next/link';
import { useSelectedShop } from '@/components/layout';
import { Card, ErrorState, Spinner } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { common as commonMessages } from '@huspee/web-ui/i18n/common';
import { errorMessageKey } from '@huspee/web-ui/lib/api';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { messages } from './_catalog/messages';
export default function SellerHome() {
  const t = useT(messages);
  const commonT = useT(commonMessages);
  const { shops, selectedShopId, loading, error, refresh } = useSelectedShop();
  const shop = shops.find((s) => s.shop_id === selectedShopId);
  const summary = useApi(
    () =>
      selectedShopId && shop?.connection.connected
        ? getApiClient().seller.dashboardSummary(selectedShopId)
        : Promise.resolve(null),
    [selectedShopId, shop?.connection.connected],
  );
  if (loading) return <Spinner />;
  if (error) return <ErrorState message={t('failed')} onRetry={refresh} retryLabel={t('retry')} />;
  if (!shop)
    return (
      <Card>
        <p>{t('noShop')}</p>
        <Link href="/shops/new" className="text-primary">
          {t('createShop')}
        </Link>
      </Card>
    );
  if (!shop.connection.connected)
    return (
      <Card>
        <p>{t('notConnected')}</p>
        <Link href={`/shops/${shop.shop_id}`} className="text-primary">
          {t('connect')}
        </Link>
      </Card>
    );
  if (summary.loading) return <Spinner />;
  if (summary.error)
    return (
      <ErrorState
        message={commonT(errorMessageKey(summary.error))}
        onRetry={summary.reload}
        retryLabel={t('retry')}
      />
    );
  if (!summary.data) return null;
  const data = summary.data;
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">
        {t('dashboard')} · {shop.shop_name}
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [t('toShip'), data.to_ship_count, '/orders'],
          [t('openReturns'), data.open_return_count, '/returns'],
          [t('lowStock'), data.low_stock_models.length, '/products'],
          [t('revenue'), formatVnd(data.total_revenue), '/orders'],
        ].map(([label, value, url]) => (
          <Link key={String(label)} href={String(url)}>
            <Card>
              <p>{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
