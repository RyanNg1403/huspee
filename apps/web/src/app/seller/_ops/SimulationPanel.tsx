'use client';

import { useState } from 'react';
import { Button, Card, useToast } from '@/components/ui';
import { useT } from '@/i18n/client';
import { call } from './api';
import { opsMessages } from './messages';
import type { OrderStatusType } from './types';

export function SimulationPanel({
  shopId,
  orderSn,
  currentStatus,
  onUpdated,
}: {
  shopId: number;
  orderSn: string;
  currentStatus: OrderStatusType;
  onUpdated: () => void;
}) {
  const t = useT(opsMessages);
  const toast = useToast();
  const [pendingEvent, setPendingEvent] = useState<string | null>(null);

  const canPickup = currentStatus === 'PROCESSED';
  const canProgressShipment = currentStatus === 'SHIPPED';
  const hasLegalEvents = canPickup || canProgressShipment;

  async function handleSimulate(event: string) {
    setPendingEvent(event);
    try {
      await call(shopId, '/custom/logistics/simulate_shipment_event', {
        order_sn: orderSn,
        event,
      });
      toast(t('simulationSuccess'));
      onUpdated();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failedMutation'));
    } finally {
      setPendingEvent(null);
    }
  }

  return (
    <Card className="border border-amber-200 bg-amber-50/50">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-amber-200 px-2 py-0.5 text-xs font-semibold uppercase text-amber-900">
            {t('simulationBadge')}
          </span>
          <h3 className="text-lg font-bold text-gray-900">{t('simulationTool')}</h3>
        </div>
        <p className="text-sm text-gray-600">{t('simulationDisclaimer')}</p>

        {!hasLegalEvents ? (
          <p className="mt-2 text-sm italic text-gray-500">{t('noSimulationAvailable')}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {canPickup && (
              <Button
                variant="outline"
                size="sm"
                className="border-blue-600 text-blue-700 hover:bg-blue-50"
                loading={pendingEvent === 'PICKED_UP'}
                disabled={Boolean(pendingEvent)}
                onClick={() => void handleSimulate('PICKED_UP')}
              >
                {t('simulatePickup')}
              </Button>
            )}

            {canProgressShipment && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-indigo-600 text-indigo-700 hover:bg-indigo-50"
                  loading={pendingEvent === 'IN_TRANSIT'}
                  disabled={Boolean(pendingEvent)}
                  onClick={() => void handleSimulate('IN_TRANSIT')}
                >
                  {t('simulateInTransit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-indigo-600 text-indigo-700 hover:bg-indigo-50"
                  loading={pendingEvent === 'OUT_FOR_DELIVERY'}
                  disabled={Boolean(pendingEvent)}
                  onClick={() => void handleSimulate('OUT_FOR_DELIVERY')}
                >
                  {t('simulateOutForDelivery')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  loading={pendingEvent === 'DELIVERED'}
                  disabled={Boolean(pendingEvent)}
                  onClick={() => void handleSimulate('DELIVERED')}
                >
                  {t('simulateDelivered')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-600 text-red-700 hover:bg-red-50"
                  loading={pendingEvent === 'DELIVERY_FAILED'}
                  disabled={Boolean(pendingEvent)}
                  onClick={() => void handleSimulate('DELIVERY_FAILED')}
                >
                  {t('simulateDeliveryFailed')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
