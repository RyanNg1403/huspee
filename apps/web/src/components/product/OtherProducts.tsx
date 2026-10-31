'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { InlineState } from '../shop/InlineState';
import { messages } from './messages';

const SHOWN = 6;

/** The shop's best sellers, without the product being viewed. */
export function OtherProducts({ shopId, itemId }: { shopId: number; itemId: number }) {
  const t = useT(messages);
  const products = useApi(
    () =>
      getApiClient().marketplace.searchProducts({ shop_id: shopId, sort: 'top_sales', page_size: SHOWN + 1 }),
    [shopId],
  );
  const others = products.data?.data.filter((p) => p.item_id !== itemId).slice(0, SHOWN) ?? [];
  return (
    <section aria-labelledby="other-products" className="bg-white p-3 sm:rounded-lg sm:p-4">
      <h2 id="other-products" className="mb-3 text-[15px] font-semibold">
        {t('otherProducts')}
      </h2>
      <InlineState {...products} retry={products.reload} className="h-40 w-full" />
      {products.data && others.length === 0 && <p className="text-muted">{t('noOtherProducts')}</p>}
      {others.length > 0 && (
        <ul className="flex flex-col gap-3">
          {others.map((p) => (
            <li key={p.item_id}>
              <Link href={`/products/${p.item_id}`} className="group flex gap-2.5">
                {p.image_url ? (
                  <Image
                    unoptimized
                    width={128}
                    height={128}
                    src={p.image_url}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded bg-gray-100 object-cover"
                  />
                ) : (
                  <span className="h-16 w-16 shrink-0 rounded bg-gray-100" />
                )}
                <span className="flex min-w-0 flex-col gap-0.5 text-[13px]">
                  <span className="line-clamp-2 group-hover:text-primary">{p.name}</span>
                  <strong className="font-semibold text-primary">
                    {p.price_min === p.price_max
                      ? formatVnd(p.price_min)
                      : t('fromPrice', { price: formatVnd(p.price_min) })}
                  </strong>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
