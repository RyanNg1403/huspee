'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorState, Input, Spinner, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';
import { call } from '../../_ops/api';
import { dateTimeLocalToUnix, unixToDateTimeLocal } from '../../_ops/date-utils';
import { ShopGuard } from '../../_ops/ShopGuard';
import { voucherMessages } from '../messages';

interface SimpleItem {
  item_id: number;
  item_name?: string;
}

export default function NewVoucherPage() {
  return <ShopGuard>{(shop) => <NewVoucherContent shopId={shop.shop_id} />}</ShopGuard>;
}

function NewVoucherContent({ shopId }: { shopId: number }) {
  const t = useT(voucherMessages);
  const router = useRouter();
  const toast = useToast();

  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [voucherType, setVoucherType] = useState<1 | 2>(1); // 1: shop, 2: product
  const [rewardType, setRewardType] = useState<1 | 2>(1); // 1: fixed, 2: percentage
  const [discountAmount, setDiscountAmount] = useState<number>(20000);
  const [percentage, setPercentage] = useState<number>(10);
  const [maxPrice, setMaxPrice] = useState<number>(0);
  const [minBasket, setMinBasket] = useState<number>(50000);
  const [usageQuantity, setUsageQuantity] = useState<number>(100);
  const [displayStorefront, setDisplayStorefront] = useState(true);

  // Dates: default start = 1 hour from now, end = 7 days from now
  const [startTime] = useState(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    return unixToDateTimeLocal(nowSec + 3600);
  });
  const [endTime] = useState(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    return unixToDateTimeLocal(nowSec + 7 * 86400);
  });
  const [userStartTime, setUserStartTime] = useState(startTime);
  const [userEndTime, setUserEndTime] = useState(endTime);

  // Product selection for Product Voucher
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);

  const productsApi = useApi(async () => {
    if (voucherType !== 2) return [];
    const res = await call<{ item: { item_id: number }[] }>(shopId, '/product/get_item_list', {
      page_size: 50,
      offset: 0,
      item_status: ['NORMAL', 'UNLIST'],
    });
    const ids = (res.item ?? []).map((i) => i.item_id);
    if (!ids.length) return [];
    const baseRes = await call<{ item_list: SimpleItem[] }>(shopId, '/product/get_item_base_info', {
      item_id_list: ids,
    });
    return baseRes.item_list ?? [];
  }, [shopId, voucherType]);

  const shopItems = productsApi.data ?? [];

  function toggleItemSelection(itemId: number) {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const startUnix = dateTimeLocalToUnix(userStartTime);
    const endUnix = dateTimeLocalToUnix(userEndTime);

    if (endUnix <= startUnix) {
      setErrorMessage(t('endTimeAfterStart'));
      return;
    }

    if (voucherType === 2 && selectedItemIds.length === 0) {
      setErrorMessage(t('productVoucherRequiredHint'));
      return;
    }

    if (rewardType === 1 && minBasket > 0 && discountAmount > minBasket) {
      setErrorMessage(t('discountExceedsMin'));
      return;
    }

    setPending(true);
    try {
      const payload: Record<string, unknown> = {
        voucher_code: code.trim().toUpperCase(),
        voucher_name: name.trim(),
        voucher_type: voucherType,
        reward_type: rewardType,
        min_basket_price: minBasket,
        usage_quantity: usageQuantity,
        start_time: startUnix,
        end_time: endUnix,
        display_channel_list: displayStorefront ? [1] : [],
      };

      if (rewardType === 1) {
        payload.discount_amount = discountAmount;
      } else {
        payload.percentage = percentage;
        if (maxPrice > 0) payload.max_price = maxPrice;
      }

      if (voucherType === 2) {
        payload.item_id_list = selectedItemIds;
      }

      await call(shopId, '/voucher/add_voucher', payload);
      toast(t('createSuccess'));
      router.push('/seller/vouchers');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : t('failed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/seller/vouchers">
          <Button variant="outline" size="sm">
            ← {t('vouchersTitle')}
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{t('newVoucherTitle')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {errorMessage && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>}

        {/* Basic Info */}
        <Card className="space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b pb-2">{t('basicInfo')}</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('code')} *</label>
              <Input
                placeholder="W2OPS10"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={20}
                required
              />
              <p className="mt-1 text-xs text-gray-400">{t('voucherCodeHint')}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('name')} *</label>
              <Input
                placeholder={t('voucherNameHint')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('type')}</label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="voucherType"
                  checked={voucherType === 1}
                  onChange={() => setVoucherType(1)}
                />
                <span>{t('shopVoucher')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="voucherType"
                  checked={voucherType === 2}
                  onChange={() => setVoucherType(2)}
                />
                <span>{t('productVoucher')}</span>
              </label>
            </div>
          </div>

          {/* Product selector if product voucher */}
          {voucherType === 2 && (
            <div className="rounded bg-gray-50 p-3 space-y-2">
              <label className="block text-xs font-semibold text-gray-700">{t('selectProducts')}</label>
              {productsApi.loading ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : productsApi.error ? (
                <ErrorState
                  message={t('failedLoadingProducts')}
                  onRetry={productsApi.reload}
                  retryLabel={t('retry')}
                />
              ) : shopItems.length === 0 ? (
                <p className="text-xs text-gray-400">{t('noProductsInShop')}</p>
              ) : (
                <div className="max-h-48 overflow-y-auto divide-y divide-gray-200">
                  {shopItems.map((item) => (
                    <label
                      key={item.item_id}
                      className="flex items-center gap-2 py-1.5 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedItemIds.includes(item.item_id)}
                        onChange={() => toggleItemSelection(item.item_id)}
                      />
                      <span>{item.item_name || `Item ${item.item_id}`}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Reward Settings */}
        <Card className="space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b pb-2">{t('rewardSettings')}</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('reward')}</label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="rewardType"
                  checked={rewardType === 1}
                  onChange={() => setRewardType(1)}
                />
                <span>{t('fixedAmount')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="rewardType"
                  checked={rewardType === 2}
                  onChange={() => setRewardType(2)}
                />
                <span>{t('percentage')}</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {rewardType === 1 ? (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('discountAmountLabel')} *
                </label>
                <Input
                  type="number"
                  min="1000"
                  step="1000"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  required
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {t('percentageLabel')} *
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    value={percentage}
                    onChange={(e) => setPercentage(Number(e.target.value))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {t('maxPriceLabel')}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('minBasketLabel')} *
              </label>
              <Input
                type="number"
                min="0"
                step="1000"
                value={minBasket}
                onChange={(e) => setMinBasket(Number(e.target.value))}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('usageQuantityLabel')} *
              </label>
              <Input
                type="number"
                min="1"
                max="200000"
                value={usageQuantity}
                onChange={(e) => setUsageQuantity(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('startTimeLabel')} *
              </label>
              <Input
                type="datetime-local"
                value={userStartTime}
                onChange={(e) => setUserStartTime(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('endTimeLabel')} *</label>
              <Input
                type="datetime-local"
                value={userEndTime}
                onChange={(e) => setUserEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="displayStorefront"
              checked={displayStorefront}
              onChange={(e) => setDisplayStorefront(e.target.checked)}
            />
            <label htmlFor="displayStorefront" className="text-sm text-gray-700 cursor-pointer">
              {t('storefrontToggleLabel')}
            </label>
          </div>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Link href="/seller/vouchers">
            <Button variant="ghost" disabled={pending}>
              {t('cancel')}
            </Button>
          </Link>
          <Button variant="primary" type="submit" loading={pending}>
            {t('save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
