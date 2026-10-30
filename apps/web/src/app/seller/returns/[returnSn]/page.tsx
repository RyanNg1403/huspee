'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import { useLang, useT } from '@/i18n/client';
import { formatDateTime, formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { call } from '../../_ops/api';
import { ShopGuard } from '../../_ops/ShopGuard';
import { ReturnStatusBadge } from '../../_ops/StatusBadge';
import type {
  AvailableSolutions,
  DisputeReason,
  ReturnDetail,
  ReverseTrackingResponse,
} from '../../_ops/types';
import { returnMessages } from '../messages';

export default function ReturnDetailPage() {
  const params = useParams();
  const returnSn = String(params.returnSn);

  return <ShopGuard>{(shop) => <ReturnDetailContent shopId={shop.shop_id} returnSn={returnSn} />}</ShopGuard>;
}

function ReturnDetailContent({ shopId, returnSn }: { shopId: number; returnSn: string }) {
  const t = useT(returnMessages);
  const { lang } = useLang();
  const toast = useToast();

  // Modals state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [cancelDisputeModalOpen, setCancelDisputeModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);

  // Offer form state
  const [offerSolution, setOfferSolution] = useState<'refund' | 'return_refund'>('refund');
  const [offerAmount, setOfferAmount] = useState<number>(0);

  // Dispute form state
  const [disputeReasons, setDisputeReasons] = useState<DisputeReason[]>([]);
  const [selectedDisputeReasonId, setSelectedDisputeReasonId] = useState<number>(1);
  const [disputeEmail, setDisputeEmail] = useState('');
  const [disputeDescription, setDisputeDescription] = useState('');

  const detailApi = useApi(async () => {
    const detail = await call<ReturnDetail>(shopId, '/returns/get_return_detail', {
      return_sn: returnSn,
    });

    let solutions: AvailableSolutions | null = null;
    try {
      solutions = await call<AvailableSolutions>(shopId, '/returns/get_available_solutions', {
        return_sn: returnSn,
      });
      // Initialize offer amount to max refund
      if (solutions?.offer_refund?.max_refund_amount) {
        setOfferAmount(solutions.offer_refund.max_refund_amount);
      }
    } catch {
      // Ignore if not applicable
    }

    let reverseTrackingInfo: ReverseTrackingResponse | null = null;
    try {
      reverseTrackingInfo = await call<ReverseTrackingResponse>(
        shopId,
        '/returns/get_reverse_tracking_info',
        {
          return_sn: returnSn,
        },
      );
    } catch {
      // Reverse tracking not started
    }

    return { detail, solutions, reverseTrackingInfo };
  }, [shopId, returnSn]);

  // Open dispute modal with reasons
  async function handleOpenDispute() {
    setDisputeModalOpen(true);
    try {
      const res = await call<{ dispute_reason_list: DisputeReason[] }>(
        shopId,
        '/returns/get_return_dispute_reason',
        { return_sn: returnSn },
      );
      setDisputeReasons(res.dispute_reason_list ?? []);
      if (res.dispute_reason_list?.[0]) {
        setSelectedDisputeReasonId(res.dispute_reason_list[0].reason_id);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failed'));
    }
  }

  // Submit confirm refund
  async function handleConfirmRefund() {
    setPendingAction(true);
    try {
      await call(shopId, '/returns/confirm', { return_sn: returnSn });
      toast(t('confirmSuccess'));
      setConfirmModalOpen(false);
      detailApi.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failed'));
    } finally {
      setPendingAction(false);
    }
  }

  // Submit offer
  async function handleSendOffer() {
    setPendingAction(true);
    try {
      await call(shopId, '/returns/offer', {
        return_sn: returnSn,
        proposed_solution: offerSolution,
        proposed_adjusted_refund_amount: offerSolution === 'refund' ? Number(offerAmount) : undefined,
      });
      toast(t('offerSuccess'));
      setOfferModalOpen(false);
      detailApi.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failed'));
    } finally {
      setPendingAction(false);
    }
  }

  // Submit dispute
  async function handleSubmitDispute() {
    if (!disputeEmail || !disputeEmail.includes('@')) {
      toast(t('invalidEmailToast'));
      return;
    }
    setPendingAction(true);
    try {
      await call(shopId, '/returns/dispute', {
        return_sn: returnSn,
        email: disputeEmail,
        dispute_reason_id: selectedDisputeReasonId,
        dispute_text_reason: disputeDescription,
      });
      toast(t('disputeSubmitted'));
      setDisputeModalOpen(false);
      detailApi.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failed'));
    } finally {
      setPendingAction(false);
    }
  }

  // Submit cancel dispute
  async function handleCancelDispute() {
    setPendingAction(true);
    try {
      await call(shopId, '/returns/cancel_dispute', { return_sn: returnSn });
      toast(t('disputeCancelled'));
      setCancelDisputeModalOpen(false);
      detailApi.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failed'));
    } finally {
      setPendingAction(false);
    }
  }

  if (detailApi.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (detailApi.error) {
    return <ErrorState message={t('failed')} onRetry={detailApi.reload} retryLabel={t('all')} />;
  }

  if (!detailApi.data?.detail) {
    return <EmptyState title={t('noReturns')} />;
  }

  const { detail, solutions, reverseTrackingInfo } = detailApi.data;
  const isRequested = detail.status === 'REQUESTED';
  const isJudging = detail.status === 'JUDGING';
  const canConfirm = isRequested;
  const canOffer =
    isRequested && (solutions?.offer_refund?.eligibility || solutions?.offer_return_refund?.eligibility);
  const canDispute = isRequested;
  const canCancelDispute = isJudging;

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/seller/returns">
            <Button variant="outline" size="sm">
              ← {t('returnsTitle')}
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-gray-900 md:text-2xl">
            {t('returnDetailTitle')}: {detail.return_sn}
          </h1>
          <ReturnStatusBadge status={detail.status} />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canConfirm && (
            <Button variant="primary" size="sm" onClick={() => setConfirmModalOpen(true)}>
              {t('confirmRefundBtn')}
            </Button>
          )}
          {canOffer && (
            <Button variant="outline" size="sm" onClick={() => setOfferModalOpen(true)}>
              {t('makeOfferBtn')}
            </Button>
          )}
          {canDispute && (
            <Button
              variant="outline"
              size="sm"
              className="border-amber-600 text-amber-700 hover:bg-amber-50"
              onClick={() => void handleOpenDispute()}
            >
              {t('disputeBtn')}
            </Button>
          )}
          {canCancelDispute && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-600 text-red-600 hover:bg-red-50"
              onClick={() => setCancelDisputeModalOpen(true)}
            >
              {t('cancelDisputeBtn')}
            </Button>
          )}
        </div>
      </div>

      {/* Simulated Refund Disclaimer Alert */}
      <Card className="border border-blue-200 bg-blue-50/60 p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl text-blue-600">ℹ️</span>
          <div>
            <h3 className="font-semibold text-blue-900 text-sm">{t('simulationEnvTitle')}</h3>
            <p className="text-xs text-blue-800 mt-1">{t('simulatedDisclaimer')}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left Column (2 cols) */}
        <div className="space-y-5 lg:col-span-2">
          {/* Items Card */}
          <Card>
            <h2 className="mb-4 text-base font-bold text-gray-900">{t('items')}</h2>
            <div className="divide-y divide-gray-100">
              {(detail.item ?? []).map((i, idx) => (
                <div key={idx} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {i.images?.[0] ? (
                      <Image
                        src={i.images[0]}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-gray-100" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{i.name}</p>
                      <p className="text-xs text-gray-500">SKU: {i.item_sku || i.variation_sku || '—'}</p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-gray-900">{formatVnd(i.item_price)}</p>
                    <p className="text-xs text-gray-500">x{i.amount}</p>
                    {i.refund_amount ? (
                      <p className="text-xs font-semibold text-primary">
                        {t('refundAmount')}: {formatVnd(i.refund_amount)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Reason & Evidence Card */}
          <Card>
            <h2 className="mb-3 text-base font-bold text-gray-900">{t('reason')}</h2>
            <div className="space-y-3 text-sm">
              <div className="rounded bg-gray-50 p-3">
                <p className="font-semibold text-gray-800">{detail.reason}</p>
                {detail.text_reason && <p className="mt-1 text-gray-600">{detail.text_reason}</p>}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">{t('buyerImages')}</p>
                {detail.image?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {detail.image.map((url, idx) => (
                      <Image
                        key={idx}
                        src={url}
                        alt={t('evidenceAlt')}
                        width={80}
                        height={80}
                        unoptimized
                        className="h-20 w-20 rounded border object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-gray-400">{t('noImages')}</p>
                )}
              </div>
            </div>
          </Card>

          {/* Reverse Tracking Card */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-gray-900">{t('reverseTracking')}</h2>
              {reverseTrackingInfo?.reverse_logistics_status && (
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {t('reverseLogisticsStatus', { status: reverseTrackingInfo.reverse_logistics_status })}
                </span>
              )}
            </div>
            {(reverseTrackingInfo?.tracking_number || detail.tracking_number) && (
              <p className="mb-3 text-xs font-semibold text-primary">
                {t('returnTrackingNumber', {
                  number: reverseTrackingInfo?.tracking_number || detail.tracking_number,
                })}
              </p>
            )}

            {(reverseTrackingInfo?.tracking_info?.length ?? 0) > 0 ? (
              <div className="relative border-l-2 border-primary/30 pl-4 space-y-4 my-2">
                {reverseTrackingInfo!.tracking_info.map((ev, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="text-xs text-gray-400">{formatDateTime(ev.update_time, lang)}</p>
                    <p className="text-sm font-medium text-gray-800">{ev.tracking_description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 py-3">{t('noReverseTracking')}</p>
            )}
          </Card>
        </div>

        {/* Right Column: Order info, summary & negotiation (1 col) */}
        <div className="space-y-5">
          {/* Order & Buyer Info Card */}
          <Card>
            <h2 className="mb-3 text-base font-bold text-gray-900">{t('orderInfo')}</h2>
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <span className="text-xs font-semibold text-gray-500">{t('orderSn')}:</span>
                <p>
                  <Link
                    href={`/seller/orders/${detail.order_sn}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {detail.order_sn}
                  </Link>
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-500">{t('buyerInfo')}:</span>
                <p className="font-medium">{detail.user?.username || '—'}</p>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-500">{t('createdAt')}:</span>
                <p>{formatDateTime(detail.create_time, lang)}</p>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-500">{t('dueDate')}:</span>
                <p className="text-red-600 font-medium">{formatDateTime(detail.due_date, lang)}</p>
              </div>
              {detail.negotiation_status && (
                <div>
                  <span className="text-xs font-semibold text-gray-500">{t('negotiationStatus')}:</span>
                  <p className="font-medium text-indigo-700">{detail.negotiation_status}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Refund Amount Card */}
          <Card>
            <h2 className="mb-3 text-base font-bold text-gray-900">{t('refundAmount')}</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>{t('amountBeforeDiscount')}</span>
                <span>{formatVnd(detail.amount_before_discount)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-base font-bold text-gray-900">
                <span>{t('refundAmount')}:</span>
                <span className="text-primary">{formatVnd(detail.refund_amount)}</span>
              </div>
            </div>
          </Card>

          {/* Dispute info if existing */}
          {detail.dispute_reason?.length > 0 && (
            <Card className="border border-amber-200 bg-amber-50">
              <h2 className="mb-2 text-sm font-bold text-amber-900">{t('currentDisputeInfo')}</h2>
              <p className="text-xs text-amber-800">
                {t('disputeReasonLabel', { reasons: detail.dispute_reason.join(', ') })}
              </p>
              {detail.dispute_text_reason?.length > 0 && (
                <p className="mt-1 text-xs text-amber-700">{detail.dispute_text_reason.join(', ')}</p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Confirm Refund Modal */}
      <Modal
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title={t('confirmRefundTitle')}
      >
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-700">
            {t('confirmRefundDesc', { amount: formatVnd(detail.refund_amount) })}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmModalOpen(false)} disabled={pendingAction}>
              {t('cancel')}
            </Button>
            <Button variant="primary" loading={pendingAction} onClick={() => void handleConfirmRefund()}>
              {t('confirmRefundBtn')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Offer Modal */}
      <Modal open={offerModalOpen} onClose={() => setOfferModalOpen(false)} title={t('offerTitle')}>
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('solutionType')}</label>
            <div className="space-y-2">
              {solutions?.offer_refund?.eligibility && (
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="offerSolution"
                    checked={offerSolution === 'refund'}
                    onChange={() => setOfferSolution('refund')}
                  />
                  <span>{t('offerRefundOnly')}</span>
                </label>
              )}
              {solutions?.offer_return_refund?.eligibility && (
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="offerSolution"
                    checked={offerSolution === 'return_refund'}
                    onChange={() => setOfferSolution('return_refund')}
                  />
                  <span>{t('offerReturnRefund')}</span>
                </label>
              )}
            </div>
          </div>

          {offerSolution === 'refund' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {t('customRefundAmount')}
              </label>
              <Input
                type="number"
                min={solutions?.offer_refund?.min_refund_amount ?? 0}
                max={solutions?.offer_refund?.max_refund_amount ?? detail.refund_amount}
                value={offerAmount}
                onChange={(e) => setOfferAmount(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-gray-500">
                {t('minAmount', {
                  min: formatVnd(solutions?.offer_refund?.min_refund_amount ?? 0),
                })}{' '}
                -{' '}
                {t('maxAmount', {
                  max: formatVnd(solutions?.offer_refund?.max_refund_amount ?? detail.refund_amount),
                })}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOfferModalOpen(false)} disabled={pendingAction}>
              {t('cancel')}
            </Button>
            <Button variant="primary" loading={pendingAction} onClick={() => void handleSendOffer()}>
              {t('sendOffer')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Dispute Modal */}
      <Modal open={disputeModalOpen} onClose={() => setDisputeModalOpen(false)} title={t('disputeTitle')}>
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('disputeReason')}</label>
            <Select
              value={selectedDisputeReasonId}
              onChange={(e) => setSelectedDisputeReasonId(Number(e.target.value))}
            >
              {disputeReasons.map((r) => (
                <option key={r.reason_id} value={r.reason_id}>
                  {r.reason_text}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('disputeEmail')}</label>
            <Input
              type="email"
              placeholder="seller@example.com"
              value={disputeEmail}
              onChange={(e) => setDisputeEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              {t('disputeDescription')}
            </label>
            <Textarea
              rows={3}
              value={disputeDescription}
              onChange={(e) => setDisputeDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDisputeModalOpen(false)} disabled={pendingAction}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700"
              loading={pendingAction}
              onClick={() => void handleSubmitDispute()}
            >
              {t('disputeBtn')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Dispute Modal */}
      <Modal
        open={cancelDisputeModalOpen}
        onClose={() => setCancelDisputeModalOpen(false)}
        title={t('cancelDisputeBtn')}
      >
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-700">{t('cancelDisputeConfirm')}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCancelDisputeModalOpen(false)} disabled={pendingAction}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              className="bg-red-600 hover:bg-red-700"
              loading={pendingAction}
              onClick={() => void handleCancelDispute()}
            >
              {t('cancelDisputeBtn')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
