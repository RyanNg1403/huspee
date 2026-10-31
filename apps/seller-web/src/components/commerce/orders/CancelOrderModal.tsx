'use client';

import { useState } from 'react';
import { Modal, Spinner, useToast } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { call } from '@/lib/seller-api';
import { ActionError } from '../errors';
import { notifyOrdersChanged } from '../events';
import { btn } from '../ui';
import { orderUiMessages } from './messages';
import type { OrderDetail } from './types';

const REASONS = ['OUT_OF_STOCK', 'CUSTOMER_REQUEST', 'UNDELIVERABLE_AREA', 'COD_NOT_SUPPORTED'] as const;
type Reason = (typeof REASONS)[number];

/** S3.4: seller cancellation with the reasons the API accepts; stock goes back per line. */
export function CancelOrderModal({
  shopId,
  order,
  onClose,
  onCancelled,
}: {
  shopId: number;
  order: OrderDetail;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const t = useT(orderUiMessages);
  const toast = useToast();
  const [reason, setReason] = useState<Reason>('OUT_OF_STOCK');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const reasons = REASONS.filter((r) => r !== 'COD_NOT_SUPPORTED' || order.cod);
  const lines = order.item_list ?? [];

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await call(shopId, '/order/cancel_order', {
        order_sn: order.order_sn,
        cancel_reason: reason,
        ...(reason === 'OUT_OF_STOCK'
          ? { item_list: lines.map((i) => ({ item_id: i.item_id, model_id: i.model_id })) }
          : {}),
      });
      toast(t('cancelled', { sn: order.order_sn }));
      notifyOrdersChanged();
      onCancelled();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('cancelTitle', { sn: order.order_sn })}>
      <div className="space-y-4 text-sm">
        <fieldset>
          <legend className="mb-2 font-medium">{t('cancelReason')}</legend>
          <div className="space-y-2">
            {reasons.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="cancel-reason"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {t(`reason${r}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {lines.length > 0 && (
          <div className="space-y-1 rounded-[4px] bg-warning-soft px-3 py-2.5 text-warning">
            {lines.map((i) => (
              <p key={`${i.item_id}-${i.model_id}`}>
                {t('restock', {
                  name: [i.item_name, i.model_name].filter(Boolean).join(' '),
                  qty: i.model_quantity_purchased,
                })}
              </p>
            ))}
          </div>
        )}
        <ActionError error={error} />
        <div className="-mx-6 flex justify-end gap-3 border-t border-line-soft px-6 pt-4">
          <button type="button" className={btn.outline} onClick={onClose} disabled={pending}>
            {t('back')}
          </button>
          <button type="button" className={btn.primary} disabled={pending} onClick={() => void submit()}>
            {pending && <Spinner />}
            {t('cancelOrder')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
