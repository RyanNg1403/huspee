'use client';

import { useRef, useState } from 'react';
import type { ReturnEvidence } from '@huspee/sdk';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { EvidenceImage } from './EvidenceImage';
import { messages } from './messages';

export const buyerEvidenceContent = (id: string) => getApiClient().buyer.returnEvidence.content(id);

export function EvidencePicker({
  orderSn,
  value,
  onChange,
  disabled = false,
  onBusyChange,
}: {
  orderSn: string;
  value: ReturnEvidence[];
  onChange: (photos: ReturnEvidence[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useT(messages);
  const list = useApi(() => getApiClient().buyer.returnEvidence.list(orderSn), [orderSn]);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState('');
  const locked = disabled || busy;
  const photos = [
    ...new Map([...(list.data ?? []), ...value].map((photo) => [photo.evidence_id, photo])).values(),
  ];
  const start = () => {
    working.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
  };
  const finish = () => {
    working.current = false;
    setBusy(false);
    onBusyChange?.(false);
  };
  async function upload(files: File[]) {
    if (working.current || disabled) return;
    if (
      files.some(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 5 * 1024 * 1024 ||
          file.size === 0,
      )
    ) {
      setError(t('invalid'));
      return;
    }
    start();
    try {
      for (const file of files) await getApiClient().buyer.returnEvidence.upload(orderSn, file);
      // Uploading never changes the explicit selection.
    } catch {
      setError(t('failed'));
    } finally {
      list.reload();
      finish();
    }
  }
  async function remove(photo: ReturnEvidence) {
    if (working.current || disabled || photo.return_sn) return;
    start();
    try {
      await getApiClient().buyer.returnEvidence.remove(photo.evidence_id);
      onChange(value.filter((entry) => entry.evidence_id !== photo.evidence_id));
      list.reload();
    } catch {
      setError(t('failed'));
    } finally {
      finish();
    }
  }
  return (
    <section aria-label={t('title')} className="space-y-3 rounded-xl border border-line p-3">
      <h3 className="text-sm font-semibold">{t('title')}</h3>
      <p className="text-xs text-gray-600">{t('review')}</p>
      <p className="text-xs text-gray-500">{t('limits')}</p>
      <label className="block text-sm font-medium">
        {busy ? t('uploading') : t('upload')}
        <input
          aria-label={t('upload')}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={locked || list.loading}
          className="mt-1 block w-full text-xs"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) void upload(files);
          }}
        />
      </label>
      {list.loading && (
        <p role="status" className="text-xs">
          {t('loading')}
        </p>
      )}
      {list.error != null && (
        <div role="alert" className="text-xs text-red-700">
          {t('failed')}{' '}
          <button type="button" onClick={list.reload}>
            {t('retry')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      <p aria-live="polite" className="text-xs font-medium">
        {t('selected', { n: value.length })}
      </p>
      {!list.loading && photos.length === 0 && <p className="text-xs text-gray-500">{t('empty')}</p>}
      <div className="flex flex-wrap gap-4">
        {photos.map((photo, index) => {
          const selected = value.some((entry) => entry.evidence_id === photo.evidence_id);
          return (
            <div key={photo.evidence_id} className="w-28 space-y-2">
              <EvidenceImage
                evidenceId={photo.evidence_id}
                number={index + 1}
                fetchContent={buyerEvidenceContent}
              />
              {photo.return_sn ? (
                <p className="text-xs text-gray-500">{t('attached')}</p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      aria-label={t('select', { n: index + 1 })}
                      checked={selected}
                      disabled={locked}
                      onChange={() => {
                        if (!selected && value.length >= 8) {
                          setError(t('max'));
                          return;
                        }
                        setError('');
                        onChange(
                          selected
                            ? value.filter((entry) => entry.evidence_id !== photo.evidence_id)
                            : [...value, photo],
                        );
                      }}
                    />
                    {t('select', { n: index + 1 })}
                  </label>
                  <button
                    type="button"
                    disabled={locked}
                    aria-label={t('remove', { n: index + 1 })}
                    className="text-xs text-red-700 underline disabled:opacity-50"
                    onClick={() => void remove(photo)}
                  >
                    {t('remove', { n: index + 1 })}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
