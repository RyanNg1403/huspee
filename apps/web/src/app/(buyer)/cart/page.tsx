'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Cart, CartLine, ProductModel } from '@huspee/sdk';
import { RequireRole } from '@/components/session';
import { Button, QuantityStepper, QueryState, Select, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { messages } from '../_orders/messages';
import { formatIssue, getErrorMessage, panel } from '../_orders/shared';

function CartVariantPicker({
  item,
  disabled,
  onModelChange,
}: {
  item: CartLine;
  disabled: boolean;
  onModelChange: (item: CartLine, modelId: number) => Promise<void>;
}) {
  const t = useT(messages);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ProductModel[] | null>(null);

  const handleOpen = async () => {
    if (disabled) return;
    setEditing(true);
    if (!models) {
      setLoading(true);
      try {
        const prod = await getApiClient().marketplace.getProduct(item.item_id);
        setModels(prod.models.filter((m) => m.available));
      } catch {
        setEditing(false);
      } finally {
        setLoading(false);
      }
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {item.model_name && (
          <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {t('productVariant')}: {item.model_name}
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={handleOpen}
          className="text-xs text-primary hover:underline font-medium"
        >
          {t('changeVariant')} ▾
        </button>
      </div>
    );
  }

  if (loading) {
    return <span className="text-xs text-gray-400">...</span>;
  }

  if (!models || models.length <= 1) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {item.model_name}
        </span>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Select
        value={item.model_id}
        disabled={disabled}
        onChange={async (e) => {
          const val = Number(e.target.value);
          if (val !== item.model_id) {
            await onModelChange(item, val);
          }
          setEditing(false);
        }}
        className="text-xs py-0.5 h-7"
      >
        {models.map((m) => (
          <option key={m.model_id} value={m.model_id} disabled={!m.available || m.stock <= 0}>
            {m.name} ({formatVnd(m.price)})
          </option>
        ))}
      </Select>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
    </div>
  );
}

function CartView() {
  const t = useT(messages);
  const tCommon = useT(common);
  const router = useRouter();
  const toast = useToast();
  const { data: cart, error, loading, reload } = useApi<Cart>(() => getApiClient().cart.get(), []);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Extract all available items from cart
  const allAvailableItems = useMemo(() => {
    if (!cart?.shops) return [];
    return cart.shops.flatMap((s) => s.items.filter((i) => i.available));
  }, [cart]);

  const allAvailableIds = useMemo(() => {
    return allAvailableItems.map((i) => i.cart_item_id);
  }, [allAvailableItems]);

  const isAllSelected = allAvailableIds.length > 0 && allAvailableIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allAvailableIds));
    }
  };

  const toggleShop = (shopItems: CartLine[]) => {
    const availableShopItemIds = shopItems.filter((i) => i.available).map((i) => i.cart_item_id);
    const allShopSelected =
      availableShopItemIds.length > 0 && availableShopItemIds.every((id) => selectedIds.has(id));

    const next = new Set(selectedIds);
    if (allShopSelected) {
      availableShopItemIds.forEach((id) => next.delete(id));
    } else {
      availableShopItemIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleItem = (item: CartLine) => {
    if (!item.available) return;
    const next = new Set(selectedIds);
    if (next.has(item.cart_item_id)) {
      next.delete(item.cart_item_id);
    } else {
      next.add(item.cart_item_id);
    }
    setSelectedIds(next);
  };

  const handleQuantityChange = async (item: CartLine, newQty: number) => {
    if (updatingId !== null || newQty < 1 || newQty === item.quantity) return;
    setUpdatingId(item.cart_item_id);
    try {
      await getApiClient().cart.updateItem(item.cart_item_id, { quantity: newQty });
      window.dispatchEvent(new Event('huspee:cart-changed'));
      toast(t('updated'));
      reload();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleModelChange = async (item: CartLine, newModelId: number) => {
    if (updatingId !== null || newModelId === item.model_id) return;
    setUpdatingId(item.cart_item_id);
    try {
      await getApiClient().cart.updateItem(item.cart_item_id, { model_id: newModelId });
      window.dispatchEvent(new Event('huspee:cart-changed'));
      toast(t('updated'));
      reload();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveItem = async (cartItemId: number) => {
    if (updatingId !== null) return;
    setUpdatingId(cartItemId);
    try {
      await getApiClient().cart.removeItem(cartItemId);
      const next = new Set(selectedIds);
      next.delete(cartItemId);
      setSelectedIds(next);
      window.dispatchEvent(new Event('huspee:cart-changed'));
      toast(t('removed'));
      reload();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCheckout = () => {
    if (selectedIds.size === 0) return;
    const itemsParam = Array.from(selectedIds).join(',');
    // Documented: Passing selected cart_item_ids via URL query string to /checkout?items=...
    router.push(`/checkout?items=${encodeURIComponent(itemsParam)}`);
  };

  // Selected items across shops
  const selectedItems = useMemo(() => {
    if (!cart?.shops) return [];
    return cart.shops.flatMap((s) => s.items).filter((i) => selectedIds.has(i.cart_item_id));
  }, [cart, selectedIds]);

  // The API returns line_total for each cart item; the browser sums these authoritative API values for the currently selected items.
  const selectedTotal = useMemo(() => {
    return selectedItems.reduce((acc, item) => acc + item.line_total, 0);
  }, [selectedItems]);

  if (loading || error) return <QueryState loading={loading} error={error} retry={reload} />;

  if (!cart || cart.shops.length === 0 || cart.item_count === 0) {
    return (
      <div className={`${panel} flex flex-col items-center justify-center py-16 text-center`}>
        <div className="mb-4 text-5xl">🛒</div>
        <h2 className="mb-2 text-xl font-semibold text-gray-800">{t('emptyCart')}</h2>
        <p className="mb-6 text-sm text-gray-500">{t('emptyCartSub')}</p>
        <Link href="/">
          <Button>{t('shopNow')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Table header for desktop */}
      <div className="hidden grid-cols-12 items-center bg-white p-4 text-sm font-medium text-gray-600 shadow-sm md:grid rounded">
        <div className="col-span-6 flex items-center gap-3">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            aria-label={t('selectAll')}
          />
          <span>{t('cartTitle')}</span>
        </div>
        <div className="col-span-2 text-center">{t('unitPrice')}</div>
        <div className="col-span-2 text-center">{t('quantity')}</div>
        <div className="col-span-1 text-center">{t('lineTotal')}</div>
        <div className="col-span-1 text-center">{t('actions')}</div>
      </div>

      {/* Cart items grouped by shop */}
      {cart.shops.map((shop) => {
        const availableShopItemIds = shop.items.filter((i) => i.available).map((i) => i.cart_item_id);
        const isShopSelected =
          availableShopItemIds.length > 0 && availableShopItemIds.every((id) => selectedIds.has(id));

        return (
          <div key={shop.shop_id} className={`${panel} p-0 overflow-hidden`}>
            {/* Shop Header */}
            <div className="flex items-center gap-3 border-b bg-gray-50/70 px-4 py-3">
              <input
                type="checkbox"
                checked={isShopSelected}
                disabled={availableShopItemIds.length === 0}
                onChange={() => toggleShop(shop.items)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                aria-label={shop.shop_name}
              />
              <span className="font-semibold text-gray-900">
                <Link
                  href={`/shops/${shop.shop_id}`}
                  className="hover:text-primary transition-colors flex items-center gap-1.5"
                >
                  <span>🏪</span>
                  <span>{shop.shop_name}</span>
                </Link>
              </span>
            </div>

            {/* Shop Lines */}
            <div className="divide-y">
              {shop.items.map((item) => {
                const isSelected = selectedIds.has(item.cart_item_id);
                return (
                  <div
                    key={item.cart_item_id}
                    className={`p-4 transition-colors ${
                      !item.available ? 'bg-gray-50 opacity-60' : 'hover:bg-orange-50/20'
                    }`}
                  >
                    <div className="flex flex-col gap-4 md:grid md:grid-cols-12 md:items-center">
                      {/* Checkbox and Product info */}
                      <div className="flex items-start gap-3 md:col-span-6">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!item.available}
                          onChange={() => toggleItem(item)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          aria-label={item.item_name}
                        />
                        <div className="flex gap-3">
                          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded border bg-gray-100">
                            {item.image_url ? (
                              <Image
                                unoptimized
                                width={80}
                                height={80}
                                src={item.image_url}
                                alt={item.item_name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                                Huspee
                              </div>
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <Link
                              href={`/products/${item.item_id}`}
                              className="line-clamp-2 text-sm font-medium text-gray-800 hover:text-primary"
                            >
                              {item.item_name}
                            </Link>
                            <CartVariantPicker
                              item={item}
                              disabled={updatingId !== null}
                              onModelChange={handleModelChange}
                            />
                            {!item.available && (
                              <div className="text-xs font-medium text-red-600">
                                {item.issue ? formatIssue(item.issue, t) : t('itemUnavailable')}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="flex items-center justify-between text-sm md:col-span-2 md:justify-center">
                        <span className="text-gray-500 md:hidden">{t('unitPrice')}:</span>
                        <div className="text-right md:text-center">
                          {item.original_price > item.unit_price && (
                            <span className="mr-2 text-xs text-gray-400 line-through">
                              {formatVnd(item.original_price)}
                            </span>
                          )}
                          <span className="font-medium text-gray-900">{formatVnd(item.unit_price)}</span>
                        </div>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center justify-between md:col-span-2 md:justify-center">
                        <span className="text-gray-500 md:hidden">{t('quantity')}:</span>
                        <div
                          className={`flex items-center ${
                            updatingId === item.cart_item_id ? 'pointer-events-none opacity-50' : ''
                          }`}
                        >
                          <QuantityStepper
                            value={item.quantity}
                            min={1}
                            max={item.stock > 0 ? item.stock : 999}
                            onChange={(val) => handleQuantityChange(item, val)}
                          />
                        </div>
                      </div>

                      {/* Line Total */}
                      <div className="flex items-center justify-between text-sm md:col-span-1 md:justify-center">
                        <span className="text-gray-500 md:hidden">{t('lineTotal')}:</span>
                        <span className="font-semibold text-primary">{formatVnd(item.line_total)}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end md:col-span-1 md:justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.cart_item_id)}
                          disabled={updatingId === item.cart_item_id}
                          className="text-xs text-gray-500 hover:text-red-600 transition-colors p-1"
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="sticky_select_all"
              checked={isAllSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="sticky_select_all" className="cursor-pointer text-sm font-medium text-gray-700">
              {t('selectAll')} ({allAvailableIds.length})
            </label>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-500">{t('selectedItems', { count: selectedIds.size })}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-medium text-gray-700">{t('total')}:</span>
                <span className="text-xl font-bold text-primary">{formatVnd(selectedTotal)}</span>
              </div>
            </div>

            <Button size="lg" disabled={selectedIds.size === 0} onClick={handleCheckout} className="min-w-36">
              {t('checkout')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  return (
    <RequireRole role="buyer">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <CartView />
      </div>
    </RequireRole>
  );
}
