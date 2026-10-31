'use client';

import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { FormRow } from '../FormRow';
import { Panel } from '../Panel';
import { input } from '../ui';
import { editorMessages } from './editor-messages';
import type { SectionProps } from './sections';
import type { Attribute, Brand } from './types';

const localized = (
  list: Array<{ language: string; value: string }> | undefined,
  lang: string,
  fallback: string,
) => list?.find((x) => x.language === lang)?.value ?? fallback;

/** Brand and category attributes, split by what was empty when the page loaded. */
export function SpecsSection({
  draft,
  update,
  errors,
  brands,
  attributes,
  savedAttributes,
  savedBrandId,
}: SectionProps & {
  brands: Brand[];
  attributes: Attribute[];
  savedAttributes: Record<number, string>;
  savedBrandId: number;
}) {
  const t = useT(editorMessages);
  const { lang } = useLang();
  const missing = (a: Attribute) => a.mandatory && !draft.attributes[a.attribute_id]?.trim();
  const brandRow = (
    <FormRow key="brand" label={t('brand')} htmlFor="spec-brand">
      <select
        id="spec-brand"
        className={`${input} max-w-sm`}
        value={draft.brandId}
        onChange={(e) => update({ brandId: Number(e.target.value) })}
      >
        <option value={0}>{t('noBrand')}</option>
        {brands.map((b) => (
          <option key={b.brand_id} value={b.brand_id}>
            {b.display_brand_name}
          </option>
        ))}
      </select>
    </FormRow>
  );
  const row = (a: Attribute) => {
    const id = `spec-${a.attribute_id}`;
    const value = draft.attributes[a.attribute_id] ?? '';
    const set = (v: string) => update({ attributes: { ...draft.attributes, [a.attribute_id]: v } });
    return (
      <FormRow
        key={a.attribute_id}
        label={localized(a.multi_lang, lang, a.name)}
        htmlFor={id}
        required={a.mandatory}
        error={errors.includes('attributes') && missing(a) ? t('errAttributes') : undefined}
      >
        {a.attribute_info.input_type === 2 ? (
          <input
            id={id}
            className={`${input} max-w-sm`}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
        ) : (
          <select id={id} className={`${input} max-w-sm`} value={value} onChange={(e) => set(e.target.value)}>
            <option value="">{t('choose')}</option>
            {a.attribute_value_list.map((v) => (
              <option key={v.value_id} value={v.value_id}>
                {localized(v.multi_lang, lang, v.name)}
              </option>
            ))}
          </select>
        )}
      </FormRow>
    );
  };
  const empty = attributes.filter((a) => !savedAttributes[a.attribute_id]);
  const filled = attributes.filter((a) => savedAttributes[a.attribute_id]);
  const groups = [
    { key: 'empty', title: t('specsEmpty'), rows: [...(savedBrandId ? [] : [brandRow]), ...empty.map(row)] },
    {
      key: 'filled',
      title: t('specsFilled'),
      rows: [...(savedBrandId ? [brandRow] : []), ...filled.map(row)],
    },
  ].filter((g) => g.rows.length);
  return (
    <>
      {groups.map((g) => (
        <Panel
          key={g.key}
          title={
            <>
              {g.title}
              <span className="ml-2 text-[13px] font-normal text-muted">
                {t('specCount', { count: g.rows.length })}
              </span>
            </>
          }
        >
          {g.rows}
        </Panel>
      ))}
      {!attributes.length && (
        <Panel>
          <p className="text-sm text-muted">{t('noSpecs')}</p>
        </Panel>
      )}
    </>
  );
}
