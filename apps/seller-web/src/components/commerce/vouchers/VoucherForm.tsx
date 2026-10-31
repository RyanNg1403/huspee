'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Spinner, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { call } from '@/lib/seller-api';
import { ActionError } from '../errors';
import { formatDay } from '../format';
import { FormRow } from '../FormRow';
import { MoneyInput } from '../MoneyInput';
import { Panel } from '../Panel';
import { Thumb } from '../Thumb';
import { btn, field, input } from '../ui';
import { voucherFormMessages } from './messages';
import { loadVoucherItems } from './voucher-api';
import { fromDateTimeLocal, voucherBadge, voucherState } from './voucher-filters';
import {
  editableFields,
  initialForm,
  REWARD_FIXED,
  REWARD_PERCENT,
  validateVoucher,
  VOUCHER_PRODUCT,
  VOUCHER_SHOP,
  voucherPayload,
  type VoucherDetail,
  type VoucherField,
  type VoucherForm as Form,
} from './voucher-form';

const choice = (selected: boolean, disabled: boolean) =>
  `flex h-10 items-center gap-2.5 rounded-[4px] border px-4 text-sm ${
    selected ? 'border-primary text-primary' : 'border-line-strong'
  } ${disabled ? 'opacity-60' : 'cursor-pointer'}`;

/** S6.2: create, copy (source without id) or edit (original) a shop voucher. */
export function VoucherForm({
  shopId,
  original,
  source,
}: {
  shopId: number;
  original?: VoucherDetail;
  source?: VoucherDetail;
}) {
  const t = useT(voucherFormMessages);
  const { lang } = useLang();
  const toast = useToast();
  const router = useRouter();
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const [form, setForm] = useState<Form>(() => initialForm(now, original ?? source, Boolean(original)));
  const [errors, setErrors] = useState<VoucherField[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const items = useApi(() => loadVoucherItems(shopId), [shopId]);
  const state = original ? voucherState(original.start_time, original.end_time, now) : null;
  const can = editableFields(state);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const err = (key: VoucherField, message: Parameters<typeof t>[0]) =>
    errors.includes(key) ? t(message) : undefined;
  const percent = form.rewardType === REWARD_PERCENT;

  async function submit() {
    const invalid = validateVoucher(form, original ?? null, Math.floor(Date.now() / 1000));
    setErrors(invalid);
    if (invalid.length) return;
    setPending(true);
    setError(null);
    try {
      const payload = voucherPayload(form, original ?? null, Math.floor(Date.now() / 1000));
      await call(shopId, original ? '/voucher/update_voucher' : '/voucher/add_voucher', payload);
      const code = original?.voucher_code ?? form.code.trim().toUpperCase();
      toast(t(original ? 'saved' : 'created', { code }));
      router.push('/vouchers');
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const max = percent && form.limited && form.maxPrice ? formatVnd(Number(form.maxPrice)) : '';
  const previewTitle = percent
    ? max
      ? t('previewTitlePercentMax', { pct: form.percentage || 0, max })
      : t('previewTitlePercent', { pct: form.percentage || 0 })
    : t('previewTitleAmount', { amount: formatVnd(Number(form.amount || 0)) });
  const end = fromDateTimeLocal(form.end);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21.25rem]">
      <div className="min-w-0 space-y-4">
        <Panel title={t('basic')}>
          <FormRow label={t('type')}>
            <div className="flex flex-wrap gap-3">
              {[
                { value: VOUCHER_SHOP, label: t('shopVoucher') },
                { value: VOUCHER_PRODUCT, label: t('productVoucher') },
              ].map((o) => (
                <label key={o.value} className={choice(form.voucherType === o.value, !can.has('type'))}>
                  <input
                    type="radio"
                    name="voucher-type"
                    disabled={!can.has('type')}
                    checked={form.voucherType === o.value}
                    onChange={() => set({ voucherType: o.value })}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </FormRow>
          <FormRow label={t('name')} htmlFor="v-name" required error={err('name', 'errName')}>
            <div className="relative max-w-xl">
              <input
                id="v-name"
                className={`${input} pr-16`}
                maxLength={100}
                disabled={!can.has('name')}
                aria-invalid={errors.includes('name')}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-muted">
                {form.name.length}/100
              </span>
            </div>
          </FormRow>
          <FormRow label={t('code')} htmlFor="v-code" required error={err('code', 'errCode')}>
            <input
              id="v-code"
              className={`${input} max-w-56 uppercase`}
              maxLength={20}
              disabled={!can.has('code')}
              aria-invalid={errors.includes('code')}
              value={form.code}
              onChange={(e) => set({ code: e.target.value.replace(/[^A-Za-z0-9]/g, '') })}
            />
          </FormRow>
          <FormRow label={t('period')} required error={err('period', 'errPeriod')}>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="datetime-local"
                aria-label={t('start')}
                className={`${field} w-48`}
                disabled={!can.has('period') || state === 'ongoing'}
                aria-invalid={errors.includes('period')}
                value={form.start}
                onChange={(e) => set({ start: e.target.value })}
              />
              <span aria-hidden="true">—</span>
              <input
                type="datetime-local"
                aria-label={t('end')}
                className={`${field} w-48`}
                disabled={!can.has('period')}
                aria-invalid={errors.includes('period')}
                value={form.end}
                onChange={(e) => set({ end: e.target.value })}
              />
              <span className="text-[13px] text-muted">{t('timezone')}</span>
            </div>
          </FormRow>
        </Panel>
        <Panel title={t('reward')}>
          <FormRow label={t('rewardType')} required error={err('reward', 'errReward')}>
            <div className="flex flex-wrap gap-3">
              <select
                aria-label={t('rewardType')}
                className={`${field} w-40`}
                disabled={!can.has('type')}
                value={form.rewardType}
                onChange={(e) => set({ rewardType: Number(e.target.value) })}
              >
                <option value={REWARD_FIXED}>{t('byAmount')}</option>
                <option value={REWARD_PERCENT}>{t('byPercent')}</option>
              </select>
              {percent ? (
                <div className="relative w-48">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={t('amount')}
                    className={`${input} pr-20`}
                    disabled={!can.has('reward')}
                    aria-invalid={errors.includes('reward')}
                    value={form.percentage}
                    onChange={(e) => set({ percentage: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 border-l border-line pl-3 text-[13px] text-muted">
                    {t('percentOff')}
                  </span>
                </div>
              ) : (
                <MoneyInput
                  className="w-52"
                  label={t('amount')}
                  disabled={!can.has('reward')}
                  invalid={errors.includes('reward')}
                  value={form.amount}
                  onChange={(amount) => set({ amount })}
                />
              )}
            </div>
          </FormRow>
          {percent && (
            <FormRow label={t('maxDiscount')} required error={err('maxPrice', 'errMaxPrice')}>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="max-mode"
                    disabled={!can.has('maxPrice')}
                    checked={form.limited}
                    onChange={() => set({ limited: true })}
                  />
                  {t('limited')}
                </label>
                <MoneyInput
                  className="w-52"
                  label={t('maxDiscount')}
                  disabled={!can.has('maxPrice') || !form.limited}
                  invalid={errors.includes('maxPrice')}
                  value={form.maxPrice}
                  onChange={(maxPrice) => set({ maxPrice })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="max-mode"
                    disabled={!can.has('maxPrice') || Boolean(original?.max_price)}
                    checked={!form.limited}
                    onChange={() => set({ limited: false })}
                  />
                  {t('unlimited')}
                </label>
              </div>
            </FormRow>
          )}
          <FormRow label={t('minBasket')} required error={err('minBasket', 'errMinBasket')}>
            <MoneyInput
              className="max-w-60"
              label={t('minBasket')}
              disabled={!can.has('minBasket')}
              invalid={errors.includes('minBasket')}
              value={form.minBasket}
              onChange={(minBasket) => set({ minBasket })}
            />
          </FormRow>
          <FormRow label={t('usage')} htmlFor="v-usage" required error={err('usage', 'errUsage')}>
            <input
              id="v-usage"
              type="text"
              inputMode="numeric"
              className={`${input} max-w-60`}
              disabled={!can.has('usage')}
              aria-invalid={errors.includes('usage')}
              value={form.usage}
              onChange={(e) => set({ usage: e.target.value.replace(/\D/g, '') })}
            />
          </FormRow>
        </Panel>
        <Panel title={t('apply')}>
          <FormRow label={t('display')}>
            <label className="flex items-center gap-2.5 pt-2 text-sm">
              <input
                type="checkbox"
                disabled={!can.has('display')}
                checked={form.display}
                onChange={(e) => set({ display: e.target.checked })}
              />
              {t('displayShop')}
            </label>
          </FormRow>
          <FormRow label={t('products')} error={err('items', 'errItems')}>
            {items.loading ? (
              <Spinner />
            ) : items.error ? (
              <ActionError error={items.error} />
            ) : form.voucherType === VOUCHER_SHOP ? (
              <p className="pt-2 text-sm">{t('allProducts', { count: items.data?.liveCount ?? 0 })}</p>
            ) : (
              <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto rounded-[4px] border border-line">
                {(items.data?.items ?? []).map((item) => (
                  <li key={item.item_id}>
                    <label className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={!can.has('items')}
                        checked={form.itemIds.includes(item.item_id)}
                        onChange={(e) =>
                          set({
                            itemIds: e.target.checked
                              ? [...form.itemIds, item.item_id]
                              : form.itemIds.filter((id) => id !== item.item_id),
                          })
                        }
                      />
                      <Thumb src={item.image.image_url_list[0]} size={32} />
                      <span className="line-clamp-1">{item.item_name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </FormRow>
        </Panel>
        <ActionError error={error} />
        <div className="flex justify-end gap-3">
          <Link href="/vouchers" className={btn.outline}>
            {t('cancel')}
          </Link>
          {state !== 'expired' && (
            <button
              type="button"
              className={`${btn.primary} min-w-28`}
              disabled={pending}
              onClick={() => void submit()}
            >
              {pending && <Spinner />}
              {original ? t('save') : t('confirm')}
            </button>
          )}
        </div>
      </div>
      <Panel title={t('preview')} className="self-start">
        <p className="mb-2 text-[13px] text-muted">{t('previewShop')}</p>
        <div className="flex overflow-hidden rounded-[4px] border border-primary/40">
          <span className="flex w-18 shrink-0 items-center justify-center bg-primary px-2 text-base font-semibold text-white">
            {voucherBadge(form.rewardType, Number(form.amount || 0), Number(form.percentage || 0))}
          </span>
          <div className="min-w-0 flex-1 bg-primary-soft/50 px-3 py-2.5 text-[13px]">
            <p className="text-sm font-semibold">{form.name.trim() || previewTitle}</p>
            {form.name.trim() && <p>{previewTitle}</p>}
            <p className="text-muted">
              {t('previewMin', { amount: formatVnd(Number(form.minBasket || 0)) })}
            </p>
            {Number.isFinite(end) && (
              <p className="text-muted">{t('previewEnd', { date: formatDay(end, lang) })}</p>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
