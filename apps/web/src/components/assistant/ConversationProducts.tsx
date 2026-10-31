'use client';
import { useId, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from '@huspee/web-ui/components/assistant/messages';
import { ChevronGlyph } from './icons';
import type { ConversationProduct } from './conversation-products';

/** Products the assistant's tools returned in this live conversation; collapsed to one line. */
export function ConversationProducts({ products }: { products: ConversationProduct[] }) {
  const t = useT(messages);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (!products.length) return null;
  return (
    <section
      className="assistant-context-products mx-4 mt-1 shrink-0 overflow-y-auto overscroll-contain"
      aria-label={t('contextProducts')}
      data-testid="conversation-products"
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={listId}
        className="flex min-h-8 w-full items-center gap-1.5 text-left text-xs text-muted hover:text-ink"
      >
        <span>{t('contextProducts')}</span>
        <span aria-hidden="true">·</span>
        <span aria-live="polite" aria-atomic="true">
          {products.length === 1 ? t('contextOneProduct') : t('contextProductCount', { n: products.length })}
        </span>
        <ChevronGlyph direction={expanded ? 'up' : 'down'} className="h-3.5 w-3.5" />
      </button>
      <ul id={listId} hidden={!expanded} className="flex gap-2 overflow-x-auto pb-2">
        {products.map((product) => (
          <li key={product.item_id} className="w-36 shrink-0">
            <Link
              href={`/products/${product.item_id}`}
              title={product.name}
              className="flex h-full items-center gap-2 rounded-lg border border-line p-1.5 hover:border-primary"
            >
              {product.image ? (
                <Image src={product.image} alt="" width={64} height={64} unoptimized className="h-8 w-8 shrink-0 rounded object-cover" />
              ) : (
                <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded bg-gray-100" />
              )}
              <span className="min-w-0">
                <span className="block text-[11px] text-muted">
                  {product.sources.length
                    ? product.sources.map((source) => t(source === 'voice' ? 'contextFromVoice' : 'contextFromText')).join(' · ')
                    : t('contextFromChat')}
                </span>
                <span className="line-clamp-2 text-xs leading-snug text-ink">{product.name}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
