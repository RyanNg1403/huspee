'use client';

import { useSearchParams } from 'next/navigation';
import { useT } from '@huspee/web-ui/i18n/client';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { Breadcrumb } from '@/components/commerce/Breadcrumb';
import { ListState } from '@/components/commerce/ListState';
import { ShopGuard } from '@/components/commerce/ShopGuard';
import { loadVoucher } from '@/components/commerce/vouchers/voucher-api';
import { VoucherForm } from '@/components/commerce/vouchers/VoucherForm';
import { voucherMessages } from '../messages';

export default function NewVoucherPage() {
  return <ShopGuard>{(shop) => <NewVoucher shopId={shop.shop_id} />}</ShopGuard>;
}

function NewVoucher({ shopId }: { shopId: number }) {
  const t = useT(voucherMessages);
  const copyId = Number(useSearchParams().get('copy')) || 0;
  const source = useApi(
    () => (copyId ? loadVoucher(shopId, copyId) : Promise.resolve(null)),
    [shopId, copyId],
  );
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: t('title'), href: '/vouchers' }, { label: t('create') }]} />
      <h1 className="text-xl font-semibold">{t('create')}</h1>
      <ListState
        loading={source.loading}
        error={source.error}
        empty={false}
        emptyTitle=""
        onRetry={source.reload}
      >
        <VoucherForm shopId={shopId} source={source.data ?? undefined} />
      </ListState>
    </div>
  );
}
