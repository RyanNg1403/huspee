'use client';

import { useT } from '@huspee/web-ui/i18n/client';
import { FormRow } from '../FormRow';
import { field, input } from '../ui';
import { editorMessages } from './editor-messages';
import type { SectionProps } from './sections';
import type { Channel } from './types';

export function ShippingSection({ draft, update, errors, channels }: SectionProps & { channels: Channel[] }) {
  const t = useT(editorMessages);
  return (
    <>
      <FormRow
        label={t('weight')}
        htmlFor="p-weight"
        required
        error={errors.includes('weight') ? t('errWeight') : undefined}
      >
        <input
          id="p-weight"
          type="number"
          min={0.001}
          step={0.001}
          className={`${input} max-w-40 text-right`}
          value={draft.weight}
          aria-invalid={errors.includes('weight')}
          onChange={(e) => update({ weight: e.target.value })}
        />
      </FormRow>
      <FormRow
        label={t('dimension')}
        required
        error={errors.includes('dimension') ? t('errDimension') : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          {(['length', 'width', 'height'] as const).map((k, i) => (
            <span key={k} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">×</span>}
              <input
                type="number"
                min={1}
                aria-label={t(k)}
                placeholder={t(k)}
                className={`${field} w-24 text-right`}
                value={draft[k]}
                aria-invalid={errors.includes('dimension')}
                onChange={(e) => update({ [k]: e.target.value })}
              />
            </span>
          ))}
        </div>
      </FormRow>
      <FormRow
        label={t('channels')}
        required
        error={errors.includes('logistics') ? t('errLogistics') : undefined}
      >
        <div className="space-y-2 pt-2">
          {channels.map((c) => (
            <label key={c.logistics_channel_id} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={draft.logistics.includes(c.logistics_channel_id)}
                onChange={(e) =>
                  update({
                    logistics: e.target.checked
                      ? [...draft.logistics, c.logistics_channel_id]
                      : draft.logistics.filter((id) => id !== c.logistics_channel_id),
                  })
                }
              />
              {c.logistics_channel_name}
            </label>
          ))}
        </div>
      </FormRow>
    </>
  );
}
