'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { ProductDetail } from '@huspee/sdk';
import { VoiceWidget } from '@/components/assistant/VoiceWidget';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatCount } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { useAssistantEnabled } from '../shop/AskAssistant';
import { categoryPath } from '../shop/categories';
import { OfficialBadge } from '../shop/ShopAvatar';
import { VoucherTicket } from '../shop/VoucherTicket';
import { vouchersForItem } from '../shop/vouchers';
import { messages } from './messages';
import { MobileBuyBar } from './MobileBuyBar';
import { OtherProducts } from './OtherProducts';
import { PriceBlock } from './PriceBlock';
import { FactRow, ProductFacts } from './ProductFacts';
import { ProductDetails } from './ProductDetails';
import { ProductGallery } from './ProductGallery';
import { ProductReviews } from './ProductReviews';
import { ShopStrip } from './ShopStrip';
import { useAddToCart } from './use-add-to-cart';
import { VariantPicker } from './VariantPicker';
import { VariantSheet, type SheetIntent } from './VariantSheet';
import { emptySelection, inStock, selectedModel, soldOutModels, toggleOption } from './variants';

export function ProductView({ product }: { product: ProductDetail }) {
  const t = useT(messages);
  const { lang } = useLang();
  const shopId = product.shop.shop_id;
  const shop = useApi(() => getApiClient().marketplace.getShop(shopId), [shopId]);
  const vouchers = useApi(() => getApiClient().marketplace.shopVouchers(shopId), [shopId]);
  const policies = useApi(() => getApiClient().marketplace.shopPolicies(shopId), [shopId]);
  const tree = useApi(() => getApiClient().marketplace.categories(), []);
  const assistant = useAssistantEnabled(shopId);
  const cart = useAddToCart();
  const [image, setImage] = useState(0);
  const [selection, setSelection] = useState(() => emptySelection(product));
  const [quantity, setQuantity] = useState(1);
  const [missing, setMissing] = useState(false);
  const [sheet, setSheet] = useState<SheetIntent | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  const model = selectedModel(product, selection);
  const hasTiers = product.tier_variations.length > 0;
  const canBuy = !product.shop.on_holiday && product.models.some(inStock);
  const path = tree.data ? categoryPath(tree.data, product.category.category_id) : [];
  const categories = path.length ? path : [product.category];
  const ticketVouchers = vouchers.data ? vouchersForItem(vouchers.data, product.item_id) : [];

  function choose(tier: number, option: number) {
    const next = toggleOption(selection, tier, option);
    setSelection(next);
    setQuantity(1);
    setMissing(false);
    const url = product.tier_variations[tier].options[option].image_url;
    const at = url && next[tier] === option ? product.images.indexOf(url) : -1;
    if (at >= 0) setImage(at);
  }
  async function purchase(buyNow: boolean) {
    if (!model) {
      setMissing(true);
      return;
    }
    if (await cart.add(model.model_id, quantity, buyNow)) setSheet(null);
  }
  function openSheet(intent: SheetIntent) {
    setMissing(false);
    setSheet(intent);
  }
  function purchaseOnPhone(buyNow: boolean) {
    if (!hasTiers && model) void cart.add(model.model_id, quantity, buyNow);
    else openSheet(buyNow ? 'buy' : 'cart');
  }
  const picker = { product, selection, onSelect: choose, model, quantity, onQuantity: setQuantity, missing };
  const soldOutCount = soldOutModels(product);

  return (
    <div className="flex flex-col gap-2 pb-[calc(3.5rem+env(safe-area-inset-bottom))] max-sm:-mx-4 max-sm:-mt-6 sm:gap-4 sm:pb-0">
      <VoiceWidget
        shopId={product.shop.shop_id}
        product={{ item_id: product.item_id, name: product.name, image: product.images[0] }}
      />
      <nav
        aria-label={t('breadcrumb')}
        className="hidden min-w-0 flex-wrap items-center gap-1.5 text-[13px] sm:flex"
      >
        <Link href="/" className="hover:text-primary">
          Huspee
        </Link>
        {categories.map((c) => (
          <span key={c.category_id} className="contents">
            <span aria-hidden="true" className="text-muted">
              ›
            </span>
            <Link href={`/search?category_id=${c.category_id}`} className="hover:text-primary">
              {c.display_name}
            </Link>
          </span>
        ))}
        <span aria-hidden="true" className="text-muted">
          ›
        </span>
        <span aria-current="page" className="min-w-0 truncate text-muted">
          {product.name}
        </span>
      </nav>

      <section
        aria-label={product.name}
        className="flex flex-col sm:flex-row sm:gap-7 sm:rounded-lg sm:bg-white sm:p-5"
      >
        <div className="w-full shrink-0 bg-white sm:w-[40%] sm:max-w-[400px] sm:min-w-[260px]">
          <ProductGallery images={product.images} name={product.name} index={image} onIndex={setImage} />
          <p className="mt-3 hidden text-[13px] text-muted sm:block">
            {t('likes', { count: formatCount(product.likes, lang) })}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-4">
          <div className="flex flex-col bg-white pb-3 sm:gap-4 sm:pb-0">
            <div className="order-2 px-3 pt-1.5 sm:order-none sm:p-0">
              <div className="flex items-start gap-2">
                {shop.data?.is_official && (
                  <OfficialBadge label={t('official')} className="mt-[3px] sm:mt-[7px]" />
                )}
                <h1 className="min-w-0 text-[15px] leading-snug break-words sm:text-[22px] sm:leading-[1.35] sm:font-semibold">
                  {product.name}
                </h1>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-muted sm:text-sm">
                {product.rating_count > 0 ? (
                  <span>
                    <strong className="font-semibold text-ink">{product.rating_star.toFixed(1)}</strong> ★ ·{' '}
                    {formatCount(product.rating_count, lang)} {t('ratings')}
                  </span>
                ) : (
                  <span>{t('noRating')}</span>
                )}
                <span aria-hidden="true" className="text-line-strong">
                  |
                </span>
                <span>
                  {t('sold')}{' '}
                  <strong className="font-semibold text-ink">{formatCount(product.sold, lang)}</strong>
                </span>
              </div>
            </div>
            <div className="order-1 sm:order-none">
              <PriceBlock product={product} model={model} />
            </div>
            {product.shop.on_holiday && (
              <p className="order-3 flex items-center gap-1.5 px-3 pt-2 text-muted sm:order-none sm:p-0">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                {t('onHoliday')}
              </p>
            )}
          </div>
          <div className="bg-white">
            <ProductFacts product={product} vouchers={vouchers} policies={policies}>
              {hasTiers && (
                <div className="sm:hidden">
                  <FactRow label={t('variation')}>
                    <button
                      type="button"
                      onClick={() => openSheet('choose')}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="min-w-0">
                        {model
                          ? model.name
                          : t('chooseVariation', {
                              tiers: product.tier_variations.map((v) => v.name).join(', '),
                            })}
                        {soldOutCount > 0 && (
                          <span className="text-muted"> · {t('soldOutCount', { count: soldOutCount })}</span>
                        )}
                      </span>
                      <span aria-hidden="true" className="text-muted">
                        ›
                      </span>
                    </button>
                  </FactRow>
                </div>
              )}
            </ProductFacts>
          </div>
          <div className="hidden flex-col gap-5 sm:flex">
            <VariantPicker {...picker} />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!canBuy || !cart.ready || cart.pending}
                onClick={() => void purchase(false)}
                className="flex h-12 min-w-44 items-center justify-center gap-2 rounded-sm border border-primary bg-primary-soft px-5 text-primary-hover transition hover:bg-mic-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M3 4h2l2.2 11h10.6L20 7H8" />
                  <path d="M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM13 8v4M11 10h4" />
                </svg>
                {t('addToCart')}
              </button>
              <button
                type="button"
                disabled={!canBuy || !cart.ready || cart.pending}
                onClick={() => void purchase(true)}
                className="flex h-12 min-w-44 items-center justify-center rounded-sm bg-primary px-5 font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('buyNow')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <ShopStrip shop={shop} assistant={assistant} />

      <div className="flex flex-wrap items-start gap-2 sm:gap-4">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-2 sm:gap-4">
          <ProductDetails
            product={product}
            categories={categories}
            city={shop.data ? shop.data.city : undefined}
          />
          <ProductReviews product={product} />
        </div>
        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-2 sm:gap-4">
          {ticketVouchers.length > 0 && (
            <section
              aria-labelledby="product-vouchers"
              className="hidden bg-white p-4 sm:block sm:rounded-lg"
            >
              <h2 id="product-vouchers" className="mb-3 text-[15px] font-semibold">
                {t('shopVouchers')}
              </h2>
              <div className="flex flex-col gap-2.5">
                {ticketVouchers.map((v) => (
                  <VoucherTicket key={v.voucher_code} voucher={v} />
                ))}
              </div>
            </section>
          )}
          <OtherProducts shopId={shopId} itemId={product.item_id} />
        </aside>
      </div>

      <MobileBuyBar
        assistant={assistant}
        disabled={!canBuy || !cart.ready || cart.pending}
        onPurchase={purchaseOnPhone}
      />
      {sheet && (
        <VariantSheet
          {...picker}
          intent={sheet}
          onClose={closeSheet}
          image={product.images[image]}
          onPurchase={(buyNow) => void purchase(buyNow)}
          pending={cart.pending}
        />
      )}
    </div>
  );
}
