'use client';

import { useState } from 'react';
import { Button, ErrorState, Modal, Select, Spinner, useToast } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { call } from './api';
import { opsMessages } from './messages';
import type { ShippingParameterResponse } from './types';

export function ShipModal({
  open,
  shopId,
  orderSn,
  onClose,
  onSuccess,
}: {
  open: boolean;
  shopId: number;
  orderSn: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT(opsMessages);
  const toast = useToast();

  const [pending, setPending] = useState(false);
  const [method, setMethod] = useState<'pickup' | 'dropoff'>('pickup');
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string>('');

  const paramsApi = useApi(async () => {
    if (!open) return null;
    return call<ShippingParameterResponse>(shopId, '/logistics/get_shipping_parameter', {
      order_sn: orderSn,
    });
  }, [open, shopId, orderSn]);

  const params = paramsApi.data;
  const firstAddr = params?.pickup?.address_list?.[0];
  const effectiveAddressId = selectedAddressId ?? firstAddr?.address_id ?? null;
  const currentAddress = params?.pickup?.address_list?.find((a) => a.address_id === effectiveAddressId);
  const effectiveTimeSlotId = selectedTimeSlotId || currentAddress?.time_slot_list?.[0]?.pickup_time_id || '';

  async function handleConfirmShip() {
    setPending(true);
    try {
      if (method === 'pickup') {
        if (!effectiveAddressId) throw new Error(t('selectPickupAddress'));
        await call(shopId, '/logistics/ship_order', {
          order_sn: orderSn,
          pickup: {
            address_id: effectiveAddressId,
            ...(effectiveTimeSlotId ? { pickup_time_id: effectiveTimeSlotId } : {}),
          },
        });
      } else {
        await call(shopId, '/logistics/ship_order', {
          order_sn: orderSn,
          dropoff: {},
        });
      }
      toast(t('shippingSuccess'));
      onSuccess();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failedMutation'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('shipOrder')}>
      {paramsApi.loading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : paramsApi.error ? (
        <div className="space-y-4 py-2">
          <ErrorState
            message={t('shippingParamsFailed')}
            onRetry={paramsApi.reload}
            retryLabel={t('retry')}
          />
          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>
              {t('close')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700">{t('shipMethod')}</label>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="shipMethod"
                  checked={method === 'pickup'}
                  onChange={() => setMethod('pickup')}
                />
                <span>{t('pickup')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="shipMethod"
                  checked={method === 'dropoff'}
                  onChange={() => setMethod('dropoff')}
                />
                <span>{t('dropoff')}</span>
              </label>
            </div>
          </div>

          {method === 'pickup' ? (
            <div className="space-y-3 rounded-lg bg-gray-50 p-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('selectPickupAddress')}</label>
                <Select
                  value={effectiveAddressId ?? ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setSelectedAddressId(id);
                    const addr = params?.pickup?.address_list?.find((a) => a.address_id === id);
                    setSelectedTimeSlotId(addr?.time_slot_list?.[0]?.pickup_time_id ?? '');
                  }}
                  className="mt-1"
                >
                  {(params?.pickup?.address_list ?? []).map((a) => (
                    <option key={a.address_id} value={a.address_id}>
                      {a.address}, {a.district}, {a.city}
                    </option>
                  ))}
                </Select>
              </div>

              {currentAddress?.time_slot_list?.length ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('selectTimeSlot')}</label>
                  <Select
                    value={effectiveTimeSlotId}
                    onChange={(e) => setSelectedTimeSlotId(e.target.value)}
                    className="mt-1"
                  >
                    {currentAddress.time_slot_list.map((slot) => (
                      <option key={slot.pickup_time_id} value={slot.pickup_time_id}>
                        {slot.time_text} ({slot.pickup_time_id})
                        {slot.flags.includes('recommended') ? t('recommendedSlot') : ''}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              <p>{t('dropoffDescription')}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={method === 'pickup' && !effectiveAddressId}
              onClick={() => void handleConfirmShip()}
            >
              {t('confirmShip')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
