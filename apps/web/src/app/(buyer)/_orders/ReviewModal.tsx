'use client';

import { useState } from 'react';
import { Button, Modal, Textarea, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { messages } from './messages';
import { getErrorMessage } from './shared';

export function ReviewModal({
  open,
  orderSn,
  itemId,
  modelId,
  itemName,
  onClose,
  onSuccess,
}: {
  open: boolean;
  orderSn: string;
  itemId: number;
  modelId?: number;
  itemName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT(messages);
  const tCommon = useT(common);
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await getApiClient().buyer.orders.review(orderSn, {
        item_id: itemId,
        model_id: modelId,
        rating,
        comment,
      });
      toast(t('reviewSuccess'));
      onSuccess();
      onClose();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('reviewModalTitle')}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="border-b pb-3">
          <p className="font-medium text-gray-800 line-clamp-2">{itemName}</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">{t('ratingLabel')}</label>
          <div className="flex gap-2 text-2xl">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                onClick={() => setRating(star)}
                className={`transition-colors ${star <= rating ? 'text-amber-500' : 'text-gray-300'}`}
                aria-label={t('starRating', { count: star })}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('commentLabel')}</label>
          <Textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('commentPlaceholder')}
            className="w-full"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={submitting}>
            {t('submitReview')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
