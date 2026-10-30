'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useT } from '@/i18n';
import { formatVnd } from '@/lib/format';
import { messages } from './messages';

export type Action = {
  action_id: string;
  status: string;
  requires_tap: boolean;
  summary: { title: string; lines: Array<{ label: string; value: string }>; total?: number };
  result?: { order_sn?: string; return_sn?: string; message?: string };
};
export type Card =
  | {
      kind: 'products';
      items: Array<{
        item_id: number;
        name: string;
        image: string | null;
        rating: number | null;
        price_min: number;
        price_max: number;
        stock: number;
      }>;
    }
  | {
      kind: 'product';
      item_id: number;
      name: string;
      image: string | null;
      models: Array<{ model_id: number; name: string; price: number; stock: number }>;
    }
  | {
      kind: 'compare';
      items: Array<{
        item_id: number;
        name: string;
        image: string | null;
        price_min: number;
        rows: Record<string, string>;
      }>;
    }
  | {
      kind: 'cart';
      lines: Array<{ item_id: number; model_id: number; name: string; quantity: number; price: number }>;
      total: number;
    }
  | {
      kind: 'order';
      order_sn: string;
      status: string;
      tracking: Array<{ time: number; description: string }>;
    }
  | { kind: 'handoff'; ticket_id: number }
  | { kind: 'action'; action: Action };

export function AssistantCard({
  card,
  pending,
  onAction,
}: {
  card: Card;
  pending: boolean;
  onAction: (action: Action, confirm: boolean) => void;
}) {
  const t = useT(messages);
  return (
    <div className="space-y-2 rounded border border-orange-200 bg-white p-3 text-sm break-words">
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
