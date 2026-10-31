'use client';

import { useState } from 'react';
import { Modal, Spinner, useToast } from '@huspee/web-ui/components/ui';
import { useSession } from '@huspee/web-ui/components/session';
import { defineMessages } from '@huspee/web-ui/i18n';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { call } from '@/lib/seller-api';
import { ActionError } from '../errors';
import { notifyOrdersChanged } from '../events';
import { formatShortDateTime } from '../format';
import { Panel } from '../Panel';
import { btn, input, textarea } from '../ui';
import { needsSellerAction } from './return-filters';
import type { ReturnDetail, ReturnSolutions } from './types';

const messages = defineMessages({
  vi: {
    title: 'Xử lý',
    approve: 'Duyệt yêu cầu',
    approveTitle: 'Duyệt yêu cầu {sn}',
    approveRefund: 'Hoàn {amount} cho người mua.',
    reject: 'Từ chối',
    rejectReason: 'Lý do từ chối',
    chooseReason: 'Chọn lý do',
    reasonRequired: 'Chọn lý do từ chối',
    note: 'Ghi chú cho người mua',
    reason1: 'Người mua chưa gửi trả hàng',
    reason2: 'Hàng trả về bị hỏng hoặc đã qua sử dụng',
    reason3: 'Hàng trả về khác hàng đã giao',
    reason4: 'Số tiền hoàn không đúng',
    reason5: 'Lý do khác',
    offerToggle: 'Đề xuất phương án khác',
    offerRefund: 'Chỉ hoàn tiền',
    offerReturnRefund: 'Trả hàng và hoàn tiền',
    offerAmount: 'Số tiền hoàn',
    sendOffer: 'Gửi đề xuất',
    offerSent: 'Đã gửi đề xuất, chờ người mua phản hồi đến {date}',
    offerLine: '{solution} · {amount}',
    judging: 'Sàn đang xem xét khiếu nại của shop.',
    withdraw: 'Rút khiếu nại',
    back: 'Quay lại',
    approved: 'Đã duyệt {sn}',
    rejected: 'Đã gửi từ chối {sn}',
    offered: 'Đã gửi đề xuất {sn}',
    withdrawn: 'Đã rút khiếu nại {sn}',
  },
  en: {
    title: 'Actions',
    approve: 'Approve request',
    approveTitle: 'Approve request {sn}',
    approveRefund: 'Refund {amount} to the buyer.',
    reject: 'Reject',
    rejectReason: 'Rejection reason',
    chooseReason: 'Choose a reason',
    reasonRequired: 'Choose a rejection reason',
    note: 'Note to buyer',
    reason1: 'Buyer has not returned the item',
    reason2: 'Returned item is damaged or used',
    reason3: 'Returned item differs from the delivered item',
    reason4: 'Refund amount is incorrect',
    reason5: 'Other',
    offerToggle: 'Offer another solution',
    offerRefund: 'Refund only',
    offerReturnRefund: 'Return and refund',
    offerAmount: 'Refund amount',
    sendOffer: 'Send offer',
    offerSent: 'Offer sent, waiting for the buyer until {date}',
    offerLine: '{solution} · {amount}',
    judging: "The platform is reviewing the shop's dispute.",
    withdraw: 'Withdraw dispute',
    back: 'Back',
    approved: 'Approved {sn}',
    rejected: 'Rejection sent for {sn}',
    offered: 'Offer sent for {sn}',
    withdrawn: 'Dispute withdrawn for {sn}',
  },
});

type Reason = { reason_id: number; reason_text: string };
const KNOWN_REASONS = [1, 2, 3, 4, 5] as const;

/** S5.2 right column: only the transitions the return state machine allows. */
export function ReturnActions({
  shopId,
  ret,
  solutions,
  onChanged,
}: {
  shopId: number;
  ret: ReturnDetail;
  solutions: ReturnSolutions | null;
  onChanged: () => void;
}) {
  const t = useT(messages);
  const { lang } = useLang();
  const negotiation = ret.negotiation.negotiation_status;
  const pending = needsSellerAction({ status: ret.status, negotiation_status: negotiation });

  if (pending)
    return <PendingActions shopId={shopId} ret={ret} solutions={solutions} onChanged={onChanged} />;
  if (ret.status === 'REQUESTED' && negotiation === 'PENDING_BUYER_RESPOND') {
    const solution = ret.negotiation.latest_solution === 'refund' ? t('offerRefund') : t('offerReturnRefund');
    return (
      <Panel title={t('title')}>
        <p className="text-sm">
          {t('offerLine', { solution, amount: formatVnd(ret.negotiation.latest_offer_amount) })}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {t('offerSent', { date: formatShortDateTime(ret.negotiation.offer_due_date, lang) })}
        </p>
      </Panel>
    );
  }
  if (ret.status === 'JUDGING')
    return <WithdrawDispute shopId={shopId} returnSn={ret.return_sn} onChanged={onChanged} />;
  return null;
}

function useAction(onChanged: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  async function run(name: string, fn: () => Promise<unknown>, done: string) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      toast(done);
      notifyOrdersChanged();
      onChanged();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, setError, run };
}

function PendingActions({
  shopId,
  ret,
  solutions,
  onChanged,
}: {
  shopId: number;
  ret: ReturnDetail;
  solutions: ReturnSolutions | null;
  onChanged: () => void;
}) {
  const t = useT(messages);
  const { user } = useSession();
  const { busy, error, setError, run } = useAction(onChanged);
  const [confirming, setConfirming] = useState(false);
  const [reasonId, setReasonId] = useState(0);
  const [note, setNote] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  const canRefund = Boolean(solutions?.offer_refund.eligibility);
  const canReturnRefund = Boolean(solutions?.offer_return_refund.eligibility);
  const [offer, setOffer] = useState<'refund' | 'return_refund'>(canRefund ? 'refund' : 'return_refund');
  const [amount, setAmount] = useState(
    String(solutions?.offer_refund.max_refund_amount ?? ret.refund_amount),
  );
  const reasons = useApi(
    () =>
      call<{ dispute_reason_list: Reason[] }>(shopId, '/returns/get_return_dispute_reason', {
        return_sn: ret.return_sn,
      }).then((r) => r.dispute_reason_list),
    [shopId, ret.return_sn],
  );
  const reasonLabel = (r: Reason) =>
    (KNOWN_REASONS as readonly number[]).includes(r.reason_id)
      ? t(`reason${r.reason_id as (typeof KNOWN_REASONS)[number]}`)
      : r.reason_text;

  function reject() {
    if (!reasonId) {
      setError(t('reasonRequired'));
      return;
    }
    void run(
      'reject',
      () =>
        call(shopId, '/returns/dispute', {
          return_sn: ret.return_sn,
          email: user?.email,
          dispute_reason_id: reasonId,
          ...(note.trim() ? { dispute_text_reason: note.trim() } : {}),
        }),
      t('rejected', { sn: ret.return_sn }),
    );
  }

  return (
    <Panel title={t('title')}>
      <div className="space-y-2.5">
        <button
          type="button"
          className={`${btn.primary} w-full`}
          disabled={busy !== null}
          onClick={() => setConfirming(true)}
        >
          {t('approve')}
        </button>
        <button type="button" className={`${btn.outline} w-full`} disabled={busy !== null} onClick={reject}>
          {busy === 'reject' && <Spinner />}
          {t('reject')}
        </button>
      </div>
      <div className="mt-4 space-y-3 border-t border-line-soft pt-4 text-[13px] text-muted">
        <div className="space-y-1.5">
          <label htmlFor="return-reject-reason">{t('rejectReason')}</label>
          <select
            id="return-reject-reason"
            className={input}
            value={reasonId}
            onChange={(e) => setReasonId(Number(e.target.value))}
          >
            <option value={0}>{t('chooseReason')}</option>
            {(reasons.data ?? []).map((r) => (
              <option key={r.reason_id} value={r.reason_id}>
                {reasonLabel(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="return-reject-note">{t('note')}</label>
          <textarea
            id="return-reject-note"
            className={textarea}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      {(canRefund || canReturnRefund) && (
        <div className="mt-4 border-t border-line-soft pt-4 text-sm">
          <button
            type="button"
            className={btn.link}
            aria-expanded={offerOpen}
            onClick={() => setOfferOpen((v) => !v)}
          >
            {t('offerToggle')}
          </button>
          {offerOpen && (
            <div className="mt-3 space-y-3">
              {canRefund && (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="offer"
                    checked={offer === 'refund'}
                    onChange={() => setOffer('refund')}
                  />
                  {t('offerRefund')}
                </label>
              )}
              {canReturnRefund && (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="offer"
                    checked={offer === 'return_refund'}
                    onChange={() => setOffer('return_refund')}
                  />
                  {t('offerReturnRefund')}
                </label>
              )}
              {offer === 'refund' && (
                <div className="space-y-1.5 text-[13px] text-muted">
                  <label htmlFor="return-offer-amount">{t('offerAmount')}</label>
                  <input
                    id="return-offer-amount"
                    type="number"
                    className={input}
                    min={solutions?.offer_refund.min_refund_amount}
                    max={solutions?.offer_refund.max_refund_amount}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              )}
              <button
                type="button"
                className={`${btn.outline} w-full`}
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    'offer',
                    () =>
                      call(shopId, '/returns/offer', {
                        return_sn: ret.return_sn,
                        proposed_solution: offer,
                        ...(offer === 'refund' ? { proposed_adjusted_refund_amount: Number(amount) } : {}),
                      }),
                    t('offered', { sn: ret.return_sn }),
                  )
                }
              >
                {busy === 'offer' && <Spinner />}
                {t('sendOffer')}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="mt-3">
        <ActionError error={error} />
      </div>
      {confirming && (
        <Modal open onClose={() => setConfirming(false)} title={t('approveTitle', { sn: ret.return_sn })}>
          <p className="text-sm">{t('approveRefund', { amount: formatVnd(ret.refund_amount) })}</p>
          <div className="-mx-6 mt-5 flex justify-end gap-3 border-t border-line-soft px-6 pt-4">
            <button type="button" className={btn.outline} onClick={() => setConfirming(false)}>
              {t('back')}
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={busy !== null}
              onClick={() =>
                void run(
                  'approve',
                  () => call(shopId, '/returns/confirm', { return_sn: ret.return_sn }),
                  t('approved', { sn: ret.return_sn }),
                ).then(() => setConfirming(false))
              }
            >
              {busy === 'approve' && <Spinner />}
              {t('approve')}
            </button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

function WithdrawDispute({
  shopId,
  returnSn,
  onChanged,
}: {
  shopId: number;
  returnSn: string;
  onChanged: () => void;
}) {
  const t = useT(messages);
  const { busy, error, run } = useAction(onChanged);
  return (
    <Panel title={t('title')}>
      <p className="text-sm">{t('judging')}</p>
      <button
        type="button"
        className={`${btn.outline} mt-3 w-full`}
        disabled={busy !== null}
        onClick={() =>
          void run(
            'withdraw',
            () => call(shopId, '/returns/cancel_dispute', { return_sn: returnSn }),
            t('withdrawn', { sn: returnSn }),
          )
        }
      >
        {busy === 'withdraw' && <Spinner />}
        {t('withdraw')}
      </button>
      <div className="mt-3">
        <ActionError error={error} />
      </div>
    </Panel>
  );
}
