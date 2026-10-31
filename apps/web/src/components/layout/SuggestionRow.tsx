'use client';
import Image from 'next/image';
import { SearchIcon } from '@huspee/web-ui/components/icons';
import { useT } from '@huspee/web-ui/i18n';
import { ShopAvatar } from '@/components/catalog';
import { NextIcon } from './icons';
import { messages } from './messages';
import type { SuggestionOption } from './use-search-suggestions';

/** Bolds the first case-insensitive occurrence of `query` in `text`. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}

/** Visual content of one suggestion; the caller supplies the link or option element. */
export function SuggestionRow({ option, query }: { option: SuggestionOption; query: string }) {
  const t = useT(messages);
  if (option.kind === 'shop') {
    const { shop } = option;
    return (
      <>
        <ShopAvatar shop={shop} className="h-8 w-8 text-[11px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            <Highlight text={shop.shop_name} query={query} />
          </span>
          <span className="block truncate text-xs text-muted">
            {t('shopSuggestion', { count: shop.item_count })}
            {shop.city ? ` · ${shop.city}` : ''}
          </span>
        </span>
        <NextIcon className="h-3.5 w-3.5 shrink-0 text-subtle" />
      </>
    );
  }
  if (option.kind === 'product') {
    const { product } = option;
    return (
      <>
        <span className="flex h-7 w-7 shrink-0 overflow-hidden rounded-sm bg-gray-100">
          {product.image_url && (
            <Image
              unoptimized
              width={56}
              height={56}
              src={product.image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <Highlight text={product.name} query={query} />
        </span>
      </>
    );
  }
  return (
    <>
      <SearchIcon className="h-4 w-4 shrink-0 text-subtle" />
      <span className="min-w-0 flex-1 truncate">
        {option.kind === 'query' ? (
          <strong className="font-semibold">{option.keyword}</strong>
        ) : (
          option.keyword
        )}
      </span>
    </>
  );
}
