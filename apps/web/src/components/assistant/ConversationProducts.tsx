'use client';
import { useId, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useT } from '@/i18n';
import { messages } from './messages';
import type { ConversationProduct } from './conversation-products';

/** A compact, inspectable account of the product results held by this live conversation. */
export function ConversationProducts({ products }: { products: ConversationProduct[] }) {
  const t = useT(messages);
  const [expanded, setExpanded] = useState(true);
  const listId = useId();
  if (!products.length) return null;
  return (
    <section className="shrink-0 border-b border-line bg-white" aria-label={t('contextProducts')} data-testid="conversation-products">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={listId}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left hover:bg-gray-50"
      >
        <span className="text-xs font-semibold text-ink">{t('contextProducts')}</span>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary" aria-live="polite" aria-atomic="true">
          {products.length === 1 ? t('contextOneProduct') : t('contextProductCount', { n: products.length })}
        </span>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={`ml-auto h-4 w-4 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      <div id={listId} hidden={!expanded}>
        <p className="px-4 pb-2 text-xs leading-relaxed text-muted">{t('contextProductsHint')}</p>
        <ul className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto px-4 pb-3">
          {products.map((product) => (
            <li key={product.item_id} className="min-w-0">
              <Link href={`/products/${product.item_id}`} title={product.name} className="flex h-full min-h-11 flex-col gap-2 rounded-xl border border-line bg-gray-50/60 p-2 transition hover:border-primary/40 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span className="flex items-center gap-2">
                  {product.image
                    ? <Image src={product.image} alt="" width={64} height={64} unoptimized className="h-8 w-8 shrink-0 rounded-lg bg-white object-cover" />
                    : <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-lg bg-primary-soft" />}
                  <span className="text-[11px] font-medium text-muted">{product.sources.length ? product.sources.map((source) => t(source === 'voice' ? 'contextFromVoice' : 'contextFromText')).join(' · ') : t('contextFromChat')}</span>
                </span>
                <span className="line-clamp-3 text-xs leading-relaxed font-medium text-ink">{product.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
