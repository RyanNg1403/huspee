'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RequireRole } from '@huspee/web-ui/components/session';
import { Button, Icon } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from '../../_orders/messages';
import { panel } from '../../_orders/shared';

function CheckoutSuccessView() {
  const t = useT(messages);
  const searchParams = useSearchParams();
  const ordersParam = searchParams.get('orders');
  const orderSns = ordersParam
    ? ordersParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className={`${panel} text-center`}>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
          <Icon name="check" className="h-8 w-8" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-gray-800">{t('orderSuccess')}</h2>
        <p className="mb-6 text-sm text-gray-600">{t('orderSuccessDesc')}</p>

        {orderSns.length > 0 && (
          <div className="mb-6 rounded-lg border bg-gray-50 p-4 text-left">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">{t('ordersTitle')}:</h3>
            <div className="space-y-2">
              {orderSns.map((sn) => (
                <div key={sn} className="flex items-center justify-between rounded-xl border bg-white p-3">
                  <span className="font-mono text-sm font-medium text-gray-800">{sn}</span>
                  <Link href={`/orders/${sn}`} className="text-sm font-medium text-primary hover:underline">
                    {t('viewDetail')} →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/orders">
            <Button variant="outline">{t('viewOrders')}</Button>
          </Link>
          <Link href="/">
            <Button>{t('continueShopping')}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <RequireRole role="buyer">
      <CheckoutSuccessView />
    </RequireRole>
  );
}
