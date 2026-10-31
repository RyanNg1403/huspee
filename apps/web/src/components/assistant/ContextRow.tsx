'use client';
import Image from 'next/image';
import { useT } from '@huspee/web-ui/i18n';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { messages, orderStatusKey } from '@huspee/web-ui/components/assistant/messages';
import { CloseGlyph, Spinner } from './icons';
import { ShopAvatar } from './PanelHeader';
import type { ViewedOrder, ViewedProduct } from './product-context';

const row = 'mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-lg bg-gray-100 py-1.5 pr-1.5 pl-2 text-[13px]';
const removeButton =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-gray-200 hover:text-ink';

function Thumb({ src }: { src?: string }) {
  return src ? (
    <Image src={src} alt="" width={56} height={56} unoptimized className="h-7 w-7 shrink-0 rounded object-cover" />
  ) : (
    <span className="h-7 w-7 shrink-0 rounded bg-gray-200" />
  );
}

/** What the buyer is looking at: the product (and variant) on screen, the order, or the shop. */
export function ContextRow({
  product,
  order,
  shopName,
  logo,
  updating,
  onRemove,
}: {
  product?: ViewedProduct;
  order?: ViewedOrder;
  shopName: string;
  logo?: string | null;
  /** The new product is still being sent to the running conversation. */
  updating: boolean;
  onRemove?: () => void;
}) {
  const t = useT(messages);
  if (product) {
    const detail = [product.variant, product.price !== undefined ? formatVnd(product.price) : undefined]
      .filter(Boolean)
      .join(' · ');
    return (
      <div className={row} data-testid="product-context-notice" aria-busy={updating}>
        <Thumb src={product.image} />
        <p className="flex min-w-0 flex-1 items-baseline gap-1" title={[product.name, detail].filter(Boolean).join(' · ')}>
          <span className="shrink-0 text-muted">{t('viewing')}</span>
          <span className="min-w-0 truncate font-medium text-ink">{product.name}</span>
          {detail && <span className="shrink-0 font-medium text-ink">· {detail}</span>}
        </p>
        {updating && (
          <span className="flex items-center" role="status">
            <Spinner />
            <span className="sr-only">{t('contextUpdating')}</span>
          </span>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={t('removeProduct')} className={removeButton}>
            <CloseGlyph className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }
  if (order) {
    const status = orderStatusKey(order.status);
    const subject = [t('viewingOrder', { sn: order.order_sn }), status ? t(status) : undefined].filter(Boolean).join(' · ');
    return (
      <div className={row} data-testid="order-context-notice">
        <Thumb src={order.image} />
        <p className="min-w-0 flex-1 truncate" title={subject}>
          <span className="text-muted">{t('viewing')}</span> <span className="font-medium text-ink">{subject}</span>
        </p>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={t('removeOrder')} className={removeButton}>
            <CloseGlyph className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className={`${row} py-2`}>
      <ShopAvatar name={shopName} logo={logo} size="h-6 w-6" />
      <p className="min-w-0 flex-1 truncate">
        <span className="text-muted">{t('viewing')}</span>{' '}
        <span className="font-medium text-ink">{t('viewingShop', { shop: shopName })}</span>
      </p>
    </div>
  );
}
