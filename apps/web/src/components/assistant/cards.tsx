'use client';
import Link from 'next/link';
import { useState } from 'react';
import Image from 'next/image';
import { useT } from '@/i18n';
import { formatVnd } from '@/lib/format';
import { messages } from './messages';

import type { Action, Card } from './card-types';
export type { Action, Card } from './card-types';

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
  return (
    <div className="space-y-2 rounded border border-orange-200 bg-white p-3 text-sm break-words">
      {card.kind === 'products' &&
        card.resolution &&
        card.resolution.resolved_from !== card.resolution.resolved_to && (
          <p>
            {t('heard')}: {card.resolution.resolved_from} → {card.resolution.resolved_to}
          </p>
        )}
      {card.kind === 'products' && card.items.length === 0 && <p>{t('noProducts')}</p>}
      {card.kind === 'products' &&
        card.items.map((item) => (
          <div key={item.item_id}>
            {item.image && (
              <Image
                src={item.image}
                alt=""
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 object-cover"
              />
            )}
            <Link className="text-[#ee4d2d]" href={`/products/${item.item_id}`}>
              {item.name}
            </Link>
            <p>
              {formatVnd(item.price_min)}
              {item.price_max !== item.price_min && ` – ${formatVnd(item.price_max)}`} · {t('stock')}:{' '}
              {item.stock}
            </p>
            {item.rating !== null && <p>★ {item.rating}</p>}
          </div>
        ))}
      {card.kind === 'product' && (
        <>
          {card.image && (
            <Image
              src={card.image}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 object-cover"
            />
          )}
          <Link className="text-[#ee4d2d]" href={`/products/${card.item_id}`}>
            {card.name}
          </Link>
          {card.models.map((model) => (
            <p key={model.model_id}>
              {model.name} · {formatVnd(model.price)} · {t('stock')}: {model.stock}
            </p>
          ))}
        </>
      )}
      {card.kind === 'compare' && card.items.length === 0 && <p>{t('noProducts')}</p>}
      {card.kind === 'compare' &&
        card.items.map((item) => (
          <div key={item.item_id}>
            {item.image && (
              <Image
                src={item.image}
                alt=""
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 object-cover"
              />
            )}
            <Link className="text-[#ee4d2d]" href={`/products/${item.item_id}`}>
              {item.name}
            </Link>
            <p>{formatVnd(item.price_min)}</p>
            {Object.entries(item.rows).map(([key, value]) => (
              <p key={key}>
                {key}: {value}
              </p>
            ))}
          </div>
        ))}
      {card.kind === 'cart' && (
        <>
          {card.lines.length === 0 && <p>{t('emptyCart')}</p>}
          {card.lines.map((line) => (
            <p key={`${line.item_id}-${line.model_id}`}>
              {line.name} × {line.quantity} · {formatVnd(line.price)}
            </p>
          ))}
          <strong>
            {t('total')}: {formatVnd(card.total)}
          </strong>
        </>
      )}
      {card.kind === 'order' && (
        <>
          <strong>
            {card.order_sn} · {card.status}
          </strong>
          {card.items?.map((line) => (
            <p key={`${line.item_id}-${line.model_id}`}>
              {line.name}
              {line.variant ? ` (${line.variant})` : ''} × {line.quantity} · {formatVnd(line.price)}
            </p>
          ))}
          <p>{t('tracking')}</p>
          {card.tracking.map((entry, i) => (
            <p key={`${entry.time}-${i}`}>{entry.description}</p>
          ))}
        </>
      )}
      {card.kind === 'handoff' && (
        <Link className="text-[#ee4d2d]" href={`/messages/${card.ticket_id}`}>
          {t('handoff')}
        </Link>
      )}
      {card.kind === 'action' && (
        <>
          <strong>{card.action.summary.title}</strong>
          <p>
            {card.action.status === 'PENDING'
              ? t('pending')
              : card.action.status === 'EXECUTED'
                ? t('executed')
                : card.action.status === 'CANCELLED'
                  ? t('cancelled')
                  : card.action.status === 'EXPIRED'
                    ? t('expired')
                    : t('failed')}
          </p>
          {card.action.result?.order_sn && <p>{card.action.result.order_sn}</p>}
          {card.action.result?.return_sn && <p>{card.action.result.return_sn}</p>}
          {card.action.result?.message && <p>{card.action.result.message}</p>}
          {card.action.summary.lines.map((line, i) => (
            <p key={`${line.label}-${i}`}>
              {line.label}: {line.value}
            </p>
          ))}
          {card.action.summary.total !== undefined && (
            <p>
              {t('total')}: {formatVnd(card.action.summary.total)}
            </p>
          )}
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
            <div className="flex gap-2">
              <button
                disabled={pending}
                className="rounded bg-[#ee4d2d] px-3 py-2 text-white disabled:opacity-50"
                onClick={() => onAction(card.action, true)}
              >
                {t('confirm')}
              </button>
              <button
                disabled={pending}
                className="rounded border px-3 py-2 disabled:opacity-50"
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
          className="rounded border px-3 py-2"
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
      className="space-y-2"
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
            className="rounded border"
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
          className="w-20 rounded border"
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
          className="rounded border"
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
        className="rounded border px-3 py-2"
        disabled={
          pending || !Number.isInteger(options.quantity) || options.quantity < 1 || options.quantity > 999
        }
      >
        {t('saveAction')}
      </button>
    </form>
  );
}
