'use client';
import { VoiceWidget } from '@/components/assistant/VoiceWidget';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { QueryState } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { useAssistantEnabled } from '@/components/shop/AskAssistant';
import { messages } from '@/components/shop/messages';
import { ShopHeader } from '@/components/shop/ShopHeader';
import { ShopProducts } from '@/components/shop/ShopProducts';
import { ShopVouchers } from '@/components/shop/ShopVouchers';

export default function ShopPage() {
  const t = useT(messages);
  const id = Number(useParams().shopId);
  const shop = useApi(() => getApiClient().marketplace.getShop(id), [id]);
  const policies = useApi(() => getApiClient().marketplace.shopPolicies(id), [id]);
  const vouchers = useApi(() => getApiClient().marketplace.shopVouchers(id), [id]);
  const assistant = useAssistantEnabled(id);
  useEffect(() => {
    document.title = `${shop.data?.shop_name ?? t('shop')} | Huspee`;
  }, [shop.data, t]);
  return (
    <div className="space-y-2 sm:space-y-4">
      <VoiceWidget shopId={id} />
      <QueryState {...shop} retry={shop.reload} className="h-44 w-full" />
      {!shop.loading && !shop.error && shop.data && (
        <>
          <ShopHeader shop={shop.data} policies={policies} assistant={assistant} />
          <ShopVouchers vouchers={vouchers} />
          <ShopProducts shopId={id} />
        </>
      )}
    </div>
  );
}
