'use client';

import Image from 'next/image';
import { useState, type ChangeEvent } from 'react';
import { Spinner } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { ActionError } from '../errors';
import { FormRow } from '../FormRow';
import { input, textarea } from '../ui';
import { editorMessages } from './editor-messages';
import type { SectionProps } from './sections';
import type { Category } from './types';

const MAX_IMAGES = 9;

export function BasicSection({
  draft,
  update,
  errors,
  shopId,
  categories,
}: SectionProps & { shopId: number; categories: Category[] }) {
  const t = useT(editorMessages);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const leaves = categories.filter((c) => !c.has_children);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await getApiClient().seller.shopee.uploadImage(shopId, file, file.name);
      if (res.error || !res.response) throw new Error(res.message);
      const info = res.response.image_info;
      update({
        images: [...draft.images, { id: info.image_id, url: info.image_url_list[0]?.image_url ?? '' }],
      });
    } catch (err) {
      setUploadError(err);
    } finally {
      setUploading(false);
    }
  }

  function move(index: number) {
    const next = [...draft.images];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    update({ images: next });
  }

  return (
    <>
      <FormRow label={t('images')} required error={errors.includes('images') ? t('errImages') : undefined}>
        <div className="flex flex-wrap gap-3">
          {draft.images.map((img, i) => (
            <div
              key={img.id}
              className="group relative h-20 w-20 overflow-hidden rounded-[2px] border border-line"
            >
              {img.url ? (
                <Image
                  src={img.url}
                  alt=""
                  width={80}
                  height={80}
                  unoptimized
                  className="h-20 w-20 object-cover"
                />
              ) : (
                <span className="block h-20 w-20 bg-gray-100" />
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gray-900/60 text-white">
                <button
                  type="button"
                  className="px-2 py-0.5 disabled:opacity-0"
                  aria-label={t('moveLeft', { index: i + 1 })}
                  disabled={i === 0}
                  onClick={() => move(i)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="px-2 py-0.5"
                  aria-label={t('removeImage', { index: i + 1 })}
                  onClick={() => update({ images: draft.images.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {draft.images.length < MAX_IMAGES && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[2px] border border-dashed border-gray-400 text-[13px] text-link hover:border-link focus-within:outline-2 focus-within:outline-primary">
              {uploading ? (
                <Spinner />
              ) : (
                <span aria-hidden="true" className="text-xl leading-none">
                  +
                </span>
              )}
              {t('upload')}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={upload}
              />
            </label>
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-muted">{t('imageCount', { count: draft.images.length })}</p>
        <div className="mt-2">
          <ActionError error={uploadError} />
        </div>
      </FormRow>
      <FormRow
        label={t('name')}
        htmlFor="p-name"
        required
        error={errors.includes('name') ? t('errName') : undefined}
      >
        <div className="relative">
          <input
            id="p-name"
            className={`${input} pr-16`}
            maxLength={120}
            value={draft.name}
            aria-invalid={errors.includes('name')}
            onChange={(e) => update({ name: e.target.value })}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-muted">
            {draft.name.length}/120
          </span>
        </div>
      </FormRow>
      <FormRow
        label={t('description')}
        htmlFor="p-description"
        required
        error={errors.includes('description') ? t('errDescription') : undefined}
      >
        <textarea
          id="p-description"
          className={`${textarea} min-h-40`}
          maxLength={5000}
          value={draft.description}
          aria-invalid={errors.includes('description')}
          onChange={(e) => update({ description: e.target.value })}
        />
      </FormRow>
      <FormRow label={t('itemSku')} htmlFor="p-sku">
        <input
          id="p-sku"
          className={`${input} max-w-xs`}
          maxLength={100}
          value={draft.sku}
          onChange={(e) => update({ sku: e.target.value })}
        />
      </FormRow>
      <FormRow
        label={t('category')}
        htmlFor="p-category"
        required
        error={errors.includes('category') ? t('errCategory') : undefined}
      >
        <select
          id="p-category"
          className={`${input} max-w-sm`}
          value={draft.categoryId}
          aria-invalid={errors.includes('category')}
          onChange={(e) => update({ categoryId: Number(e.target.value), brandId: 0, attributes: {} })}
        >
          <option value={0}>{t('choose')}</option>
          {leaves.map((c) => (
            <option key={c.category_id} value={c.category_id}>
              {c.display_category_name}
            </option>
          ))}
        </select>
      </FormRow>
    </>
  );
}
