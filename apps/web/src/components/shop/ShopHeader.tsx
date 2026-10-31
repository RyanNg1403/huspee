'use client';
import type { ReactNode } from 'react';
import type { PublicShop, ShopPolicies } from '@huspee/sdk';
import { useT } from '@huspee/web-ui/i18n';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { AskAssistantButton, MicIcon } from './AskAssistant';
import { InlineState } from './InlineState';
import { messages } from './messages';
import { OfficialBadge, ShopAvatar } from './ShopAvatar';

type Policies = { data: ShopPolicies | null; loading: boolean; error: unknown; reload: () => void };

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

/** Shop identity on a dark block, with the shop's figures and policies beside it on wide screens. */
export function ShopHeader({
  shop,
  policies,
  assistant,
}: {
  shop: PublicShop;
  policies: Policies;
  assistant: boolean;
}) {
  const t = useT(messages);
  const rating =
    shop.rating_count > 0
      ? t('ratingValue', { star: shop.rating_star.toFixed(1), count: shop.rating_count })
      : t('noRating');
  return (
    <section
      aria-label={shop.shop_name}
      className="flex flex-col bg-white max-sm:-mx-4 max-sm:-mt-6 sm:flex-row sm:flex-wrap sm:gap-6 sm:rounded sm:p-5 sm:shadow-card"
    >
      <div className="flex flex-col gap-3.5 bg-gray-800 px-3 pt-4 pb-3.5 text-white sm:flex-[0_1_380px] sm:rounded sm:px-5 sm:py-4">
        <div className="flex items-center gap-3.5">
          <ShopAvatar shop={shop} className="h-14 w-14 border-2 border-white text-xl sm:h-16 sm:w-16" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h1 className="text-base font-semibold break-words sm:text-lg">{shop.shop_name}</h1>
              {shop.is_official && <OfficialBadge label={t('official')} />}
            </div>
            {shop.description && (
              <p className="mt-0.5 hidden text-[13px] text-white/85 sm:line-clamp-2">{shop.description}</p>
            )}
            <p className="mt-0.5 text-xs text-white/85 sm:hidden">
              {shop.rating_count > 0 && <>★ {shop.rating_star.toFixed(1)} · </>}
              {t('productCount', { count: shop.item_count })}
              {shop.city && <> · {shop.city}</>}
            </p>
          </div>
        </div>
        {assistant && (
          <AskAssistantButton className="flex h-9 items-center justify-center gap-1.5 rounded-sm border border-white text-[13px] transition hover:bg-white/10 sm:h-[34px]">
            <MicIcon className="h-[15px] w-[15px]" />
            <span className="sm:hidden">{t('askShop')}</span>
            <span className="hidden sm:inline">{t('askAssistant')}</span>
          </AskAssistantButton>
        )}
      </div>
      <dl className="hidden flex-[1_1_420px] content-center gap-x-8 gap-y-3.5 sm:grid sm:grid-cols-2">
        <Stat label={t('products')}>{shop.item_count}</Stat>
        <Stat label={t('rating')}>{rating}</Stat>
        <Stat label={t('shipsFrom')}>{shop.city ?? t('noInfo')}</Stat>
        {policies.data ? (
          <>
            <Stat label={t('warranty')}>{policies.data.warranty_policy || t('noInfo')}</Stat>
            <Stat label={t('returns')}>{t('returnDays', { days: policies.data.return_window_days })}</Stat>
            {policies.data.free_shipping_min_spend != null && (
              <Stat label={t('freeShipping')}>
                {t('ordersFrom', { amount: formatVnd(policies.data.free_shipping_min_spend) })}
              </Stat>
            )}
          </>
        ) : (
          <div>
            <InlineState {...policies} retry={policies.reload} />
          </div>
        )}
      </dl>
    </section>
  );
}
