'use client';
import { useState } from 'react';
import type { ReturnEvidence } from '@huspee/sdk';
import { EvidencePicker } from '@huspee/web-ui/components/refunds/EvidencePicker';
import { Modal } from '@huspee/web-ui/components/ui';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from '@huspee/web-ui/components/assistant/messages';

export function RefundPhotosDialog({
  conversationId,
  shopId,
  onClose,
  onAttach,
}: {
  conversationId: string;
  shopId: number;
  onClose: () => void;
  onAttach: (orderSn: string, photos: ReturnEvidence[]) => Promise<void>;
}) {
  const t = useT(messages);
  const [page, setPage] = useState(1);
  const selection = useApi(
    () => getApiClient().assistant.returnEvidence.getSelection(conversationId),
    [conversationId],
  );
  const orders = useApi(
    () => getApiClient().buyer.orders.list({ shop_id: shopId, page_size: 50, page }),
    [shopId, page],
  );
  const [draft, setDraft] = useState<{ orderSn: string; photos: ReturnEvidence[] } | null>(null);
  const orderSn = draft?.orderSn ?? selection.data?.order_sn ?? '';
  const photos = draft?.photos ?? selection.data?.evidence ?? [];
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Modal
      open
      onClose={() => {
        if (!saving && !uploading) onClose();
      }}
      title={t('refundPhotos')}
    >
      <div className="space-y-4">
        {(selection.loading || orders.loading) && <p role="status">{t('checking')}</p>}
        {(failed || selection.error != null || orders.error != null) && (
          <p role="alert">
            {t('error')}{' '}
            <button
              type="button"
              onClick={() => {
                selection.reload();
                orders.reload();
              }}
            >
              {t('loadFailed')}
            </button>
          </p>
        )}
        <label className="block text-sm font-medium">
          {t('refundOrder')}
          <select
            aria-label={t('refundOrder')}
            value={orderSn}
            disabled={saving || uploading || selection.loading || orders.loading}
            className="mt-1 w-full rounded-lg border border-line p-2"
            onChange={(event) => setDraft({ orderSn: event.target.value, photos: [] })}
          >
            <option value="">{t('chooseOrder')}</option>
            {orderSn && !orders.data?.data.some((order) => order.order_sn === orderSn) && (
              <option value={orderSn}>{orderSn}</option>
            )}
            {orders.data?.data.map((order) => (
              <option key={order.order_sn} value={order.order_sn}>
                {order.order_sn}
              </option>
            ))}
          </select>
        </label>
        {!orders.loading && orders.data?.data.length === 0 && <p>{t('noOrders')}</p>}
        <div className="flex justify-between gap-2 text-xs">
          <button
            type="button"
            disabled={page <= 1 || orders.loading || saving || uploading}
            onClick={() => setPage((value) => value - 1)}
          >
            {t('previousPage')}
          </button>
          <button
            type="button"
            disabled={!orders.data?.page.has_next || orders.loading || saving || uploading}
            onClick={() => setPage((value) => value + 1)}
          >
            {t('nextPage')}
          </button>
        </div>
        {orderSn && !selection.loading && (
          <EvidencePicker
            key={orderSn}
            orderSn={orderSn}
            value={photos}
            onChange={(value) => setDraft({ orderSn, photos: value })}
            disabled={saving}
            onBusyChange={setUploading}
          />
        )}
        <button
          type="button"
          disabled={
            !orderSn ||
            saving ||
            uploading ||
            selection.loading ||
            selection.error != null ||
            orders.error != null
          }
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => {
            setSaving(true);
            setFailed(false);
            void onAttach(orderSn, photos)
              .catch(() => setFailed(true))
              .finally(() => setSaving(false));
          }}
        >
          {t('attachPhotos')}
        </button>
      </div>
    </Modal>
  );
}
