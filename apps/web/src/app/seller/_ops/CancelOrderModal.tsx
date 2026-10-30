'use client';

import { useState } from 'react';
import { Button, Modal, Select, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { call } from './api';
import { opsMessages } from './messages';
import type { OrderDetail } from './types';

export function CancelOrderModal({
  open,
  shopId,
  order,
  onClose,
  onSuccess,
}: {
  open: boolean;
  shopId: number;
  order: OrderDetail;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT(opsMessages);
  const toast = useToast();

  const [reason, setReason] = useState<string>('CUSTOMER_REQUEST');
  const [pending, setPending] = useState(false);

  const reasons = [
    { value: 'CUSTOMER_REQUEST', label: t('cancelReasonCustomerRequest') },
    { value: 'OUT_OF_STOCK', label: t('cancelReasonOutOfStock') },
    { value: 'UNDELIVERABLE_AREA', label: t('cancelReasonUndeliverable') },
    ...(order.cod ? [{ value: 'COD_NOT_SUPPORTED', label: t('cancelReasonCodNotSupported') }] : []),
  ];

  async function handleConfirmCancel() {
    setPending(true);
    try {
      const payload: Record<string, unknown> = {
        order_sn: order.order_sn,
        cancel_reason: reason,
      };

      if (reason === 'OUT_OF_STOCK') {
        payload.item_list = (order.item_list ?? []).map((i) => ({
          item_id: i.item_id,
          model_id: i.model_id,
        }));
      }

      await call(shopId, '/order/cancel_order', payload);
      toast(t('cancelOrderSuccess'));
      onSuccess();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failedMutation'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('cancelOrder')}>
      <div className="space-y-4 py-2">
        <p className="text-sm text-gray-600">{t('cancelOrderConfirm')}</p>

        <div>
          <label className="block text-sm font-semibold text-gray-700">{t('reason')}</label>
          <Select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1">
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>

        {reason === 'OUT_OF_STOCK' && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{t('outOfStockNotice')}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            className="bg-red-600 hover:bg-red-700"
            loading={pending}
            onClick={() => void handleConfirmCancel()}
          >
            {t('confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
