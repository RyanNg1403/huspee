'use client';
import Link from 'next/link';
import type { ReturnEvidence } from '@huspee/sdk';
import { EvidenceImage } from '@huspee/web-ui/components/refunds/EvidenceImage';
import { EvidencePicker, buyerEvidenceContent } from '@huspee/web-ui/components/refunds/EvidencePicker';
import { messages as evidenceMessages } from '@huspee/web-ui/components/refunds/messages';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatDateTime, formatVnd } from '@huspee/web-ui/lib/format';
import {
  messages,
  orderStatusKey,
  type AssistantMessageKey,
} from '@huspee/web-ui/components/assistant/messages';
import { ProductDetails, ProductDetailsLoader } from '@huspee/web-ui/components/assistant/product-details';
import { pickLanguage, summaryRows } from '@huspee/web-ui/components/assistant/summary';
import { formatClock, formatCountdown, secondsLeft } from '@huspee/web-ui/components/assistant/time';

import type { Action, Card } from '@huspee/web-ui/components/assistant/card-types';
export type { Action, Card } from '@huspee/web-ui/components/assistant/card-types';

type Translate = (key: AssistantMessageKey, vars?: Record<string, string | number>) => string;
const SETTLED_ORDER = new Set(['SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED']);

export type EditOptions = {
  line_index: number;
  name: string;
  lines: Array<{
    line_index: number;
    name: string;
    quantity: number;
    model_id: number;
    models: Array<{ model_id: number; name: string; stock: number }>;
  }>;
  quantity: number;
  model_id: number;
  models: Array<{ model_id: number; name: string; stock: number }>;
};

type EditHandler = (
  action: Action,
  input: { quantity?: number; model_id?: number; line_index?: number; evidence_ids?: string[] },
) => Promise<void>;

const frame = 'overflow-hidden rounded-lg border bg-white text-sm break-words';
const header = 'flex items-center justify-between gap-3 border-b border-line-soft bg-gray-50 px-3 py-2';
const footerLink =
  'block border-t border-line-soft px-3 py-2 text-xs font-medium text-primary hover:bg-gray-50';

function Thumb({ src, size = 'h-14 w-14' }: { src: string | null; size?: string }) {
  return src ? (
    <Image
      src={src}
      alt=""
      width={144}
      height={144}
      unoptimized
      className={`${size} shrink-0 rounded object-cover`}
    />
  ) : (
    <span className={`${size} shrink-0 rounded bg-gray-100`} />
  );
}

function CheckMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-success"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * A card made from one tool result or pending action. Tool data is the source of truth; the card
 * shows it as returned. `readOnly` is for transcripts reviewed later (history, Seller Centre).
 */
export function AssistantCard({
  card,
  pending,
  onAction,
  getOptions,
  onEdit,
  checkedAt,
  spoken = false,
  readOnly = false,
}: {
  card: Card;
  pending: boolean;
  onAction: (action: Action, confirm: boolean) => void;
  getOptions: (id: string) => Promise<EditOptions>;
  onEdit: EditHandler;
  /** When the tool returned this card (ms). */
  checkedAt?: number;
  /** A voice call is live, so a cart change is confirmed by saying yes rather than typing it. */
  spoken?: boolean;
  readOnly?: boolean;
}) {
  const t = useT(messages);
  const { lang } = useLang();
  const time = checkedAt !== undefined ? formatClock(checkedAt, lang) : undefined;
  if (card.kind === 'action')
    return (
      <ActionCard
        action={card.action}
        pending={pending}
        onAction={onAction}
        getOptions={getOptions}
        onEdit={onEdit}
        spoken={spoken}
        readOnly={readOnly}
      />
    );
  if (card.kind === 'product')
    return (
      <div className={`${frame} border-line`}>
        <ProductDetails
          collapsible
          checkedAt={checkedAt}
          product={{ ...card, images: card.images?.length ? card.images : card.image ? [card.image] : [] }}
        />
      </div>
    );
  if (card.kind === 'products') return <ProductsCard card={card} time={time} t={t} />;
  if (card.kind === 'compare') return <CompareCard card={card} time={time} t={t} />;
  if (card.kind === 'cart')
    return (
      <div className={`${frame} border-line`}>
        <div className={header}>
          <strong className="text-[13px] font-semibold">{t('cartTitle')}</strong>
          {time && <span className="text-xs text-muted">{t('shopData', { time })}</span>}
        </div>
        {card.lines.length === 0 && <p className="px-3 py-2.5 text-muted">{t('emptyCart')}</p>}
        <ul className="divide-y divide-line-soft">
          {card.lines.map((line) => (
            <li key={`${line.item_id}-${line.model_id}`} className="flex justify-between gap-3 px-3 py-2">
              <Link
                href={`/products/${line.item_id}`}
                className="min-w-0 text-[13px] text-ink hover:text-primary"
              >
                <span className="line-clamp-2">{line.name}</span>
                <span className="text-xs text-muted">× {line.quantity}</span>
              </Link>
              <span className="shrink-0 text-[13px]">{formatVnd(line.price)}</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between gap-3 border-t border-line-soft px-3 py-2 font-semibold">
          <span>{t('total')}</span>
          <span className="text-primary">{formatVnd(card.total)}</span>
        </p>
        <Link href="/cart" className={footerLink}>
          {t('viewCart')}
        </Link>
      </div>
    );
  if (card.kind === 'order') {
    const status = orderStatusKey(card.status);
    const latest = card.tracking.at(-1);
    return (
      <div className={`${frame} border-line`}>
        <div className={header}>
          <strong className="text-[13px] font-semibold">{t('orderTitle', { sn: card.order_sn })}</strong>
          <span
            className={`flex items-center gap-1.5 text-xs font-medium ${SETTLED_ORDER.has(card.status) ? 'text-success' : 'text-muted'}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${SETTLED_ORDER.has(card.status) ? 'bg-success-dot' : 'bg-gray-400'}`}
              aria-hidden="true"
            />
            {status ? t(status) : card.status}
          </span>
        </div>
        {card.items && card.items.length > 0 && (
          <ul className="divide-y divide-line-soft">
            {card.items.map((line) => (
              <li
                key={`${line.item_id}-${line.model_id}`}
                className="flex justify-between gap-3 px-3 py-2 text-[13px]"
              >
                <span className="min-w-0">
                  {line.name}
                  {line.variant ? ` · ${line.variant}` : ''}{' '}
                  <span className="text-muted">× {line.quantity}</span>
                </span>
                <span className="shrink-0">{formatVnd(line.price)}</span>
              </li>
            ))}
          </ul>
        )}
        {latest && (
          <dl className="grid grid-cols-[30%_1fr] gap-x-3 gap-y-1 border-t border-line-soft px-3 py-2 text-xs">
            <dt className="text-muted">{t('latest')}</dt>
            <dd className="text-ink">
              {latest.description} · {formatDateTime(latest.time, lang)}
            </dd>
          </dl>
        )}
        <Link href={`/orders/${encodeURIComponent(card.order_sn)}`} className={footerLink}>
          {t('viewOrder')}
        </Link>
      </div>
    );
  }
  return (
    <div className={`${frame} flex items-center justify-between gap-3 border-line px-3 py-2.5`}>
      <span className="flex items-center gap-2 font-medium">
        <CheckMark />
        {t('handoff')}
      </span>
      <Link className="shrink-0 text-xs font-medium text-primary" href={`/messages/${card.ticket_id}`}>
        {t('viewMessage')}
      </Link>
    </div>
  );
}

function ProductsCard({
  card,
  time,
  t,
}: {
  card: Extract<Card, { kind: 'products' }>;
  time?: string;
  t: Translate;
}) {
  const [opened, setOpened] = useState<number | null>(null);
  return (
    <div className={`${frame} border-line`}>
      {card.items.length === 0 && <p className="px-3 py-2.5 text-muted">{t('noProducts')}</p>}
      <ul className="divide-y divide-line-soft">
        {card.items.map((item) => (
          <li key={item.item_id}>
            <div className="flex items-start gap-1">
              <Link
                href={`/products/${item.item_id}`}
                className="flex min-w-0 flex-1 gap-2.5 p-2.5 hover:bg-gray-50"
              >
                <Thumb src={item.image} size="h-[60px] w-[60px]" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 text-[13px] leading-snug text-ink">{item.name}</span>
                  <span className="text-[15px] font-semibold text-primary">
                    {formatVnd(item.price_min)}
                    {item.price_max !== item.price_min && ` – ${formatVnd(item.price_max)}`}
                  </span>
                  <span className="text-xs text-muted">
                    {item.stock > 0 ? t('stockLeft', { n: item.stock }) : t('outOfStock')}
                    {item.rating !== null && ` · ★ ${item.rating}`}
                    {time && ` · ${t('updatedAt', { time })}`}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                aria-expanded={opened === item.item_id}
                onClick={() => setOpened(opened === item.item_id ? null : item.item_id)}
                className="mt-2.5 mr-2 shrink-0 rounded-sm border border-line px-2 py-1 text-xs text-muted hover:border-primary hover:text-primary"
              >
                {opened === item.item_id ? t('hideDetails') : t('details')}
              </button>
            </div>
            {opened === item.item_id && (
              <div className="border-t border-line-soft">
                <ProductDetailsLoader itemId={item.item_id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompareCard({
  card,
  time,
  t,
}: {
  card: Extract<Card, { kind: 'compare' }>;
  time?: string;
  t: Translate;
}) {
  const keys = [...new Set(card.items.flatMap((item) => Object.keys(item.rows)))].sort((a, b) =>
    a === 'stock' ? -1 : b === 'stock' ? 1 : a === 'description' ? 1 : b === 'description' ? -1 : 0,
  );
  const label = (key: string) =>
    key === 'stock' ? t('compareStock') : key === 'description' ? t('compareDescription') : key;
  const cell = 'px-2.5 py-2 align-top';
  return (
    <div className={`${frame} border-line`}>
      <div className={header}>
        <strong className="text-[13px] font-semibold">{t('compareTitle')}</strong>
        {time && <span className="text-xs text-muted">{t('shopData', { time })}</span>}
      </div>
      {card.items.length === 0 ? (
        <p className="px-3 py-2.5 text-muted">{t('noProducts')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max table-fixed border-collapse text-xs">
            <thead>
              <tr>
                <th scope="col" className={`${cell} w-[26%]`}>
                  <span className="sr-only">{t('compareTitle')}</span>
                </th>
                {card.items.map((item) => (
                  <th key={item.item_id} scope="col" className={`${cell} w-[120px] text-left font-semibold`}>
                    <Link
                      href={`/products/${item.item_id}`}
                      className="flex flex-col gap-1 hover:text-primary"
                    >
                      <Thumb src={item.image} size="h-10 w-10" />
                      <span className="line-clamp-2 leading-snug">{item.name}</span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line-soft">
                <th scope="row" className={`${cell} text-left font-medium text-muted`}>
                  {t('comparePrice')}
                </th>
                {card.items.map((item) => (
                  <td key={item.item_id} className={`${cell} font-semibold text-primary`}>
                    {formatVnd(item.price_min)}
                  </td>
                ))}
              </tr>
              {keys.map((key) => (
                <tr key={key} className="border-t border-line-soft">
                  <th scope="row" className={`${cell} text-left font-medium text-muted`}>
                    {label(key)}
                  </th>
                  {card.items.map((item) => (
                    <td key={item.item_id} className={cell}>
                      <span className={key === 'description' ? 'line-clamp-4' : ''}>
                        {item.rows[key] ?? ''}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Countdown({ expiresAt }: { expiresAt: number }) {
  const t = useT(messages);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = secondsLeft(expiresAt, now) ?? 0;
  return (
    <span className="text-xs text-muted">
      {left > 0 ? t('expiresIn', { time: formatCountdown(left) }) : t('expired')}
    </span>
  );
}

function ActionCard({
  action,
  pending,
  onAction,
  getOptions,
  onEdit,
  spoken,
  readOnly,
}: {
  action: Action;
  pending: boolean;
  onAction: (action: Action, confirm: boolean) => void;
  getOptions: (id: string) => Promise<EditOptions>;
  onEdit: EditHandler;
  spoken: boolean;
  readOnly: boolean;
}) {
  const t = useT(messages);
  const te = useT(evidenceMessages);
  const [editingPhotos, setEditingPhotos] = useState(false);
  const { lang } = useLang();
  const open = action.status === 'PENDING';
  const done = action.status === 'EXECUTED';
  const order = action.type === 'PLACE_ORDER';
  const refund = action.type === 'OPEN_RETURN';
  const title = open
    ? order
      ? t('confirmOrderTitle')
      : refund
        ? t('confirmReturnTitle')
        : pickLanguage(action.summary.title, lang)
    : done
      ? order
        ? t('doneOrder')
        : refund
          ? t('doneReturn')
          : action.type === 'UPDATE_CART_ITEM'
            ? t('doneUpdate')
            : action.type === 'ADD_TO_CART'
              ? t('doneAdd')
              : action.type === 'CANCEL_RETURN'
                ? t('doneReturnCancelled')
                : action.type === 'ACCEPT_RETURN_OFFER'
                  ? t('doneOfferAccepted')
                  : pickLanguage(action.summary.title, lang)
      : pickLanguage(action.summary.title, lang);
  const state = done
    ? null
    : action.status === 'CANCELLED'
      ? t('cancelled')
      : action.status === 'EXPIRED'
        ? t('expired')
        : action.status === 'FAILED'
          ? t('failed')
          : null;
  const rows = summaryRows(action.summary.lines, lang, formatVnd);
  const editable =
    open &&
    !readOnly &&
    (action.type === 'ADD_TO_CART' ||
      action.type === 'UPDATE_CART_ITEM' ||
      action.type === 'OPEN_RETURN' ||
      order);
  return (
    <div className={`${frame} ${open ? 'border-primary' : 'border-line'}`} data-action-status={action.status}>
      <div
        className={`flex items-center justify-between gap-3 px-3 py-2 ${open ? 'bg-primary-soft' : 'border-b border-line-soft bg-gray-50'}`}
      >
        <strong
          className={`flex items-center gap-1.5 text-[13px] font-semibold ${open ? 'text-primary' : done ? 'text-success' : 'text-muted'}`}
        >
          {done && <CheckMark />}
          {title}
        </strong>
        {open && !readOnly && action.requires_tap && action.expires_at !== undefined && (
          <Countdown expiresAt={action.expires_at} />
        )}
        {open && !action.requires_tap && <span className="text-xs text-muted">{t('cartUnchanged')}</span>}
        {state && <span className="text-xs text-muted">{state}</span>}
      </div>
      {action.result?.message && <p className="px-3 pt-2 text-[13px] text-muted">{action.result.message}</p>}
      <dl className={`space-y-1 px-3 py-2.5 text-[13px] ${open || done ? '' : 'text-muted'}`}>
        {rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className="flex justify-between gap-3">
            <dt className="max-w-[55%] shrink-0 text-muted">{row.label}</dt>
            <dd className={`min-w-0 flex-1 text-right ${row.heard ? 'text-muted' : 'text-ink'}`}>
              {row.value}
            </dd>
          </div>
        ))}
        {action.summary.total !== undefined && (
          <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-1.5">
            <dt className="font-medium">{refund ? t('refund') : t('total')}</dt>
            <dd className="text-base font-semibold text-primary">{formatVnd(action.summary.total)}</dd>
          </div>
        )}
      </dl>
      {done && action.result?.order_sn && (
        <Link href={`/orders/${encodeURIComponent(action.result.order_sn)}`} className={footerLink}>
          {t('viewOrder')} · {action.result.order_sn}
        </Link>
      )}
      {done && action.result?.return_sn && (
        <Link href={`/returns/${encodeURIComponent(action.result.return_sn)}`} className={footerLink}>
          {t('viewReturn')} · {action.result.return_sn}
        </Link>
      )}
      {done && (action.type === 'ADD_TO_CART' || action.type === 'UPDATE_CART_ITEM') && (
        <Link href="/cart" className={footerLink}>
          {t('viewCart')}
        </Link>
      )}

      {action.type === 'OPEN_RETURN' && !readOnly && (
        <section aria-label={te('title')} className="space-y-2">
          <p className="text-xs text-gray-500">{te('review')}</p>
          <div className="flex flex-wrap gap-3">
            {action.summary.evidence?.evidence_ids.map((id, index) => (
              <EvidenceImage
                key={id}
                evidenceId={id}
                number={index + 1}
                fetchContent={buyerEvidenceContent}
              />
            ))}
          </div>
          {!action.summary.evidence?.evidence_ids.length && (
            <p className="text-xs text-gray-500">{te('noPhotos')}</p>
          )}
          {action.status === 'PENDING' && !readOnly && action.summary.evidence && (
            <EditPhotos
              key={action.action_id}
              action={action}
              pending={pending}
              onEdit={onEdit}
              onOpenChange={setEditingPhotos}
            />
          )}
        </section>
      )}
      {editable && (
        <div className="px-3 pb-2">
          <EditAction
            key={action.action_id}
            action={action}
            pending={pending}
            getOptions={getOptions}
            onEdit={onEdit}
          />
        </div>
      )}
      {open && !readOnly && action.requires_tap && (
        <div className="space-y-1 px-3 pb-3">
          <button
            type="button"
            disabled={pending || editingPhotos}
            className="flex min-h-11 w-full items-center justify-center rounded-sm bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            onClick={() => onAction(action, true)}
          >
            {order
              ? t('tapToOrder', { total: formatVnd(action.summary.total ?? 0) })
              : refund
                ? t('tapToReturn')
                : t('confirm')}
          </button>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending}
              className="min-h-8 px-2 text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
              onClick={() => onAction(action, false)}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
      {open && !readOnly && !action.requires_tap && (
        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-3 py-2">
          <span className="flex items-center gap-1.5 text-[13px] text-ink">
            {spoken && (
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-primary"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3" />
              </svg>
            )}
            {spoken ? t('confirmByVoice') : t('confirmByText')}
          </span>
          <button
            type="button"
            disabled={pending}
            className="min-h-8 shrink-0 rounded-sm border border-line px-3 text-xs text-ink hover:border-primary hover:text-primary disabled:opacity-50"
            onClick={() => onAction(action, false)}
          >
            {t('cancel')}
          </button>
        </div>
      )}
    </div>
  );
}

function EditAction({
  action,
  pending,
  getOptions,
  onEdit,
}: {
  action: Action;
  pending: boolean;
  getOptions: (id: string) => Promise<EditOptions>;
  onEdit: EditHandler;
}) {
  const t = useT(messages);
  const [options, setOptions] = useState<EditOptions>();
  const [error, setError] = useState(false);
  const field = 'rounded-sm border border-line bg-white px-2 py-1';
  if (!options)
    return (
      <>
        <button
          type="button"
          disabled={pending}
          className="min-h-8 text-xs text-muted underline-offset-2 hover:text-primary hover:underline"
          onClick={() =>
            void getOptions(action.action_id)
              .then(setOptions)
              .catch(() => setError(true))
          }
        >
          {t('editAction')}
        </button>
        {error && (
          <p role="alert" className="text-xs text-primary">
            {t('error')}
          </p>
        )}
      </>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-sm border border-line p-2 text-xs"
      onSubmit={(event) => {
        event.preventDefault();
        void onEdit(action, {
          quantity: options.quantity,
          model_id: options.model_id,
          line_index: options.line_index,
        }).catch(() => setError(true));
      }}
    >
      {error && <p role="alert">{t('error')}</p>}
      {options.lines.length > 1 && (
        <label className="flex w-full flex-col gap-1">
          {t('item')}
          <select
            className={field}
            value={options.line_index}
            onChange={(event) => {
              const line = options.lines.find((entry) => entry.line_index === Number(event.target.value));
              if (line) setOptions({ ...options, ...line });
            }}
          >
            {options.lines.map((line) => (
              <option key={line.line_index} value={line.line_index}>
                {line.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        {t('quantity')}
        <input
          className={`${field} w-20`}
          type="number"
          min={1}
          max={999}
          value={options.quantity}
          onChange={(event) => setOptions({ ...options, quantity: Number(event.target.value) })}
        />
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        {t('variant')}
        <select
          className={field}
          value={options.model_id}
          onChange={(event) => setOptions({ ...options, model_id: Number(event.target.value) })}
        >
          {options.models.map((model) => (
            <option key={model.model_id} value={model.model_id}>
              {model.name} ({t('stockLeft', { n: model.stock })})
            </option>
          ))}
        </select>
      </label>
      <button
        className="min-h-8 rounded-sm bg-ink px-3 font-semibold text-white disabled:opacity-50"
        disabled={
          pending || !Number.isInteger(options.quantity) || options.quantity < 1 || options.quantity > 999
        }
      >
        {t('saveAction')}
      </button>
    </form>
  );
}

function EditPhotos({
  action,
  pending,
  onEdit,
  onOpenChange,
}: {
  action: Action;
  pending: boolean;
  onEdit: (action: Action, input: { evidence_ids?: string[] }) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState(action.summary.evidence?.evidence_ids ?? []);
  const [chosen, setChosen] = useState<ReturnEvidence[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const orderSn = action.summary.evidence!.order_sn;
  const photos = useApi(
    () => (open ? getApiClient().buyer.returnEvidence.list(orderSn) : Promise.resolve([])),
    [open, orderSn],
  );
  if (!open)
    return (
      <button
        type="button"
        disabled={pending}
        className="text-xs font-medium text-primary underline"
        onClick={() => {
          setOpen(true);
          onOpenChange(true);
        }}
      >
        {t('editPhotos')}
      </button>
    );
  // Missing metadata must never silently drop a bound photo.
  const selected = chosen ?? (photos.data ?? []).filter((photo) => ids.includes(photo.evidence_id));
  return (
    <div className="space-y-2">
      {(failed || photos.error != null || (!photos.loading && selected.length !== ids.length)) && (
        <p role="alert" className="text-xs text-red-700">
          {t('error')}
        </p>
      )}
      {!photos.loading && photos.data && (
        <EvidencePicker
          key={orderSn}
          orderSn={orderSn}
          value={selected}
          onChange={(value) => {
            setIds(value.map((photo) => photo.evidence_id));
            setChosen(value);
          }}
          disabled={pending}
          onBusyChange={setUploading}
        />
      )}
      <button
        type="button"
        disabled={
          pending || uploading || photos.loading || photos.error != null || selected.length !== ids.length
        }
        className="rounded-full bg-ink px-3 py-2 text-xs text-white disabled:opacity-50"
        onClick={() => {
          setFailed(false);
          void onEdit(action, { evidence_ids: ids })
            .then(() => {
              setOpen(false);
              onOpenChange(false);
            })
            .catch(() => setFailed(true));
        }}
      >
        {t('saveAction')}
      </button>
      <button
        type="button"
        disabled={pending || uploading}
        className="ml-2 text-xs"
        onClick={() => {
          setIds(action.summary.evidence!.evidence_ids);
          setChosen(null);
          setOpen(false);
          onOpenChange(false);
        }}
      >
        {t('cancel')}
      </button>
    </div>
  );
}
