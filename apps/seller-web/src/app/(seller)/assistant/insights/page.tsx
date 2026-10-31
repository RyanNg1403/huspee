'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, ErrorState, Spinner } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { AssistantShopGuard } from '../_components/AssistantShopGuard';
import { assistantMessages } from '../messages';
import { CampaignsCard } from './_components/CampaignsCard';
import { AlertTriangleIcon, RefreshIcon } from './_components/icons';
import { MissingRequestsCard } from './_components/MissingRequestsCard';
import { InsightsOverview } from './_components/Overview';
import { SummariesSection } from './_components/SummariesSection';
import { TopProductsCard } from './_components/TopProductsCard';
import { TrendChart } from './_components/TrendChart';

type DateRangeDays = 7 | 30 | 90;

export default function AssistantInsightsPage() {
  return <AssistantShopGuard>{(shop) => <InsightsContent shopId={shop.shop_id} />}</AssistantShopGuard>;
}

function InsightsContent({ shopId }: { shopId: number }) {
  const t = useT(assistantMessages);
  const [days, setDays] = useState<DateRangeDays>(30);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch shop assistant config to check enabled status
  const configApi = useApi(async () => {
    return getApiClient().seller.assistant.getConfig(shopId);
  }, [shopId, refreshKey]);

  // Fetch insights
  const insightsApi = useApi(async () => {
    const now = Math.floor(Date.now() / 1000);
    const to = now;
    const from = now - days * 86400;
    return getApiClient().seller.assistant.insights(shopId, { from, to });
  }, [shopId, days, refreshKey]);

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  const isAssistantDisabled = configApi.data && !configApi.data.enabled;
  const insights = insightsApi.data;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('insightsTitle')}</h1>
        </div>

        {/* Date Range Selector & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setDays(7)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                days === 7 ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('range7d')}
            </button>
            <button
              type="button"
              onClick={() => setDays(30)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                days === 30 ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('range30d')}
            </button>
            <button
              type="button"
              onClick={() => setDays(90)}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                days === 90 ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('range90d')}
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={insightsApi.loading}>
            <RefreshIcon className={`h-3.5 w-3.5 ${insightsApi.loading ? 'animate-spin' : ''}`} />
            <span>{t('refreshData')}</span>
          </Button>
        </div>
      </div>

      {/* Sub Nav */}

      {/* Assistant Disabled Alert */}
      {isAssistantDisabled && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangleIcon className="h-4 w-4" />
            </span>
            <p className="text-xs font-medium text-amber-900">{t('assistantDisabledBanner')}</p>
          </div>
          <Link href="/assistant">
            <Button variant="outline" size="sm">
              {t('goToSettings')} →
            </Button>
          </Link>
        </Card>
      )}

      {/* Loading State */}
      {insightsApi.loading ? (
        <div className="flex h-72 items-center justify-center">
          <Spinner />
        </div>
      ) : insightsApi.error || !insights ? (
        <ErrorState message={t('loadFailed')} onRetry={insightsApi.reload} retryLabel={t('retry')} />
      ) : (
        <div className="space-y-6">
          <InsightsOverview insights={insights} />

          {/* 2. Daily Trend Chart */}
          <TrendChart daily={insights.daily} />

          {/* 3. Top Products and Campaigns */}
          <div className="grid gap-6 md:grid-cols-2">
            <TopProductsCard products={insights.top_products} />
            <CampaignsCard campaigns={insights.campaigns} />
          </div>

          {/* 4. Missing Requests and Unanswered Questions */}
          <MissingRequestsCard requests={insights.missing_requests} />

          {/* 5. Latest AI Summaries */}
          <SummariesSection shopId={shopId} summaries={insights.summaries} onReload={insightsApi.reload} />
        </div>
      )}
    </div>
  );
}
