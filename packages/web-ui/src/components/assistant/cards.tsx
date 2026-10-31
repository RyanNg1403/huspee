'use client';
import Link from 'next/link';
import { useState } from 'react';
import Image from 'next/image';
import { useT } from '@huspee/web-ui/i18n';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { messages } from '@huspee/web-ui/components/assistant/messages';
import { ProductDetails, ProductDetailsLoader } from '@huspee/web-ui/components/assistant/product-details';

import type { Action, Card } from '@huspee/web-ui/components/assistant/card-types';
export type { Action, Card } from '@huspee/web-ui/components/assistant/card-types';

export function AssistantCard({
  card,
  pending,
  onAction,
  getOptions,
  onEdit,
}: {
  card: Card;
  pending: boolean;
  onAction: (action: Action, confirm: boolean) => void;
  getOptions: (id: string) => Promise<EditOptions>;
  onEdit: (
    action: Action,
    input: { quantity: number; model_id: number; line_index?: number },
  ) => Promise<void>;
}) {
  const t = useT(messages);
  const [opened, setOpened] = useState<number | null>(null);
  const thumb = (src: string | null, size = 'h-14 w-14') =>
    src ? (
      <Image
        src={src}
        alt=""
        width={112}
        height={112}
        unoptimized
        className={`${size} shrink-0 rounded-xl object-cover ring-1 ring-line`}
      />
    ) : (
      <span className={`${size} shrink-0 rounded-xl bg-gray-100`} />
    );
  const row = 'flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-gray-50';
  const statusTone =
    card.kind === 'action'
      ? card.action.status === 'PENDING'
        ? 'bg-amber-50 text-amber-700'
        : card.action.status === 'EXECUTED'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-gray-100 text-gray-600'
      : '';
  return (
    <div
      className={`space-y-2 rounded-2xl border bg-white p-3 text-sm break-words shadow-card ${
        card.kind === 'action' && card.action.status === 'PENDING'
          ? 'border-primary/40 ring-4 ring-primary/5'
          : 'border-line'
      }`}
    >
      {card.kind === 'products' && card.items.length === 0 && (
        <p className="text-gray-500">{t('noProducts')}</p>
      )}
      {card.kind === 'products' &&
        card.items.map((item) => (
          <div key={item.item_id} className="rounded-xl">
            <div className="flex items-center gap-1">
              <Link href={`/products/${item.item_id}`} className={`${row} min-w-0 flex-1`}>
                {thumb(item.image)}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-medium text-gray-800">{item.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                    <span className="text-sm font-semibold text-primary tabular-nums">
                      {formatVnd(item.price_min)}
                      {item.price_max !== item.price_min && ` – ${formatVnd(item.price_max)}`}
                    </span>
                    <span>
                      {t('stock')}: {item.stock}
                    </span>
                    {item.rating !== null && (
                      <span>
                        <span className="text-amber-400">★</span> {item.rating}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                aria-expanded={opened === item.item_id}
                onClick={() => setOpened(opened === item.item_id ? null : item.item_id)}
                className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:border-primary/40 hover:text-primary"
              >
                {opened === item.item_id ? t('hideDetails') : t('details')}
              </button>
            </div>
            {opened === item.item_id && (
              <div className="mt-2 border-t border-line pt-3">
                <ProductDetailsLoader itemId={item.item_id} />
              </div>
            )}
          </div>
        ))}
      {card.kind === 'product' && (
        <ProductDetails
          product={{
            ...card,
            images: card.images?.length ? card.images : card.image ? [card.image] : [],
          }}
        />
      )}
      {card.kind === 'compare' && card.items.length === 0 && (
        <p className="text-gray-500">{t('noProducts')}</p>
      )}
      {card.kind === 'compare' && card.items.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {card.items.map((item) => (
            <Link
              key={item.item_id}
              href={`/products/${item.item_id}`}
              className="space-y-1.5 rounded-xl bg-gray-50 p-2 transition hover:bg-gray-100"
            >
              {thumb(item.image, 'h-20 w-full')}
              <span className="line-clamp-2 text-xs font-medium text-gray-800">{item.name}</span>
              <span className="block text-sm font-semibold text-primary tabular-nums">
                {formatVnd(item.price_min)}
              </span>
              {Object.entries(item.rows).map(([key, value]) => (
                <span key={key} className="block text-[11px] text-gray-500">
                  <span className="text-gray-400">{key}:</span> {value}
                </span>
              ))}
            </Link>
          ))}
        </div>
      )}
      {card.kind === 'cart' && (
        <>
          {card.lines.length === 0 && <p className="text-gray-500">{t('emptyCart')}</p>}
          {card.lines.map((line) => (
            <p key={`${line.item_id}-${line.model_id}`} className="flex justify-between gap-3">
              <span className="min-w-0 text-gray-700">
                <span className="line-clamp-1">{line.name}</span>
                <span className="text-xs text-gray-400">× {line.quantity}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatVnd(line.price)}</span>
            </p>
          ))}
          <p className="flex justify-between border-t border-line pt-2 font-semibold">
            <span>{t('total')}</span>
            <span className="text-primary tabular-nums">{formatVnd(card.total)}</span>
          </p>
        </>
      )}
      {card.kind === 'order' && (
        <>
          <p className="flex items-center justify-between gap-2">
            <strong className="font-mono text-xs">{card.order_sn}</strong>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              {card.status}
            </span>
          </p>
          {card.items?.map((line) => (
            <p key={`${line.item_id}-${line.model_id}`} className="flex justify-between gap-3 text-gray-700">
              <span>
                {line.name}
                {line.variant ? ` (${line.variant})` : ''}{' '}
                <span className="text-gray-400">× {line.quantity}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatVnd(line.price)}</span>
            </p>
          ))}
          {card.tracking.length > 0 && (
            <>
              <p className="pt-1 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                {t('tracking')}
              </p>
              <ol className="space-y-1.5 border-l-2 border-line pl-3">
                {card.tracking.map((entry, i) => (
                  <li
                    key={`${entry.time}-${i}`}
                    className={`text-xs ${i === 0 ? 'font-medium text-gray-800' : 'text-gray-500'}`}
                  >
                    {entry.description}
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
      {card.kind === 'handoff' && (
        <Link
          className="flex items-center justify-between gap-2 font-medium text-primary"
          href={`/messages/${card.ticket_id}`}
        >
          {t('handoff')}
          <span aria-hidden="true">→</span>
        </Link>
      )}
      {card.kind === 'action' && (
        <>
          <div className="flex items-start justify-between gap-2">
            <strong className="font-semibold text-ink">{card.action.summary.title}</strong>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusTone}`}>
              {card.action.status === 'PENDING'
                ? t('pending')
                : card.action.status === 'EXECUTED'
                  ? t('executed')
                  : card.action.status === 'CANCELLED'
                    ? t('cancelled')
                    : card.action.status === 'EXPIRED'
                      ? t('expired')
                      : t('failed')}
            </span>
          </div>
          {card.action.result?.order_sn && <p className="font-mono text-xs">{card.action.result.order_sn}</p>}
          {card.action.result?.return_sn && (
            <p className="font-mono text-xs">{card.action.result.return_sn}</p>
          )}
          {card.action.result?.message && <p className="text-gray-600">{card.action.result.message}</p>}
          <dl className="space-y-1 rounded-xl bg-gray-50 p-2.5 text-xs">
            {card.action.summary.lines.map((line, i) => (
              <div key={`${line.label}-${i}`} className="flex justify-between gap-3">
                <dt className="text-gray-500">{line.label}</dt>
                <dd className="text-right font-medium text-gray-800">{line.value}</dd>
              </div>
            ))}
            {card.action.summary.total !== undefined && (
              <div className="flex justify-between gap-3 border-t border-line pt-1.5 text-sm">
                <dt className="font-semibold">{t('total')}</dt>
                <dd className="font-semibold text-primary tabular-nums">
                  {formatVnd(card.action.summary.total)}
                </dd>
              </div>
            )}
          </dl>
          {card.action.status === 'PENDING' &&
            (card.action.type === 'ADD_TO_CART' ||
              card.action.type === 'UPDATE_CART_ITEM' ||
              card.action.type === 'OPEN_RETURN' ||
              card.action.type === 'PLACE_ORDER') && (
              <EditAction
                key={card.action.action_id}
                action={card.action}
                pending={pending}
                getOptions={getOptions}
                onEdit={onEdit}
              />
            )}
          {card.action.status === 'PENDING' && card.action.requires_tap && (
            <div className="flex gap-2 pt-1">
              <button
                disabled={pending}
                className="h-10 flex-1 rounded-full bg-primary text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
                onClick={() => onAction(card.action, true)}
              >
                {t('confirm')}
              </button>
              <button
                disabled={pending}
                className="h-10 rounded-full border border-line px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                onClick={() => onAction(card.action, false)}
              >
                {t('cancel')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
function EditAction({
  action,
  pending,
  getOptions,
  onEdit,
}: {
  action: Action;
  pending: boolean;
  getOptions: (id: string) => Promise<EditOptions>;
  onEdit: (
    action: Action,
    input: { quantity: number; model_id: number; line_index?: number },
  ) => Promise<void>;
}) {
  const t = useT(messages);
  const [options, setOptions] = useState<EditOptions>();
  const [error, setError] = useState(false);
  if (!options)
    return (
      <>
        <button
          disabled={pending}
          className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-primary hover:underline"
          onClick={() =>
            void getOptions(action.action_id)
              .then(setOptions)
              .catch(() => setError(true))
          }
        >
          {t('editAction')}
        </button>
        {error && <p role="alert">{t('error')}</p>}
      </>
    );
  return (
    <form
      className="space-y-2 rounded-xl border border-line p-2.5 text-xs"
      onSubmit={(event) => {
        event.preventDefault();
        void onEdit(action, {
          quantity: options.quantity,
          model_id: options.model_id,
          line_index: options.line_index,
        });
      }}
    >
      {options.lines.length > 1 && (
        <label className="block">
          {t('item')}{' '}
          <select
            className="ml-1 rounded-lg border border-line bg-white px-2 py-1"
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
      <label className="block">
        {t('quantity')}{' '}
        <input
          className="ml-1 w-20 rounded-lg border border-line px-2 py-1"
          type="number"
          min={1}
          max={999}
          value={options.quantity}
          onChange={(event) => setOptions({ ...options, quantity: Number(event.target.value) })}
        />
      </label>
      <label className="block">
        {t('variant')}{' '}
        <select
          className="ml-1 rounded-lg border border-line bg-white px-2 py-1"
          value={options.model_id}
          onChange={(event) => setOptions({ ...options, model_id: Number(event.target.value) })}
        >
          {options.models.map((model) => (
            <option key={model.model_id} value={model.model_id}>
              {model.name} ({t('stock')}: {model.stock})
            </option>
          ))}
        </select>
      </label>
      <button
        className="h-8 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
        disabled={
          pending || !Number.isInteger(options.quantity) || options.quantity < 1 || options.quantity > 999
        }
      >
        {t('saveAction')}
      </button>
    </form>
  );
}
