'use client';

import Link from 'next/link';
import type { Action } from '@huspee/web-ui/components/assistant/card-types';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { pickLang, type Outcome, type ToolEntry } from '../conversation-log';
import { conversationMessages } from './messages';

type Key = keyof (typeof conversationMessages)['vi'];
const TOOL_LABELS: Record<string, Key> = {
  search_products: 'toolSearch',
  get_viewed_product: 'toolViewed',
  get_product_details: 'toolDetails',
  compare_products: 'toolCompare',
  get_vouchers: 'toolVouchers',
  get_shipping_info: 'toolShipping',
  get_return_policy: 'toolReturnPolicy',
  get_shop_faqs: 'toolFaqs',
  get_cart: 'toolCart',
  get_order_status: 'toolOrderStatus',
  add_to_cart: 'toolAddToCart',
  update_cart_item: 'toolUpdateCart',
  place_order: 'toolPlaceOrder',
  open_return: 'toolOpenReturn',
  confirm_action: 'toolConfirm',
  handoff_to_seller: 'toolHandoff',
};
const ACTION_STATUS: Record<string, Key> = {
  PENDING: 'actionPending',
  EXECUTED: 'actionExecuted',
  CANCELLED: 'actionCancelled',
  EXPIRED: 'actionExpired',
};

export function useToolLabel() {
  const t = useT(conversationMessages);
  return (tool: string) => t(TOOL_LABELS[tool] ?? 'toolOther');
}

const priceRange = (min: number, max: number) =>
  min === max ? formatVnd(min) : `${formatVnd(min)} – ${formatVnd(max)}`;
const OrderLink = ({ orderSn }: { orderSn: string }) => (
  <Link href={`/orders/${encodeURIComponent(orderSn)}`} className="text-link hover:underline">
    {orderSn}
  </Link>
);

/** What the assistant asked the tool, in words; null when the tool takes nothing worth showing. */
export function useToolInput() {
  const t = useT(conversationMessages);
  return ({ tool, input }: ToolEntry): string | null => {
    const parts: string[] = [];
    if (input.viewed) parts.push(t('inViewed'));
    if (input.products.length) parts.push(input.products.join('; '));
    else if (input.query) parts.push(t('inQuery', { query: input.query }));
    if (input.question) parts.push(input.question);
    parts.push(...input.attributes);
    if (input.priceMin !== undefined && input.priceMax !== undefined)
      parts.push(t('inPriceRange', { min: formatVnd(input.priceMin), max: formatVnd(input.priceMax) }));
    else if (input.priceMax !== undefined) parts.push(t('inPriceMax', { max: formatVnd(input.priceMax) }));
    else if (input.priceMin !== undefined) parts.push(t('inPriceMin', { min: formatVnd(input.priceMin) }));
    if (input.quantity !== undefined) parts.push(t('inQuantity', { count: input.quantity }));
    if (input.voucher) parts.push(t('inVoucher', { code: input.voucher }));
    if (input.orderSn) parts.push(t('inOrder', { orderSn: input.orderSn }));
    else if (tool === 'get_order_status') parts.push(t('inLatestOrders'));
    return parts.length ? parts.join(' · ') : null;
  };
}

function ActionText({ action }: { action: Action }) {
  const t = useT(conversationMessages);
  const { lang } = useLang();
  const parts = [pickLang(action.summary.title, lang), t(ACTION_STATUS[action.status] ?? 'actionFailed')];
  if (action.summary.total !== undefined) parts.push(formatVnd(action.summary.total));
  return (
    <>
      {parts.join(' · ')}
      {action.result?.order_sn && (
        <>
          {' · '}
          <OrderLink orderSn={action.result.order_sn} />
        </>
      )}
      {action.result?.return_sn && ` · ${action.result.return_sn}`}
    </>
  );
}

export function ToolOutputText({ entry }: { entry: ToolEntry }) {
  const t = useT(conversationMessages);
  const out = entry.output;
  switch (out.kind) {
    case 'products':
      if (!out.names.length) return <>{t('outNoProducts')}</>;
      return out.closest ? (
        <>{t('outClosest', { names: out.names.join(', ') })}</>
      ) : (
        <>{t('outProducts', { count: out.names.length, names: out.names.join(', ') })}</>
      );
    case 'product':
      return (
        <>
          {t('outProduct', {
            price: priceRange(out.priceMin, out.priceMax),
            stock: out.stock,
            variants: out.variants,
          })}
        </>
      );
    case 'missing':
      return <>{t('outMissing', { attribute: out.attribute, value: out.value })}</>;
    case 'out_of_stock':
      return <>{t('outOutOfStock')}</>;
    case 'compare':
      return <>{t('outCompare', { count: out.names.length })}</>;
    case 'vouchers':
      return (
        <>
          {out.codes.length
            ? t('outVouchers', { count: out.codes.length, codes: out.codes.join(', ') })
            : t('outNoVouchers')}
        </>
      );
    case 'shipping':
      return (
        <>
          {out.channels.length
            ? t('outShipping', { channels: out.channels.join(', ') })
            : t('outShippingPolicy')}
        </>
      );
    case 'return_policy':
      return <>{out.days !== null ? t('outReturnDays', { days: out.days }) : t('outReturnPolicy')}</>;
    case 'faqs':
      return <>{out.count ? t('outFaqs', { count: out.count }) : t('outNoFaqs')}</>;
    case 'cart':
      return <>{t('outCart', { count: out.lines, total: formatVnd(out.total) })}</>;
    case 'action':
      return <ActionText action={out.action} />;
    case 'order': {
      const [before, after] = t('outOrder', { status: out.status }).split('{orderSn}');
      return (
        <>
          {before}
          <OrderLink orderSn={out.orderSn} />
          {after}
        </>
      );
    }
    case 'orders':
      return <>{t('outOrders', { count: out.count })}</>;
    case 'handoff':
      return (
        <Link href={`/inbox/${out.ticketId}`} className="text-link hover:underline">
          {t('outHandoff')}
        </Link>
      );
    case 'not_viewing':
      return <>{t('outNotViewing')}</>;
    case 'failed':
      return <span className="text-primary">{t('outFailed')}</span>;
    case 'none':
      return <span className="text-subtle">—</span>;
  }
}

/** The furthest step a conversation reached; links open the handoff in the inbox. */
export function OutcomeText({ outcome }: { outcome: Outcome }) {
  const t = useT(conversationMessages);
  switch (outcome.kind) {
    case 'order_placed':
      return (
        <>
          {outcome.total !== undefined
            ? t('outcomeOrderPlaced', { total: formatVnd(outcome.total) })
            : t('outcomeOrderPlacedPlain')}
          {outcome.orderSn && (
            <>
              {' · '}
              <OrderLink orderSn={outcome.orderSn} />
            </>
          )}
        </>
      );
    case 'order_quote':
      return (
        <>
          {outcome.total !== undefined
            ? t('outcomeOrderQuote', { total: formatVnd(outcome.total) })
            : t('outcomeOrderQuotePlain')}
        </>
      );
    case 'return_request':
      return <>{t('outcomeReturn')}</>;
    case 'cart':
      return <>{t('outcomeCart')}</>;
    case 'handoff':
      return <>{t('outcomeHandoff')}</>;
    case 'missing':
      return <>{t('outcomeMissing')}</>;
    case 'unanswered':
      return <>{t('outcomeUnanswered')}</>;
    case 'asked':
      return <>{t('outcomeAsked')}</>;
    case 'none':
      return <span className="text-subtle">—</span>;
  }
}
