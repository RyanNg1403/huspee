'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import type { BuyerReturn } from '@huspee/sdk';
import { RequireRole } from '@/components/session';
import { Button, QueryState, useToast } from '@/components/ui';
import { useLang, useT } from '@/i18n';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { formatDateTime, formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { messages } from '../../_orders/messages';
import { formatReturnReason, getErrorMessage, panel, ReturnStatusBadge } from '../../_orders/shared';

function ReturnDetailView() {
  const t = useT(messages);
  const tCommon = useT(common);
  const { lang } = useLang();
  const toast = useToast();
  const params = useParams();
  const returnSn = String(params.returnSn);

  const {
    data: returnData,
    loading,
    error,
    reload,
  } = useApi<BuyerReturn>(() => getApiClient().buyer.returns.get(returnSn), [returnSn]);

  const [acting, setActing] = useState(false);

  const handleAcceptOffer = async () => {
    setActing(true);
    try {
      await getApiClient().buyer.returns.acceptOffer(returnSn);
      toast(t('offerAccepted'));
      reload();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setActing(false);
    }
  };

  const handleCancelReturn = async () => {
    if (!window.confirm(t('confirm'))) return;
    setActing(true);
    try {
      await getApiClient().buyer.returns.cancel(returnSn);
      toast(t('returnCancelled'));
      reload();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setActing(false);
    }
  };

  if (loading || error) return <QueryState loading={loading} error={error} retry={reload} />;
  if (!returnData) return null;

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 shadow-xs rounded">
        <div className="flex items-center gap-3">
          <Link
            href="/returns"
            className="text-sm font-medium text-gray-600 hover:text-primary transition-colors flex items-center gap-1"
          >
            ← {t('back')}
          </Link>
          <span className="text-gray-300">|</span>
          <span className="font-mono text-sm font-semibold text-gray-800">
            {t('returnSn')}: {returnData.return_sn}
          </span>
        </div>
        <div>
          <ReturnStatusBadge status={returnData.status} />
        </div>
      </div>

      {/* Seller Offer Banner if present and return is still active */}
      {returnData.seller_offer && returnData.status === 'REQUESTED' && (
        <div className="border border-orange-200 bg-orange-50 p-4 rounded shadow-xs">
          <h3 className="mb-2 text-base font-semibold text-orange-900">{t('sellerOffer')}</h3>
          <p className="mb-4 text-sm text-orange-800">
            {t('sellerOfferText', {
              solution:
                returnData.seller_offer.solution === 'return_refund'
                  ? t('solutionReturnRefund')
                  : t('solutionRefundOnly'),
              amount: formatVnd(returnData.seller_offer.amount),
            })}
          </p>
          <Button size="sm" loading={acting} onClick={handleAcceptOffer}>
            {t('acceptOffer')}
          </Button>
        </div>
      )}

      {/* Return Request Summary */}
      <div className={panel}>
        <h3 className="mb-4 text-base font-semibold text-gray-800">{t('returnsTitle')}</h3>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-gray-500">{t('orderSn')}: </span>
            <Link
              href={`/orders/${returnData.order_sn}`}
              className="font-mono font-medium text-primary hover:underline"
            >
              {returnData.order_sn}
            </Link>
          </div>
          <div>
            <span className="text-gray-500">{t('solution')}: </span>
            <span className="font-medium text-gray-900">
              {returnData.solution === 'RETURN_REFUND' ? t('solutionReturnRefund') : t('solutionRefundOnly')}
            </span>
          </div>
          <div>
            <span className="text-gray-500">{t('returnReason')}: </span>
            <span className="font-medium text-gray-900">{formatReturnReason(returnData.reason, t)}</span>
          </div>
          <div>
            <span className="text-gray-500">{t('refundAmount')}: </span>
            <span className="text-base font-bold text-primary">{formatVnd(returnData.refund_amount)}</span>
            <span className="ml-2 text-xs text-gray-500">
              ({returnData.refund_paid ? t('refundPaid') : t('refundPending')})
            </span>
          </div>
        </div>

        {returnData.text_reason && (
          <div className="mt-4 border-t pt-3">
            <span className="text-xs font-semibold text-gray-600 block mb-1">{t('returnDescription')}:</span>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{returnData.text_reason}</p>
          </div>
        )}
      </div>

      {/* Reverse Tracking Timeline if available */}
      {(returnData.reverse_tracking_number || returnData.reverse_tracking.length > 0) && (
        <div className={panel}>
          <h3 className="mb-3 text-base font-semibold text-gray-800">{t('reverseTracking')}</h3>
          {returnData.reverse_tracking_number && (
            <div className="mb-3 text-sm text-gray-600">
              <span className="font-medium">{t('trackingNumber')}: </span>
              <span className="font-mono text-gray-900">{returnData.reverse_tracking_number}</span>
            </div>
          )}
          {returnData.reverse_tracking.length > 0 ? (
            <div className="relative border-l-2 border-gray-200 ml-2 space-y-4 pl-4 text-xs">
              {returnData.reverse_tracking.map((ev, idx) => (
                <div key={idx} className="relative">
                  <div
                    className={`absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border-2 border-white ${
                      idx === 0 ? 'bg-primary ring-2 ring-orange-200' : 'bg-gray-400'
                    }`}
                  />
                  <div className="text-gray-400">{formatDateTime(ev.update_time, lang)}</div>
                  <div className="font-medium text-gray-800">{ev.tracking_description}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">{t('noTrackingEvents')}</p>
          )}
        </div>
      )}

      {/* Return Items */}
      <div className={`${panel} p-0 overflow-hidden`}>
        <div className="border-b bg-gray-50/70 px-4 py-3 font-semibold text-gray-800">{t('items')}</div>
        <div className="divide-y p-4">
          {returnData.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded border bg-gray-100">
                {item.image_url ? (
                  <Image
                    unoptimized
                    width={64}
                    height={64}
                    src={item.image_url}
                    alt={item.item_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                    Huspee
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-1">
                <div className="line-clamp-2 text-sm font-medium text-gray-800">{item.item_name}</div>
                {item.model_name && (
                  <div className="text-xs text-gray-500">
                    {t('productVariant')}: {item.model_name}
                  </div>
                )}
                <div className="text-xs text-gray-500">x{item.quantity}</div>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold text-primary">{formatVnd(item.refund_amount)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action to cancel return request */}
      {returnData.status === 'REQUESTED' && (
        <div className="flex justify-end bg-white p-4 shadow-xs rounded">
          <Button variant="outline" loading={acting} onClick={handleCancelReturn}>
            {t('cancelReturn')}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ReturnDetailPage() {
  return (
    <RequireRole role="buyer">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <ReturnDetailView />
      </div>
    </RequireRole>
  );
}
