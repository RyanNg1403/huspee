'use client';
import Link from 'next/link';
import type { PublicShop } from '@huspee/sdk';
import { useT } from '@huspee/web-ui/i18n';
import { AskAssistantButton, MicIcon } from '../shop/AskAssistant';
import { InlineState } from '../shop/InlineState';
import { OfficialBadge, ShopAvatar } from '../shop/ShopAvatar';
import { messages } from './messages';

type Query<T> = { data: T | null; loading: boolean; error: unknown; reload: () => void };

/** The selling shop with its figures, a link to the shop and the assistant entry point. */
export function ShopStrip({ shop, assistant }: { shop: Query<PublicShop>; assistant: boolean }) {
  const t = useT(messages);
  if (!shop.data) {
    return (
      <section className="bg-white p-3 sm:rounded-lg sm:p-5">
        <InlineState {...shop} retry={shop.reload} className="h-16 w-full" />
      </section>
    );
  }
  const s = shop.data;
  const rating = s.rating_count > 0 ? `${s.rating_star.toFixed(1)} (${s.rating_count})` : t('noRatingShort');
  return (
    <section
      aria-label={s.shop_name}
      className="flex flex-wrap items-center gap-x-8 gap-y-3 bg-white p-3 sm:rounded-lg sm:px-5 sm:py-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
        <ShopAvatar shop={s} className="h-11 w-11 text-base sm:h-16 sm:w-16 sm:text-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/shops/${s.shop_id}`}
              className="truncate font-semibold hover:text-primary sm:text-base"
            >
              {s.shop_name}
            </Link>
            {s.is_official && <OfficialBadge label={t('official')} />}
          </div>
          <p className="truncate text-[13px] text-muted sm:hidden">
            {[
              s.city,
              s.rating_count > 0 ? `★ ${s.rating_star.toFixed(1)}` : null,
              t('productCount', { count: s.item_count }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="mt-2 hidden gap-2 sm:flex">
            {assistant && (
              <AskAssistantButton className="flex h-9 items-center gap-1.5 rounded-sm border border-primary bg-primary-soft px-3.5 text-[13px] font-semibold text-primary-hover transition hover:bg-mic-ring">
                <MicIcon className="h-[15px] w-[15px]" />
                {t('askAssistant')}
              </AskAssistantButton>
            )}
            <Link
              href={`/shops/${s.shop_id}`}
              className="flex h-9 items-center rounded-sm border border-line-strong px-3.5 text-[13px] transition hover:bg-gray-50"
            >
              {t('viewShop')}
            </Link>
          </div>
        </div>
        <Link
          href={`/shops/${s.shop_id}`}
          className="flex h-8 shrink-0 items-center rounded-sm border border-primary px-3 text-[13px] text-primary-hover sm:hidden"
        >
          {t('viewShop')}
        </Link>
      </div>
      <dl className="hidden flex-1 grid-cols-3 gap-x-7 gap-y-2 border-l border-line pl-8 text-[13px] sm:grid">
        <div>
          <dt className="text-muted">{t('shopRating')}</dt>
          <dd className="mt-0.5 font-semibold">{rating}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('shopProducts')}</dt>
          <dd className="mt-0.5 font-semibold">{s.item_count}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('shipsFrom')}</dt>
          <dd className="mt-0.5 font-semibold">{s.city ?? t('noInfo')}</dd>
        </div>
      </dl>
    </section>
  );
}
