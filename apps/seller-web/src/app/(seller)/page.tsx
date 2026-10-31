'use client';
import Link from 'next/link';
import { ErrorState, Skeleton } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { useSelectedShop } from '@/components/layout';
import { Block } from '@/components/shell';
import { loadAssistant, loadSales, loadWeekInsights } from './_home/api';
import { AssistantBlock } from './_home/AssistantBlock';
import { IssuesBlock } from './_home/IssuesBlock';
import { homeMessages } from './_home/messages';
import { SalesBlock } from './_home/SalesBlock';
import { TodayOrdersBlock } from './_home/TodayOrdersBlock';
import { TodoBlock } from './_home/TodoBlock';

function Overview({ shopId }: { shopId: number }) {
  const week = useApi(() => loadWeekInsights(shopId), [shopId]);
  const sales = useApi(() => loadSales(shopId), [shopId]);
  const assistant = useApi(() => loadAssistant(shopId), [shopId]);
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-4">
        <TodoBlock week={week} />
        <SalesBlock sales={sales} />
        <IssuesBlock week={week} />
        <TodayOrdersBlock sales={sales} />
      </div>
      <aside className="flex min-w-0 flex-col gap-4">
        <AssistantBlock assistant={assistant} />
      </aside>
    </div>
  );
}

export default function SellerHome() {
  const t = useT(homeMessages);
  const { shops, selectedShopId, loading, error, refresh } = useSelectedShop();
  const shop = shops.find((s) => s.shop_id === selectedShopId);
  const linkClass =
    'mt-4 inline-flex h-9 items-center rounded bg-primary px-4 font-semibold text-white hover:bg-primary-hover';

  let content;
  if (loading) content = <Skeleton className="h-96 w-full" />;
  else if (error) content = <ErrorState message={t('failed')} onRetry={refresh} retryLabel={t('retry')} />;
  else if (!shop)
    content = (
      <Block>
        <p className="text-center">{t('noShop')}</p>
        <div className="text-center">
          <Link href="/shops/new" className={linkClass}>
            {t('createShop')}
          </Link>
        </div>
      </Block>
    );
  else if (!shop.connection.connected)
    content = (
      <Block>
        <p className="text-center">
          {t('notConnected', { shop: shop.shop_name, app: shop.connection.partner_name })}
        </p>
        <div className="text-center">
          <Link href={`/shops/${shop.shop_id}/connect`} className={linkClass}>
            {t('connect')}
          </Link>
        </div>
      </Block>
    );
  else content = <Overview key={shop.shop_id} shopId={shop.shop_id} />;

  return (
    <>
      <h1 className="sr-only">{t('overview')}</h1>
      {content}
    </>
  );
}
