'use client';
import { useEffect, useState } from 'react';
import type { ProductSummary, PublicShop } from '@huspee/sdk';
import { getApiClient } from '@huspee/web-ui/lib/api';

export type SuggestionOption =
  | { kind: 'query' | 'history'; id: string; keyword: string; href: string }
  | { kind: 'product'; id: string; product: ProductSummary; href: string }
  | { kind: 'shop'; id: string; shop: PublicShop; href: string };

interface Matches {
  q: string;
  products: ProductSummary[];
  shop: PublicShop | null;
}

export const keywordHref = (keyword: string) => `/search?q=${encodeURIComponent(keyword.trim())}`;

/** Products and a shop whose names match the keyword, from the public marketplace search. */
function useMatches(query: string, enabled: boolean): Matches | null {
  const q = query.trim();
  const [matches, setMatches] = useState<Matches | null>(null);
  useEffect(() => {
    if (!enabled || !q) return;
    let active = true;
    const timer = setTimeout(() => {
      const api = getApiClient().marketplace;
      Promise.all([api.searchProducts({ q, page_size: 5 }), api.listShops({ q, page_size: 1 })])
        .then(([products, shops]) => {
          if (active) setMatches({ q, products: products.data, shop: shops.data[0] ?? null });
        })
        .catch(() => {
          if (active) setMatches({ q, products: [], shop: null });
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, enabled]);
  return matches?.q === q ? matches : null;
}

/** The typed keyword, then matching products and shop; recent keywords while the box is empty. */
export function useSearchSuggestions(query: string, enabled: boolean, history: string[]): SuggestionOption[] {
  const matches = useMatches(query, enabled);
  const q = query.trim();
  if (!q)
    return history.map((keyword, i) => ({
      kind: 'history',
      id: `h${i}`,
      keyword,
      href: keywordHref(keyword),
    }));
  return [
    { kind: 'query', id: 'q', keyword: q, href: keywordHref(q) },
    ...(matches?.products ?? []).map((product) => ({
      kind: 'product' as const,
      id: `p${product.item_id}`,
      product,
      href: `/products/${product.item_id}`,
    })),
    ...(matches?.shop
      ? [
          {
            kind: 'shop' as const,
            id: `s${matches.shop.shop_id}`,
            shop: matches.shop,
            href: `/shops/${matches.shop.shop_id}`,
          },
        ]
      : []),
  ];
}
