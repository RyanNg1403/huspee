import { fromDateTimeLocal, toDateTimeLocal, voucherState, type VoucherState } from './voucher-filters';

export const REWARD_FIXED = 1;
export const REWARD_PERCENT = 2;
export const VOUCHER_SHOP = 1;
export const VOUCHER_PRODUCT = 2;
const MAX_DAYS = 180;

export type VoucherDetail = {
  voucher_id: number;
  voucher_code: string;
  voucher_name: string;
  voucher_type: number;
  reward_type: number;
  usage_quantity: number;
  current_usage: number;
  start_time: number;
  end_time: number;
  discount_amount: number;
  percentage: number;
  max_price: number;
  min_basket_price: number;
  display_channel_list: number[];
  item_id_list: number[];
};

/** Every value is kept as typed (digit strings for amounts) until submit. */
export type VoucherForm = {
  voucherType: number;
  name: string;
  code: string;
  start: string;
  end: string;
  rewardType: number;
  amount: string;
  percentage: string;
  limited: boolean;
  maxPrice: string;
  minBasket: string;
  usage: string;
  display: boolean;
  itemIds: number[];
};

export type VoucherField =
  | 'name'
  | 'code'
  | 'period'
  | 'reward'
  | 'maxPrice'
  | 'minBasket'
  | 'usage'
  | 'items';

/** New form, or a copy of an existing voucher with a fresh code and period. */
export function initialForm(nowSec: number, source?: VoucherDetail, keepIdentity = false): VoucherForm {
  const start = keepIdentity && source ? source.start_time : Math.ceil((nowSec + 3600) / 300) * 300;
  const end = keepIdentity && source ? source.end_time : start + 7 * 86400;
  return {
    voucherType: source?.voucher_type ?? VOUCHER_SHOP,
    name: source?.voucher_name ?? '',
    code: keepIdentity && source ? source.voucher_code : '',
    start: toDateTimeLocal(start),
    end: toDateTimeLocal(end),
    rewardType: source?.reward_type ?? REWARD_FIXED,
    amount: source?.discount_amount ? String(source.discount_amount) : '',
    percentage: source?.percentage ? String(source.percentage) : '',
    limited: source ? source.max_price > 0 : true,
    maxPrice: source?.max_price ? String(source.max_price) : '',
    minBasket: source ? String(source.min_basket_price) : '',
    usage: source ? String(source.usage_quantity) : '',
    display: source ? source.display_channel_list.includes(1) : true,
    itemIds: source?.item_id_list ?? [],
  };
}

/** Which fields an existing voucher still accepts (the API locks most of an ongoing voucher). */
export function editableFields(state: VoucherState | null): Set<VoucherField | 'display' | 'type'> {
  if (state === null)
    return new Set([
      'name',
      'code',
      'period',
      'reward',
      'maxPrice',
      'minBasket',
      'usage',
      'items',
      'display',
      'type',
    ]);
  if (state === 'upcoming')
    return new Set(['name', 'period', 'reward', 'maxPrice', 'minBasket', 'usage', 'items', 'display']);
  if (state === 'ongoing') return new Set(['name', 'period', 'usage', 'display']);
  return new Set();
}

export function validateVoucher(
  form: VoucherForm,
  original: VoucherDetail | null,
  nowSec: number,
): VoucherField[] {
  const errors: VoucherField[] = [];
  const num = (v: string) => (v === '' ? NaN : Number(v));
  const start = fromDateTimeLocal(form.start, original?.start_time);
  const end = fromDateTimeLocal(form.end, original?.end_time);
  const state = original ? voucherState(original.start_time, original.end_time, nowSec) : null;
  if (!form.name.trim() || form.name.trim().length > 100) errors.push('name');
  if (!original && !/^[A-Za-z0-9]{1,20}$/.test(form.code.trim())) errors.push('code');
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > MAX_DAYS * 86400 ||
    end <= nowSec ||
    (state !== 'ongoing' && start < nowSec - 60)
  )
    errors.push('period');
  const minBasket = num(form.minBasket);
  if (!(minBasket >= 0)) errors.push('minBasket');
  if (form.rewardType === REWARD_FIXED) {
    const amount = num(form.amount);
    if (!(amount > 0) || (minBasket > 0 && amount > minBasket)) errors.push('reward');
  } else {
    const pct = num(form.percentage);
    if (!Number.isInteger(pct) || pct < 1 || pct > 99) errors.push('reward');
    if (form.limited && !(num(form.maxPrice) > 0)) errors.push('maxPrice');
  }
  const usage = num(form.usage);
  if (
    !Number.isInteger(usage) ||
    usage < Math.max(1, state === 'ongoing' ? original!.usage_quantity : 1) ||
    usage > 200000
  )
    errors.push('usage');
  if (form.voucherType === VOUCHER_PRODUCT && !form.itemIds.length) errors.push('items');
  return errors;
}

/** add_voucher body, or update_voucher body limited to what the voucher state allows. */
export function voucherPayload(
  form: VoucherForm,
  original: VoucherDetail | null,
  nowSec: number,
): Record<string, unknown> {
  const start = fromDateTimeLocal(form.start, original?.start_time);
  const end = fromDateTimeLocal(form.end, original?.end_time);
  const reward =
    form.rewardType === REWARD_FIXED
      ? { discount_amount: Number(form.amount) }
      : {
          percentage: Number(form.percentage),
          ...(form.limited ? { max_price: Number(form.maxPrice) } : {}),
        };
  const base = {
    voucher_name: form.name.trim(),
    end_time: end,
    usage_quantity: Number(form.usage),
    display_channel_list: form.display ? [1] : [],
  };
  if (!original) {
    return {
      ...base,
      ...reward,
      voucher_code: form.code.trim().toUpperCase(),
      voucher_type: form.voucherType,
      reward_type: form.rewardType,
      start_time: start,
      min_basket_price: Number(form.minBasket),
      ...(form.voucherType === VOUCHER_PRODUCT ? { item_id_list: form.itemIds } : {}),
    };
  }
  if (voucherState(original.start_time, original.end_time, nowSec) === 'ongoing') {
    return { voucher_id: original.voucher_id, ...base };
  }
  return {
    voucher_id: original.voucher_id,
    ...base,
    ...reward,
    start_time: start,
    min_basket_price: Number(form.minBasket),
    ...(form.voucherType === VOUCHER_PRODUCT ? { item_id_list: form.itemIds } : {}),
  };
}
