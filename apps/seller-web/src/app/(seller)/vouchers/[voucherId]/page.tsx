'use client';

import { useParams } from 'next/navigation';
import { useT } from '@huspee/web-ui/i18n/client';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { Breadcrumb } from '@/components/commerce/Breadcrumb';
import { ListState } from '@/components/commerce/ListState';
import { ShopGuard } from '@/components/commerce/ShopGuard';
import { loadVoucher } from '@/components/commerce/vouchers/voucher-api';
import { VoucherForm } from '@/components/commerce/vouchers/VoucherForm';
import { voucherMessages } from '../messages';

export default function EditVoucherPage() {
  const voucherId = Number(useParams().voucherId);
  return <ShopGuard>{(shop) => <EditVoucher shopId={shop.shop_id} voucherId={voucherId} />}</ShopGuard>;
}

function EditVoucher({ shopId, voucherId }: { shopId: number; voucherId: number }) {
  const t = useT(voucherMessages);
  const voucher = useApi(() => loadVoucher(shopId, voucherId), [shopId, voucherId]);
  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[{ label: t('title'), href: '/vouchers' }, { label: voucher.data?.voucher_code ?? t('edit') }]}
      />
      <h1 className="text-xl font-semibold">{t('edit')}</h1>
      <ListState
        loading={voucher.loading}
        error={voucher.error}
        empty={!voucher.data}
        emptyTitle={t('notFound')}
        onRetry={voucher.reload}
      >
        {voucher.data && (
          <VoucherForm key={voucher.data.voucher_id} shopId={shopId} original={voucher.data} />
        )}
      </ListState>
    </div>
  );
}
