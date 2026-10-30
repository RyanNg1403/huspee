'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Input, Modal, QueryState, Spinner, Tabs, useToast } from '@/components/ui';
import { useLang, useT } from '@/i18n';
import { formatDateTime, formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { call } from '../_ops/api';
import { dateTimeLocalToUnix, getVoucherStatus, unixToDateTimeLocal } from '../_ops/date-utils';
import { ShopGuard } from '../_ops/ShopGuard';
import { VoucherStatusBadge } from '../_ops/StatusBadge';
import type { VoucherItem } from '../_ops/types';
import { voucherMessages } from './messages';

interface VoucherWithComputedStatus extends VoucherItem {
  computedStatus: 'upcoming' | 'ongoing' | 'expired';
}

export default function VouchersPage() {
  return <ShopGuard>{(shop) => <VouchersContent shopId={shop.shop_id} />}</ShopGuard>;
}

function VouchersContent({ shopId }: { shopId: number }) {
  const t = useT(voucherMessages);
  const { lang } = useLang();
  const toast = useToast();

  const [selectedTab, setSelectedTab] = useState<'upcoming' | 'ongoing' | 'expired' | 'all'>('ongoing');
  const [pageNo, setPageNo] = useState<number>(1);

  // Modal states
  const [editingVoucherId, setEditingVoucherId] = useState<number | null>(null);
  const [endingVoucherId, setEndingVoucherId] = useState<number | null>(null);
  const [deletingVoucherId, setDeletingVoucherId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState(false);

  // Edit form state
  const [editData, setEditData] = useState<VoucherItem | null>(null);
  const [editStatus, setEditStatus] = useState<'upcoming' | 'ongoing' | 'expired'>('ongoing');
  const [editLoading, setEditLoading] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsage, setEditUsage] = useState<number>(100);
  const [editEndTime, setEditEndTime] = useState<string>('');
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editMinBasket, setEditMinBasket] = useState<number>(0);
  const [editDiscountAmount, setEditDiscountAmount] = useState<number>(0);
  const [editPercentage, setEditPercentage] = useState<number>(10);
  const [editMaxPrice, setEditMaxPrice] = useState<number>(0);
  const [editDisplayChannel, setEditDisplayChannel] = useState<boolean>(true);
  const [editError, setEditError] = useState<string | null>(null);

  const vouchersApi = useApi(async () => {
    const res = await call<{
      more: boolean;
      voucher_list: VoucherItem[];
    }>(shopId, '/voucher/get_voucher_list', {
      page_no: pageNo,
      page_size: 20,
      status: selectedTab,
    });
    const now = Math.floor(Date.now() / 1000);
    const list: VoucherWithComputedStatus[] = (res.voucher_list ?? []).map((v) => ({
      ...v,
      computedStatus: getVoucherStatus(v.start_time, v.end_time, now),
    }));
    return {
      more: res.more,
      voucher_list: list,
    };
  }, [shopId, pageNo, selectedTab]);

  const tabs = [
    { value: 'ongoing', label: t('ongoing') },
    { value: 'upcoming', label: t('upcoming') },
    { value: 'expired', label: t('expired') },
    { value: 'all', label: t('all') },
  ];

  function handleTabChange(value: string) {
    setSelectedTab(value as 'upcoming' | 'ongoing' | 'expired' | 'all');
    setPageNo(1);
  }

  // Open Edit Modal
  async function handleOpenEdit(voucherId: number) {
    setEditingVoucherId(voucherId);
    setEditLoading(true);
    setEditError(null);
    try {
      const v = await call<VoucherItem>(shopId, '/voucher/get_voucher', {
        voucher_id: voucherId,
      });
      const vStatus = getVoucherStatus(v.start_time, v.end_time);
      setEditStatus(vStatus);
      setEditData({ ...v, status: vStatus });
      setEditName(v.voucher_name);
      setEditUsage(v.usage_quantity);
      setEditMinBasket(v.min_basket_price ?? 0);
      setEditDiscountAmount(v.discount_amount ?? 0);
      setEditPercentage(v.percentage ?? 10);
      setEditMaxPrice(v.max_price ?? 0);
      setEditDisplayChannel(v.display_channel_list ? v.display_channel_list.includes(1) : true);

      setEditStartTime(unixToDateTimeLocal(v.start_time));
      setEditEndTime(unixToDateTimeLocal(v.end_time));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failed'));
      setEditingVoucherId(null);
    } finally {
      setEditLoading(false);
    }
  }

  // Save Edit
  async function handleSaveEdit() {
    if (!editData) return;
    setPendingAction(true);
    setEditError(null);
    try {
      const isOngoing = editStatus === 'ongoing';
      const endUnix = dateTimeLocalToUnix(editEndTime, editData.end_time);

      const payload: Record<string, unknown> = {
        voucher_id: editData.voucher_id,
        voucher_name: editName.trim(),
        display_channel_list: editDisplayChannel ? [1] : [],
        usage_quantity: editUsage,
        end_time: endUnix,
      };

      if (!isOngoing) {
        const startUnix = dateTimeLocalToUnix(editStartTime, editData.start_time);
        payload.start_time = startUnix;
        payload.min_basket_price = editMinBasket;
        if (editData.reward_type === 1) {
          payload.discount_amount = editDiscountAmount;
        } else {
          payload.percentage = editPercentage;
          if (editMaxPrice > 0) payload.max_price = editMaxPrice;
        }
      }

      await call(shopId, '/voucher/update_voucher', payload);
      toast(t('updateSuccess'));
      setEditingVoucherId(null);
      vouchersApi.reload();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : t('failed'));
    } finally {
      setPendingAction(false);
    }
  }

  // Confirm End Voucher
  async function handleConfirmEnd() {
    if (!endingVoucherId) return;
    setPendingAction(true);
    try {
      await call(shopId, '/voucher/end_voucher', {
        voucher_id: endingVoucherId,
      });
      toast(t('endVoucherSuccess'));
      setEndingVoucherId(null);
      vouchersApi.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failed'));
    } finally {
      setPendingAction(false);
    }
  }

  // Confirm Delete Voucher
  async function handleConfirmDelete() {
    if (!deletingVoucherId) return;
    setPendingAction(true);
    try {
      await call(shopId, '/voucher/delete_voucher', {
        voucher_id: deletingVoucherId,
      });
      toast(t('deleteVoucherSuccess'));
      setDeletingVoucherId(null);
      vouchersApi.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failed'));
    } finally {
      setPendingAction(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('vouchersTitle')}</h1>
        <Link href="/seller/vouchers/new">
          <Button variant="primary" size="sm">
            + {t('createVoucherBtn')}
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
        <Tabs items={tabs} value={selectedTab} onChange={handleTabChange} />
      </div>

      {/* List content */}
      <QueryState
        loading={vouchersApi.loading}
        error={vouchersApi.error}
        errorMessage={t('failed')}
        retry={vouchersApi.reload}
        retryLabel={t('all')}
        empty={!vouchersApi.data || vouchersApi.data.voucher_list.length === 0}
        emptyTitle={t('noVouchers')}
        spinner
      >
        {vouchersApi.data && (
          <div className="space-y-3">
            {/* Desktop Table View */}
            <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white shadow-card md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-4 py-3">{t('code')}</th>
                    <th className="px-4 py-3">{t('name')}</th>
                    <th className="px-4 py-3">{t('type')}</th>
                    <th className="px-4 py-3">{t('reward')}</th>
                    <th className="px-4 py-3">{t('usage')}</th>
                    <th className="px-4 py-3">{t('validity')}</th>
                    <th className="px-4 py-3 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vouchersApi.data.voucher_list.map((v) => {
                    const status = v.computedStatus;

                    return (
                      <tr key={v.voucher_id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <span className="rounded-lg bg-orange-50 px-2 py-1 font-mono font-bold text-primary">
                            {v.voucher_code}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{v.voucher_name}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {v.voucher_type === 1 ? t('shopVoucher') : t('productVoucher')}
                        </td>
                        <td className="px-4 py-3 font-semibold text-primary">
                          {v.reward_type === 1 ? formatVnd(v.discount_amount ?? 0) : `${v.percentage}%`}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="font-semibold text-gray-900">{v.current_usage}</span>
                          <span className="text-gray-400"> / {v.usage_quantity}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <div>{formatDateTime(v.start_time, lang)}</div>
                          <div className="text-gray-400">→ {formatDateTime(v.end_time, lang)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {status !== 'expired' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void handleOpenEdit(v.voucher_id)}
                              >
                                {t('edit')}
                              </Button>
                            )}
                            {status === 'ongoing' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-amber-600 text-amber-700 hover:bg-amber-50"
                                onClick={() => setEndingVoucherId(v.voucher_id)}
                              >
                                {t('endVoucher')}
                              </Button>
                            )}
                            {status === 'upcoming' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-600 text-red-600 hover:bg-red-50"
                                onClick={() => setDeletingVoucherId(v.voucher_id)}
                              >
                                {t('deleteVoucher')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="space-y-3 md:hidden">
              {vouchersApi.data.voucher_list.map((v) => {
                const status = v.computedStatus;

                return (
                  <Card key={v.voucher_id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="rounded-lg bg-orange-50 px-2 py-1 font-mono font-bold text-primary">
                        {v.voucher_code}
                      </span>
                      <VoucherStatusBadge status={status} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{v.voucher_name}</p>
                      <p className="text-xs text-gray-500">
                        {v.voucher_type === 1 ? t('shopVoucher') : t('productVoucher')} ·{' '}
                        {v.reward_type === 1 ? formatVnd(v.discount_amount ?? 0) : `${v.percentage}%`}
                      </p>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <p>
                        <span className="font-semibold">{t('usage')}:</span> {v.current_usage} /{' '}
                        {v.usage_quantity}
                      </p>
                      <p className="text-gray-400">
                        {formatDateTime(v.start_time, lang)} → {formatDateTime(v.end_time, lang)}
                      </p>
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t">
                      {status !== 'expired' && (
                        <Button size="sm" variant="ghost" onClick={() => void handleOpenEdit(v.voucher_id)}>
                          {t('edit')}
                        </Button>
                      )}
                      {status === 'ongoing' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-600 text-amber-700 hover:bg-amber-50"
                          onClick={() => setEndingVoucherId(v.voucher_id)}
                        >
                          {t('endVoucher')}
                        </Button>
                      )}
                      {status === 'upcoming' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-600 text-red-600 hover:bg-red-50"
                          onClick={() => setDeletingVoucherId(v.voucher_id)}
                        >
                          {t('deleteVoucher')}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pageNo <= 1}
                onClick={() => setPageNo((p) => Math.max(1, p - 1))}
              >
                ← {t('prevPage')}
              </Button>
              <span className="text-xs text-gray-500">{t('pageNumber', { page: pageNo })}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!vouchersApi.data?.more}
                onClick={() => setPageNo((p) => p + 1)}
              >
                {t('nextPage')} →
              </Button>
            </div>
          </div>
        )}
      </QueryState>

      {/* Edit Modal */}
      <Modal
        open={editingVoucherId !== null}
        onClose={() => setEditingVoucherId(null)}
        title={t('editModalTitle')}
      >
        {editLoading || !editData ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {editError && <div className="rounded-xl bg-red-50 p-2 text-xs text-red-700">{editError}</div>}

            {editStatus === 'ongoing' && (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{t('ongoingNotice')}</p>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('code')}</label>
              <Input value={editData.voucher_code} disabled className="bg-gray-100" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('name')}</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('usageQuantityLabel')}
              </label>
              <Input
                type="number"
                min={editStatus === 'ongoing' ? editData.usage_quantity : 1}
                value={editUsage}
                onChange={(e) => setEditUsage(Number(e.target.value))}
                required
              />
              {editStatus === 'ongoing' && (
                <p className="text-xs text-gray-400 mt-1">
                  {t('increaseQuantityNotice', { quantity: editData.usage_quantity })}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('endTimeLabel')}</label>
              <Input
                type="datetime-local"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                required
              />
              {editStatus === 'ongoing' && (
                <p className="text-xs text-gray-400 mt-1">{t('futureEndTimeNotice')}</p>
              )}
            </div>

            {/* Editable fields for upcoming vouchers */}
            {editStatus === 'upcoming' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {t('startTimeLabel')}
                  </label>
                  <Input
                    type="datetime-local"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {t('minBasketLabel')}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={editMinBasket}
                    onChange={(e) => setEditMinBasket(Number(e.target.value))}
                  />
                </div>
                {editData.reward_type === 1 ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {t('discountAmountLabel')}
                    </label>
                    <Input
                      type="number"
                      min="1000"
                      value={editDiscountAmount}
                      onChange={(e) => setEditDiscountAmount(Number(e.target.value))}
                      required
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {t('percentageLabel')}
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="99"
                        value={editPercentage}
                        onChange={(e) => setEditPercentage(Number(e.target.value))}
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
                        value={editMaxPrice}
                        onChange={(e) => setEditMaxPrice(Number(e.target.value))}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="editStorefront"
                checked={editDisplayChannel}
                onChange={(e) => setEditDisplayChannel(e.target.checked)}
              />
              <label htmlFor="editStorefront" className="text-xs text-gray-700">
                {t('storefrontToggleLabel')}
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button variant="ghost" onClick={() => setEditingVoucherId(null)} disabled={pendingAction}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={pendingAction} onClick={() => void handleSaveEdit()}>
                {t('save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* End Voucher Modal */}
      <Modal open={endingVoucherId !== null} onClose={() => setEndingVoucherId(null)} title={t('endVoucher')}>
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-700">{t('endVoucherConfirm')}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEndingVoucherId(null)} disabled={pendingAction}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700"
              loading={pendingAction}
              onClick={() => void handleConfirmEnd()}
            >
              {t('confirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Voucher Modal */}
      <Modal
        open={deletingVoucherId !== null}
        onClose={() => setDeletingVoucherId(null)}
        title={t('deleteVoucher')}
      >
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-700">{t('deleteVoucherConfirm')}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDeletingVoucherId(null)} disabled={pendingAction}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              className="bg-red-600 hover:bg-red-700"
              loading={pendingAction}
              onClick={() => void handleConfirmDelete()}
            >
              {t('confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
