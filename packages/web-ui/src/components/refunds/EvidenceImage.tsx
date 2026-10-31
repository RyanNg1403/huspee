'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from './messages';

export type EvidenceFetcher = (id: string) => Promise<Blob>;

/** Private bytes are fetched by the caller's session surface, never by an image optimizer. */
export function EvidenceImage({
  evidenceId,
  number,
  fetchContent,
}: {
  evidenceId: string;
  number: number;
  fetchContent: EvidenceFetcher;
}) {
  const t = useT(messages);
  const [image, setImage] = useState<{
    id: string;
    fetcher: EvidenceFetcher;
    url?: string;
    error?: boolean;
  }>();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    void fetchContent(evidenceId)
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ id: evidenceId, fetcher: fetchContent, url: objectUrl });
      })
      .catch(() => {
        if (!disposed) setImage({ id: evidenceId, fetcher: fetchContent, error: true });
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidenceId, fetchContent]);
  const current = image?.id === evidenceId && image.fetcher === fetchContent ? image : undefined;
  const alt = t('photo', { n: number });
  return (
    <div className="space-y-1">
      {current?.url && !current.error ? (
        <>
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            aria-label={t('enlarge', { n: number })}
            className="block rounded-lg border border-line focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Image
              unoptimized
              src={current.url}
              alt={alt}
              width={112}
              height={112}
              className="h-24 w-24 rounded-lg object-cover"
              onError={() => setImage({ ...current, error: true })}
            />
          </button>
          <dialog
            ref={dialog}
            aria-label={alt}
            className="m-auto max-h-[90vh] max-w-[95vw] rounded-xl bg-white p-4 backdrop:bg-black/60"
          >
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="mb-3 rounded border px-3 py-2 text-sm"
            >
              {t('close')}
            </button>
            <Image
              unoptimized
              src={current.url}
              alt={alt}
              width={1200}
              height={1200}
              className="h-[70vh] w-[80vw] object-contain"
            />
          </dialog>
        </>
      ) : (
        <p
          role={current?.error ? 'alert' : 'status'}
          className="flex h-24 w-24 items-center justify-center rounded-lg bg-gray-100 p-2 text-center text-xs text-gray-500"
        >
          {current?.error ? t('error') : t('loading')}
        </p>
      )}
      <p className="text-xs text-gray-600">{alt}</p>
    </div>
  );
}
