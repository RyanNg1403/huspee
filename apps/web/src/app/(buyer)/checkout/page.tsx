'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Address, CheckoutQuote, PaymentMethod } from '@huspee/sdk';
import { RequireRole } from '@/components/session';
import { Button, Input, QueryState, Select, Spinner, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { AddressModal } from '../_orders/AddressModal';
import { messages } from '../_orders/messages';
import { formatIssue, getErrorMessage, panel } from '../_orders/shared';

function CheckoutView() {
  const t = useT(messages);
  const tCommon = useT(common);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const itemsParam = searchParams.get('items');
  const cartItemIds = useMemo(() => {
    if (!itemsParam) return [];
    return itemsParam
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
  }, [itemsParam]);

  // Addresses
  const {
    data: addressList,
    loading: addressLoading,
    error: addressError,
    reload: reloadAddresses,
  } = useApi<Address[]>(() => getApiClient().buyer.addresses.list(), []);

  const [customAddressId, setCustomAddressId] = useState<number | null>(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);

  const selectedAddress = useMemo(() => {
    if (!addressList || addressList.length === 0) return null;
    if (customAddressId !== null) {
      const found = addressList.find((a) => a.address_id === customAddressId);
      if (found) return found;
    }
    return addressList.find((a) => a.is_default) ?? addressList[0];
  }, [addressList, customAddressId]);

  const selectedAddressId = selectedAddress?.address_id ?? null;

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');

  // Per shop shipping & voucher state: shopId -> { logistics_channel_id, voucher_code, message_to_seller }
  const [shopSettings, setShopSettings] = useState<
    Record<
      number,
      {
        logistics_channel_id?: number;
        voucher_code?: string;
        message_to_seller?: string;
      }
    >
  >({});

  // Temporary voucher input state per shop
  const [voucherInputs, setVoucherInputs] = useState<Record<number, string>>({});

  // Quote preview state via useApi
  const cartItemsKey = cartItemIds.join(',');
  const shopSettingsKey = JSON.stringify(shopSettings);

  const {
    data: quote,
    loading: quoteLoading,
    error: quoteError,
    reload: reloadQuote,
  } = useApi<CheckoutQuote | null>(async () => {
    if (cartItemIds.length === 0) return null;
    const shopsPayload = Object.entries(shopSettings).map(([shopId, conf]) => ({
      shop_id: parseInt(shopId, 10),
      logistics_channel_id: conf.logistics_channel_id,
      voucher_code: conf.voucher_code,
      message_to_seller: conf.message_to_seller,
    }));

    return getApiClient().checkout.preview({
      address_id: selectedAddressId ?? undefined,
      payment_method: paymentMethod,
      cart_item_ids: cartItemIds,
      shops: shopsPayload.length > 0 ? shopsPayload : undefined,
    });
  }, [cartItemsKey, selectedAddressId, paymentMethod, shopSettingsKey]);

  // Idempotency key generated ONCE per checkout attempt (reused on retry)
  const [idempotencyKey] = useState(() => `chk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`);
  const [placing, setPlacing] = useState(false);

  const handleApplyVoucher = (shopId: number) => {
    const code = (voucherInputs[shopId] ?? '').trim();
    setShopSettings((prev) => ({
      ...prev,
      [shopId]: {
        ...prev[shopId],
        voucher_code: code || undefined,
      },
    }));
  };

  const handleChannelChange = (shopId: number, channelId: number) => {
    setShopSettings((prev) => ({
      ...prev,
      [shopId]: {
        ...prev[shopId],
        logistics_channel_id: channelId,
      },
    }));
  };

  const handleMessageChange = (shopId: number, msg: string) => {
    setShopSettings((prev) => ({
      ...prev,
      [shopId]: {
        ...prev[shopId],
        message_to_seller: msg,
      },
    }));
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      toast(t('noAddress'));
      return;
    }
    if (!quote?.can_checkout) {
      return;
    }

    setPlacing(true);
    try {
      const shopsPayload = Object.entries(shopSettings).map(([shopId, conf]) => ({
        shop_id: parseInt(shopId, 10),
        logistics_channel_id: conf.logistics_channel_id,
        voucher_code: conf.voucher_code,
        message_to_seller: conf.message_to_seller,
      }));

      const result = await getApiClient().checkout.placeOrder(
        {
          address_id: selectedAddressId,
          payment_method: paymentMethod,
          cart_item_ids: cartItemIds,
          shops: shopsPayload.length > 0 ? shopsPayload : undefined,
        },
        { idempotencyKey },
      );

      window.dispatchEvent(new Event('huspee:cart-changed'));
      router.push(`/checkout/success?orders=${encodeURIComponent(result.order_sn_list.join(','))}`);
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setPlacing(false);
    }
  };

  if (cartItemIds.length === 0) {
    return (
      <div className={`${panel} py-12 text-center`}>
        <div className="mb-4 text-4xl">⚠️</div>
        <h2 className="mb-2 text-xl font-semibold text-gray-800">{t('noItemsSelected')}</h2>
        <Link href="/cart">
          <Button>{t('backToCart')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Address Block */}
      <div className={`${panel} border-t-4 border-primary`}>
        <div className="flex items-center justify-between pb-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-primary">
            <span>📍</span>
            <span>{t('shippingAddress')}</span>
          </h2>
          <Button variant="outline" size="sm" onClick={() => setAddressModalOpen(true)}>
            {selectedAddress ? t('changeAddress') : t('addAddress')}
          </Button>
        </div>

        {addressLoading ? (
          <Spinner />
        ) : addressError ? (
          <QueryState loading={false} error={addressError} retry={reloadAddresses} />
        ) : selectedAddress ? (
          <div className="space-y-1 text-sm text-gray-800">
            <div className="font-semibold">
              {selectedAddress.name} ({selectedAddress.phone})
            </div>
            <div>
              {selectedAddress.address}, {selectedAddress.district}, {selectedAddress.city},{' '}
              {selectedAddress.state}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">{t('noAddress')}</div>
        )}

        {/* Change Address dropdown if multiple addresses exist */}
        {addressList && addressList.length > 1 && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">{t('changeAddress')}:</label>
            <Select
              value={selectedAddressId ?? ''}
              onChange={(e) => setCustomAddressId(parseInt(e.target.value, 10))}
              className="w-full text-xs"
            >
              {addressList.map((addr) => (
                <option key={addr.address_id} value={addr.address_id}>
                  {addr.name} - {addr.phone} - {addr.address}, {addr.city}
                  {addr.is_default ? ` (${t('defaultBadge')})` : ''}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Quote Groups / Shop Items */}
      {quoteLoading && !quote ? (
        <QueryState loading={true} error={null} retry={reloadQuote} />
      ) : quoteError ? (
        <QueryState loading={false} error={quoteError} retry={reloadQuote} />
      ) : quote ? (
        quote.groups.map((group) => {
          return (
            <div key={group.shop_id} className={`${panel} p-0 overflow-hidden`}>
              {/* Shop Header */}
              <div className="border-b bg-gray-50/70 px-4 py-3 font-semibold text-gray-800 flex items-center gap-2">
                <span>🏪</span>
                <span>{group.shop_name}</span>
              </div>

              {/* Items */}
              <div className="divide-y p-4">
                {group.lines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded border bg-orange-50 text-xs font-bold text-primary">
                      🛍️
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="line-clamp-2 text-sm font-medium text-gray-800">{line.item_name}</div>
                      {line.model_name && (
                        <div className="text-xs text-gray-500">
                          {t('productVariant')}: {line.model_name}
                        </div>
                      )}
                      {line.issue && <div className="text-xs font-semibold text-red-600">{line.issue}</div>}
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium text-gray-900">{formatVnd(line.unit_price)}</div>
                      <div className="text-xs text-gray-500">x{line.quantity}</div>
                      <div className="font-semibold text-primary">{formatVnd(line.line_total)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Shipping & Voucher row */}
              <div className="border-t bg-gray-50/40 p-4 space-y-4">
                {/* Shipping Option */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                  <div className="text-sm font-medium text-gray-700">{t('shippingMethod')}:</div>
                  <div className="flex flex-col sm:items-end gap-1">
                    {group.shipping_options.length > 0 ? (
                      <Select
                        value={group.logistics_channel_id ?? ''}
                        onChange={(e) => handleChannelChange(group.shop_id, parseInt(e.target.value, 10))}
                        className="text-xs sm:w-72"
                      >
                        {group.shipping_options.map((opt) => (
                          <option key={opt.logistics_channel_id} value={opt.logistics_channel_id}>
                            {opt.logistics_channel_name} - {formatVnd(opt.shipping_fee)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-xs text-red-500">{t('empty')}</span>
                    )}
                    <div className="text-xs text-gray-500">
                      {group.shipping_discount > 0 && (
                        <span className="text-green-600 mr-2">-{formatVnd(group.shipping_discount)}</span>
                      )}
                      <span className="font-medium">{formatVnd(group.shipping_fee)}</span>
                    </div>
                  </div>
                </div>

                {/* Shop Voucher Input */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                  <div className="text-sm font-medium text-gray-700">{t('shopVoucher')}:</div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={voucherInputs[group.shop_id] ?? ''}
                      onChange={(e) =>
                        setVoucherInputs((prev) => ({
                          ...prev,
                          [group.shop_id]: e.target.value,
                        }))
                      }
                      placeholder={t('enterVoucher')}
                      className="text-xs uppercase w-44"
                    />
                    <Button size="sm" variant="outline" onClick={() => handleApplyVoucher(group.shop_id)}>
                      {t('apply')}
                    </Button>
                  </div>
                </div>
                {group.voucher && (
                  <div className="text-xs flex justify-end">
                    {group.voucher.eligible ? (
                      <span className="text-green-600 font-medium">
                        {t('voucherApplied', { code: group.voucher.code })} (-
                        {formatVnd(group.voucher_discount)})
                      </span>
                    ) : (
                      <span className="text-red-500">{formatIssue(group.voucher.reason ?? '', t)}</span>
                    )}
                  </div>
                )}

                {/* Message to seller */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                    {t('messageToSeller')}:
                  </label>
                  <Input
                    value={shopSettings[group.shop_id]?.message_to_seller ?? ''}
                    onChange={(e) => handleMessageChange(group.shop_id, e.target.value)}
                    placeholder={t('messagePlaceholder')}
                    className="text-xs flex-1"
                  />
                </div>

                {/* Group issues if any */}
                {group.issues.length > 0 && (
                  <div className="rounded bg-red-50 p-2 text-xs text-red-700">
                    {group.issues.map((iss) => formatIssue(iss, t)).join(', ')}
                  </div>
                )}
              </div>
            </div>
          );
        })
      ) : null}

      {/* Payment Method Section */}
      <div className={panel}>
        <h3 className="mb-3 text-base font-semibold text-gray-800">{t('paymentMethod')}</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { id: 'COD', label: t('paymentCod'), simulated: false },
            { id: 'SHOPEEPAY_SIM', label: t('paymentShopeepay'), simulated: true },
            { id: 'CARD_SIM', label: t('paymentCard'), simulated: true },
            { id: 'BANK_TRANSFER_SIM', label: t('paymentBank'), simulated: true },
          ].map((pm) => (
            <label
              key={pm.id}
              className={`flex cursor-pointer items-start gap-3 rounded border p-3 transition-colors ${
                paymentMethod === pm.id
                  ? 'border-primary bg-orange-50/30'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="payment_method"
                value={pm.id}
                checked={paymentMethod === pm.id}
                onChange={() => setPaymentMethod(pm.id as PaymentMethod)}
                className="mt-1 h-4 w-4 border-gray-300 text-primary focus:ring-primary"
              />
              <div className="text-sm">
                <div className="font-medium text-gray-800">{pm.label}</div>
                {pm.simulated && <div className="text-xs text-amber-600">{t('simulatedNotice')}</div>}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Order Summary & Placement */}
      {quote && (
        <div className={panel}>
          <h3 className="mb-4 text-base font-semibold text-gray-800">{t('orderSummary')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>{t('itemsSubtotal')}:</span>
              <span>{formatVnd(quote.totals.items_subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>{t('shippingFee')}:</span>
              <span>{formatVnd(quote.totals.shipping_fee)}</span>
            </div>
            {quote.totals.shipping_discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t('shippingDiscount')}:</span>
                <span>-{formatVnd(quote.totals.shipping_discount)}</span>
              </div>
            )}
            {quote.totals.voucher_discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t('voucherDiscount')}:</span>
                <span>-{formatVnd(quote.totals.voucher_discount)}</span>
              </div>
            )}
            <div className="border-t pt-3 flex justify-between items-baseline">
              <span className="font-semibold text-gray-900">{t('totalPayment')}:</span>
              <span className="text-2xl font-bold text-primary">{formatVnd(quote.totals.total)}</span>
            </div>
          </div>

          {/* Validation errors/issues */}
          {quote.issues.length > 0 && (
            <div className="mt-4 rounded bg-red-50 p-3 text-xs text-red-700">
              <ul className="list-disc pl-4 space-y-1">
                {quote.issues.map((iss, i) => (
                  <li key={i}>{iss}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              size="lg"
              disabled={!quote.can_checkout || placing || quoteLoading}
              loading={placing}
              onClick={handlePlaceOrder}
              className="min-w-48 text-base"
            >
              {placing ? t('placingOrder') : t('placeOrder')}
            </Button>
          </div>
        </div>
      )}

      {/* Modal for adding address */}
      <AddressModal
        open={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        onSuccess={(newAddr) => {
          reloadAddresses();
          setCustomAddressId(newAddr.address_id);
        }}
      />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <RequireRole role="buyer">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <CheckoutView />
      </div>
    </RequireRole>
  );
}
