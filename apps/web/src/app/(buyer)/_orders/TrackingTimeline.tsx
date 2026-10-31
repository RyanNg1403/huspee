'use client';

import type { BuyerOrder, OrderStatus, OrderTracking } from '@huspee/sdk';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatDateTime } from '@huspee/web-ui/lib/format';
import { messages } from './messages';

export function OrderStatusStepper({ status, order }: { status?: OrderStatus; order?: BuyerOrder }) {
  const t = useT(messages);
  const currentStatus = order?.status ?? status ?? 'UNPAID';
  const isPaid = order ? Boolean(order.pay_time) : currentStatus !== 'UNPAID';
  const isDelivered = order
    ? ['TO_CONFIRM_RECEIVE', 'COMPLETED'].includes(currentStatus) || Boolean(order.delivered_time)
    : ['TO_CONFIRM_RECEIVE', 'COMPLETED'].includes(currentStatus);
  const isCancelled = currentStatus === 'CANCELLED';

  const steps = [
    { key: 'ordered', label: t('stepOrdered'), active: true },
    {
      key: 'paid',
      label: t('stepPaid'),
      active: isPaid && !isCancelled,
    },
    {
      key: 'shipped',
      label: t('stepShipped'),
      active:
        !isCancelled && ['SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED', 'TO_RETURN'].includes(currentStatus),
    },
    {
      key: 'delivered',
      label: t('stepDelivered'),
      active: !isCancelled && isDelivered,
    },
  ];

  return (
    <div className="py-4">
      {isCancelled && (
        <div className="mb-4 rounded-xl bg-red-50 p-2 text-center text-sm font-semibold text-red-600">
          {t('statusCancelled')}
          {order?.cancel_reason ? `: ${order.cancel_reason}` : ''}
        </div>
      )}
      <div className="flex items-center justify-between">
        {steps.map((step, idx) => (
          <div key={step.key} className="flex flex-1 items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  step.active ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {idx + 1}
              </div>
              <span className="mt-2 text-center text-xs font-medium text-gray-700">{step.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`mx-2 h-0.5 flex-1 ${steps[idx + 1].active ? 'bg-primary' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrackingTimeline({ tracking }: { tracking: OrderTracking | null }) {
  const t = useT(messages);
  const { lang } = useLang();

  if (!tracking) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <span className="text-gray-500">{t('carrier')}: </span>
          <span className="font-medium text-gray-900">{tracking.shipping_carrier}</span>
        </div>
        <div>
          <span className="text-gray-500">{t('trackingNumber')}: </span>
          <span className="font-medium text-gray-900">{tracking.tracking_number || '---'}</span>
        </div>
      </div>

      <div className="border-t pt-3">
        <h4 className="mb-3 text-sm font-semibold text-gray-800">{t('trackingTitle')}</h4>
        {tracking.events.length === 0 ? (
          <p className="text-xs text-gray-500">{t('noTrackingEvents')}</p>
        ) : (
          <div className="relative border-l-2 border-gray-200 ml-2 space-y-4 pl-4 text-xs">
            {tracking.events.map((event, i) => (
              <div key={i} className="relative">
                <div
                  className={`absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border-2 border-white ${
                    i === 0 ? 'bg-primary ring-2 ring-orange-200' : 'bg-gray-400'
                  }`}
                />
                <div className="text-gray-400">{formatDateTime(event.time, lang)}</div>
                <div className="font-medium text-gray-800">{event.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
