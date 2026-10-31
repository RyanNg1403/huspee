'use client';

import { useState } from 'react';
import type { BuyerOrder, ReturnReason, ReturnEvidence } from '@huspee/sdk';
import { Button, Input, Modal, Select, Textarea, useToast } from '@huspee/web-ui/components/ui';
import { EvidencePicker } from '@huspee/web-ui/components/refunds/EvidencePicker';
import { useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { messages } from './messages';
import { getErrorMessage } from './shared';

export function ReturnRequestModal({
  open,
  order,
  onClose,
  onSuccess,
}: {
  open: boolean;
  order: BuyerOrder;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT(messages);
  const tCommon = useT(common);
  const toast = useToast();
  const [evidence, setEvidence] = useState<ReturnEvidence[]>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [solution, setSolution] = useState<'RETURN_REFUND' | 'REFUND_ONLY'>('RETURN_REFUND');
  const [reason, setReason] = useState<ReturnReason>('DIFFERENT_DESCRIPTION');
  const [textReason, setTextReason] = useState('');

  // Item & quantity selection (F04)
  const [selectedModels, setSelectedModels] = useState<Set<number>>(
    () => new Set(order.items.map((i) => i.model_id)),
  );
  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries(order.items.map((i) => [i.model_id, i.quantity])),
  );

  const toggleItem = (modelId: number) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const setItemQuantity = (modelId: number, max: number, qty: number) => {
    const clamped = Math.max(1, Math.min(max, qty));
    setQuantities((prev) => ({ ...prev, [modelId]: clamped }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || evidenceBusy) return;
    const chosenItems = order.items.filter((i) => selectedModels.has(i.model_id));
    if (chosenItems.length === 0) {
      toast(t('pleaseSelectAtLeastOneItem'));
      return;
    }

    setSubmitting(true);
    try {
      await getApiClient().buyer.returns.create({
        order_sn: order.order_sn,
        reason,
        solution,
        text_reason: textReason,
        evidence_ids: evidence.map((photo) => photo.evidence_id),
        items: chosenItems.map((i) => ({
          item_id: i.item_id,
          model_id: i.model_id,
          quantity: quantities[i.model_id] ?? i.quantity,
        })),
      });
      toast(t('statusRequested'));
      onSuccess();
      onClose();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('requestReturn')}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Item & Quantity Selection */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-800">{t('selectItemsToReturn')}</label>
          <div className="max-h-60 overflow-y-auto space-y-2 divide-y divide-gray-100 rounded-xl border p-2">
            {order.items.map((item) => {
              const checked = selectedModels.has(item.model_id);
              const qty = quantities[item.model_id] ?? item.quantity;
              return (
                <div key={item.model_id} className="flex items-center justify-between gap-3 pt-2 first:pt-0">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(item.model_id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div className="truncate text-xs">
                      <p className="font-medium text-gray-900 truncate">{item.item_name}</p>
                      {item.model_name && (
                        <p className="text-gray-500">
                          {t('productVariant')}: {item.model_name}
                        </p>
                      )}
                      <p className="text-primary font-medium">{formatVnd(item.unit_price)}</p>
                    </div>
                  </label>
                  {checked && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-gray-500">{t('quantity')}:</span>
                      <Input
                        type="number"
                        min={1}
                        max={item.quantity}
                        value={qty}
                        onChange={(e) =>
                          setItemQuantity(item.model_id, item.quantity, parseInt(e.target.value, 10) || 1)
                        }
                        className="w-16 h-7 text-xs text-center"
                      />
                      <span className="text-xs text-gray-400">/ {item.quantity}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('solution')}</label>
          <Select
            value={solution}
            onChange={(e) => setSolution(e.target.value as 'RETURN_REFUND' | 'REFUND_ONLY')}
            className="w-full"
          >
            <option value="RETURN_REFUND">{t('solutionReturnRefund')}</option>
            <option value="REFUND_ONLY">{t('solutionRefundOnly')}</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('returnReason')}</label>
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value as ReturnReason)}
            className="w-full"
          >
            <option value="NOT_RECEIPT">{t('reasonNotReceipt')}</option>
            <option value="DIFFERENT_DESCRIPTION">{t('reasonDifferentDescription')}</option>
            <option value="WRONG_ITEM">{t('reasonWrongItem')}</option>
            <option value="ITEM_DAMAGED">{t('reasonDamaged')}</option>
            <option value="ITEM_MISSING">{t('reasonMissing')}</option>
            <option value="EXPECTATION_FAILED">{t('reasonExpectationFailed')}</option>
            <option value="ITEM_FAKE">{t('reasonFake')}</option>
            <option value="CHANGE_MIND">{t('reasonChangeMind')}</option>
            <option value="MUTUAL_AGREE">{t('reasonMutualAgree')}</option>
            <option value="OTHER">{t('reasonOther')}</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('returnDescription')}</label>
          <Textarea
            rows={3}
            value={textReason}
            onChange={(e) => setTextReason(e.target.value)}
            placeholder={t('returnDescriptionPlaceholder')}
            className="w-full"
          />
        </div>

        <EvidencePicker
          key={order.order_sn}
          orderSn={order.order_sn}
          value={evidence}
          onChange={setEvidence}
          disabled={submitting}
          onBusyChange={setEvidenceBusy}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={submitting} disabled={evidenceBusy}>
            {t('submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
