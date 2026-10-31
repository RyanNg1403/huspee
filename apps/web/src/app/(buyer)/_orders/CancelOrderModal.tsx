'use client';

import { useState } from 'react';
import { Button, Modal, Select, useToast } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { messages } from './messages';
import { getErrorMessage } from './shared';

export function CancelOrderModal({
  open,
  orderSn,
  onClose,
  onSuccess,
}: {
  open: boolean;
  orderSn: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT(messages);
  const tCommon = useT(common);
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('cancelReason4');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const reasonText = t(reason as keyof typeof messages.vi);
      await getApiClient().buyer.orders.cancel(orderSn, reasonText);
      toast(t('orderCancelled'));
      onSuccess();
      onClose();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('cancelModalTitle')}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">{t('cancelReasonLabel')}</label>
          <Select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full">
            <option value="cancelReason1">{t('cancelReason1')}</option>
            <option value="cancelReason2">{t('cancelReason2')}</option>
            <option value="cancelReason3">{t('cancelReason3')}</option>
            <option value="cancelReason4">{t('cancelReason4')}</option>
            <option value="cancelReasonOther">{t('cancelReasonOther')}</option>
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {t('close')}
          </Button>
          <Button type="submit" loading={submitting}>
            {t('confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
