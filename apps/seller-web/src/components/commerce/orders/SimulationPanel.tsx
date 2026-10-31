'use client';

import { useState } from 'react';
import { useToast } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { call } from '@/lib/seller-api';
import { ActionError } from '../errors';
import { notifyOrdersChanged } from '../events';
import { btn } from '../ui';
import { orderUiMessages } from './messages';
import type { OrderStatus } from './order-filters';

const EVENTS: Partial<Record<OrderStatus, readonly SimEvent[]>> = {
  PROCESSED: ['PICKED_UP'],
  SHIPPED: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED'],
};
type SimEvent = 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED';

/** Demo-only carrier progress (custom signed extension), offered only for legal transitions. */
export function SimulationPanel({
  shopId,
  orderSn,
  status,
  onUpdated,
}: {
  shopId: number;
  orderSn: string;
  status: OrderStatus;
  onUpdated: () => void;
}) {
  const t = useT(orderUiMessages);
  const toast = useToast();
  const [pending, setPending] = useState<SimEvent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const events = EVENTS[status];
  if (!events) return null;

  async function simulate(event: SimEvent) {
    setPending(event);
    setError(null);
    try {
      await call(shopId, '/custom/logistics/simulate_shipment_event', { order_sn: orderSn, event });
      toast(t('simulated'));
      notifyOrdersChanged();
      onUpdated();
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-line-soft pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-[13px] text-muted">{t('simulation')}</span>
        {events.map((event) => (
          <button
            key={event}
            type="button"
            className={btn.outlineSm}
            disabled={pending !== null}
            onClick={() => void simulate(event)}
          >
            {t(`sim${event}`)}
          </button>
        ))}
      </div>
      <ActionError error={error} />
    </div>
  );
}
