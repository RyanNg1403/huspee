'use client';
import Image from 'next/image';
import { useEffect, useRef, type ComponentProps } from 'react';
import { Button, Modal } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { messages } from './messages';
import { VariantPicker } from './VariantPicker';

export type SheetIntent = 'choose' | 'cart' | 'buy';

/** Phone bottom sheet for choosing a variation and quantity before adding or buying. */
export function VariantSheet({
  intent,
  onClose,
  image,
  onPurchase,
  pending,
  ...picker
}: ComponentProps<typeof VariantPicker> & {
  intent: SheetIntent;
  onClose: () => void;
  image?: string;
  onPurchase: (buyNow: boolean) => void;
  pending: boolean;
}) {
  const t = useT(messages);
  const body = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    body.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const { product, model } = picker;
  const price = model
    ? formatVnd(model.price)
    : product.price_min === product.price_max
      ? formatVnd(product.price_min)
      : `${formatVnd(product.price_min)} – ${formatVnd(product.price_max)}`;
  return (
    // Its own stacking layer, so the sheet also covers the fixed assistant dock.
    <div className="relative z-[60]">
      <Modal open onClose={onClose} title={t('variation')}>
        <div ref={body} className="flex flex-col gap-4">
          <div className="flex items-end gap-3 border-b border-line-soft pb-3">
            {image && (
              <Image
                unoptimized
                width={192}
                height={192}
                src={image}
                alt=""
                className="h-24 w-24 rounded-sm object-cover"
              />
            )}
            <div className="min-w-0">
              <div className="text-lg font-semibold text-primary">{price}</div>
              {model?.name && <div className="text-[13px] text-muted">{model.name}</div>}
            </div>
          </div>
          <VariantPicker {...picker} />
          <div className="flex gap-2">
            {intent !== 'buy' && (
              <Button
                variant={intent === 'choose' ? 'outline' : 'primary'}
                size="lg"
                loading={pending}
                onClick={() => onPurchase(false)}
                className="flex-1 rounded-sm"
              >
                {t('addToCart')}
              </Button>
            )}
            {intent !== 'cart' && (
              <Button
                size="lg"
                loading={pending}
                onClick={() => onPurchase(true)}
                className="flex-1 rounded-sm"
              >
                {t('buyNow')}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
