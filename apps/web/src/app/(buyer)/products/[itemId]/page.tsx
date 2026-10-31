'use client';
import Link from 'next/link';
import { VoiceWidget } from '@/components/assistant/VoiceWidget';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ProductDetail } from '@huspee/sdk';
import {
  Button,
  EmptyState,
  Pagination,
  QuantityStepper,
  QueryState,
  Rating,
  useToast,
} from '@/components/ui';
import { useSession } from '@/components/session';
import { useLang, useT } from '@/i18n';
import { common } from '@/i18n/common';
import { errorMessageKey, getApiClient } from '@/lib/api';
import { formatCount, formatDate, formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { messages } from '../../_browse/messages';
import { panel, Vouchers } from '../../_browse/shared';

function ShopInfo({ id }: { id: number }) {
  const t = useT(messages);
  const shop = useApi(() => getApiClient().marketplace.getShop(id), [id]);
  const vouchers = useApi(() => getApiClient().marketplace.shopVouchers(id), [id]);
  const policies = useApi(() => getApiClient().marketplace.shopPolicies(id), [id]);
  return (
    <>
      <section className={panel}>
        <QueryState {...shop} retry={shop.reload} />
        {!shop.loading && !shop.error && shop.data && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-primary ring-1 ring-line">
              {shop.data.logo_url ? (
                <Image
                  unoptimized
                  width={500}
                  height={500}
                  src={shop.data.logo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                shop.data.shop_name.charAt(0)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{shop.data.shop_name}</h2>
              <div className="text-xs text-gray-500">
                ★ {shop.data.rating_star.toFixed(1)} · {shop.data.item_count} {t('shopProducts')}
              </div>
            </div>
            <Link
              href={`/shops/${id}`}
              className="w-full rounded-full border border-line py-2 text-center text-sm font-medium text-gray-700 transition hover:border-primary hover:text-primary"
            >
              {t('visitShop')}
            </Link>
          </div>
        )}
      </section>
      <section className={panel}>
        <h2 className="mb-3 font-semibold">{t('vouchers')}</h2>
        <QueryState {...vouchers} retry={vouchers.reload} />
        {!vouchers.loading && !vouchers.error && vouchers.data && <Vouchers vouchers={vouchers.data} />}
      </section>
      <section className={panel}>
        <h2 className="mb-3 font-semibold">{t('policies')}</h2>
        <QueryState {...policies} retry={policies.reload} />
        {!policies.loading && !policies.error && policies.data && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-gray-900">{t('shipping')}</dt>
              <dd className="mt-0.5 text-gray-600">{policies.data.shipping_policy}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">{t('returns')}</dt>
              <dd className="mt-0.5 text-gray-600">{policies.data.return_policy}</dd>
            </div>
          </dl>
        )}
      </section>
    </>
  );
}
function Reviews({ id }: { id: number }) {
  const t = useT(messages);
  const { lang } = useLang();
  const [rating, setRating] = useState(0);
  const [page, setPage] = useState(1);
  const reviews = useApi(
    () => getApiClient().marketplace.getReviews(id, { rating: rating || undefined, page, page_size: 5 }),
    [id, rating, page],
  );
  return (
    <section className={panel}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('reviews')}</h2>
        <label className="text-sm">
          <span className="sr-only">{t('reviews')}</span>
          <select
            className="h-9 rounded-full border border-line bg-white px-3 text-sm"
            value={rating}
            onChange={(e) => {
              setRating(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value="0">{t('allRatings')}</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} {t('stars')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <QueryState {...reviews} retry={reviews.reload} />
      {!reviews.loading &&
        !reviews.error &&
        reviews.data &&
        (reviews.data.data.length ? (
          <>
            <div className="divide-y">
              {reviews.data.data.map((r) => (
                <article key={r.comment_id} className="space-y-1.5 py-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-600">
                      {r.buyer_name.charAt(0).toUpperCase()}
                    </span>
                    {r.buyer_name}
                  </div>
                  <Rating value={r.rating} />
                  <div className="text-xs text-gray-500">
                    {formatDate(r.create_time, lang)} {r.model_name && `· ${r.model_name}`}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{r.comment}</p>
                  {r.image_urls.length > 0 && (
                    <div className="flex gap-2">
                      {r.image_urls.map((url) => (
                        <Image
                          unoptimized
                          width={500}
                          height={500}
                          key={url}
                          src={url}
                          alt=""
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {r.seller_reply && (
                    <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{r.seller_reply}</p>
                  )}
                </article>
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(reviews.data.page.total / 5))}
              onChange={setPage}
            />
          </>
        ) : (
          <EmptyState title={t('noReviews')} />
        ))}
    </section>
  );
}
function Product({ product }: { product: ProductDetail }) {
  const t = useT(messages);
  const c = useT(common);
  const { lang } = useLang();
  const session = useSession();
  const router = useRouter();
  const toast = useToast();
  const [image, setImage] = useState(0);
  const [selected, setSelected] = useState<number[]>(() => product.tier_variations.map(() => -1));
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const model =
    product.models.find(
      (m) => m.tier_index.length === selected.length && m.tier_index.every((n, i) => n === selected[i]),
    ) ??
    (product.tier_variations.length === 0 && product.models.length === 1 ? product.models[0] : undefined);
  const price = model
    ? formatVnd(model.price)
    : `${formatVnd(product.price_min)}${product.price_min !== product.price_max ? ` – ${formatVnd(product.price_max)}` : ''}`;
  async function add(buy: boolean) {
    if (session.status === 'anonymous') {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (session.status === 'loading') return;
    if (!session.user?.roles.includes('buyer')) {
      toast(t('buyerOnly'));
      return;
    }
    if (!model) {
      toast(t('selectVariant'));
      return;
    }
    setPending(true);
    try {
      await getApiClient().cart.addItem(model.model_id, quantity);
      window.dispatchEvent(new Event('huspee:cart-changed'));
      toast(t('added'));
      if (buy) router.push('/cart');
    } catch (e) {
      toast(c(errorMessageKey(e)));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <VoiceWidget shopId={product.shop.shop_id} product={{ item_id: product.item_id, name: product.name, image: product.images[0] }} />
      <nav className="flex min-w-0 items-center gap-1.5 text-sm text-gray-500">
        <Link href="/" className="hover:text-primary">
          Huspee
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/shops/${product.shop.shop_id}`} className="truncate hover:text-primary">
          {product.shop.shop_name}
        </Link>
      </nav>
      <section
        className={`${panel} grid gap-8 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,44%)_minmax(0,1fr)]`}
      >
        <div className="min-w-0">
          <div className="aspect-square overflow-hidden rounded-2xl bg-gray-50">
            {product.images[image] && (
              <Image
                unoptimized
                width={500}
                height={500}
                src={product.images[image]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {product.images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                aria-label={`${t('chooseImage')} ${i + 1}`}
                onClick={() => setImage(i)}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition ${image === i ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'}`}
              >
                <Image
                  unoptimized
                  width={500}
                  height={500}
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-6 break-words">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold leading-tight text-gray-900">{product.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              <span className="flex items-center gap-1 font-medium text-gray-900">
                {product.rating_star.toFixed(1)} <Rating value={product.rating_star} />
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {formatCount(product.rating_count, lang)} {t('reviews')}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t('sold')} {formatCount(product.sold, lang)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-3 rounded-2xl bg-primary-soft px-5 py-4">
            <span className="text-3xl font-bold text-primary">{price}</span>
            {model && model.original_price > model.price && (
              <>
                <span className="text-sm text-gray-400 line-through">{formatVnd(model.original_price)}</span>
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                  -{Math.round((1 - model.price / model.original_price) * 100)}%
                </span>
              </>
            )}
          </div>
          {product.tier_variations.map((tier, i) => (
            <div key={i} className="space-y-2">
              <div className="text-sm font-medium text-gray-700">{tier.name}</div>
              <div className="flex flex-wrap gap-2">
                {tier.options.map((option, j) => {
                  const enabled = product.models.some(
                    (m) =>
                      m.available &&
                      m.stock > 0 &&
                      m.tier_index[i] === j &&
                      selected.every((n, k) => k === i || n < 0 || m.tier_index[k] === n),
                  );
                  return (
                    <button
                      key={j}
                      disabled={!enabled}
                      aria-pressed={selected[i] === j}
                      onClick={() => {
                        setSelected(selected.map((n, k) => (k === i ? j : n)));
                        setQuantity(1);
                        const colorImage = product.images.indexOf(option.image_url ?? '');
                        if (colorImage >= 0) setImage(colorImage);
                      }}
                      className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-35 ${selected[i] === j ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-line bg-white text-gray-800 hover:border-gray-400'}`}
                    >
                      {option.image_url && (
                        <Image
                          unoptimized
                          width={32}
                          height={32}
                          src={option.image_url}
                          alt=""
                          className="h-8 w-8 rounded object-cover"
                        />
                      )}
                      {option.option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700">{t('quantity')}</span>
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              max={model?.stock ?? Math.max(1, product.stock)}
            />
            <span className="text-sm text-gray-500">
              {model?.stock ?? product.stock} {t('stock')}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              variant="outline"
              loading={pending}
              disabled={
                session.status === 'loading' ||
                (model ? !model.available || model.stock <= 0 : product.stock <= 0)
              }
              onClick={() => void add(false)}
            >
              {t('add')}
            </Button>
            <Button
              size="lg"
              loading={pending}
              disabled={
                session.status === 'loading' ||
                (model ? !model.available || model.stock <= 0 : product.stock <= 0)
              }
              onClick={() => void add(true)}
            >
              {t('buy')}
            </Button>
          </div>
        </div>
      </section>
      <div className="grid gap-5 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section className={panel}>
            <h2 className="mb-3 text-lg font-semibold">{t('description')}</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{product.description}</p>
            {product.attributes.length > 0 && (
              <>
                <h3 className="mb-2 mt-6 font-semibold">{t('attributes')}</h3>
                <dl className="divide-y rounded-xl border text-sm">
                  {product.attributes.map((a, i) => (
                    <div key={i} className="flex gap-4 px-4 py-2.5">
                      <dt className="w-32 shrink-0 text-gray-500">{a.name}</dt>
                      <dd className="text-gray-900">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </section>
          <Reviews id={product.item_id} />
        </div>
        <aside className="min-w-0 space-y-5">
          <ShopInfo id={product.shop.shop_id} />
        </aside>
      </div>
    </div>
  );
}
export default function ProductPage() {
  const t = useT(messages);
  const id = Number(useParams().itemId);
  const product = useApi(() => getApiClient().marketplace.getProduct(id), [id]);
  useEffect(() => {
    document.title = `${product.data?.name ?? t('products')} | Huspee`;
  }, [product.data, t]);
  return (
    <>
      <QueryState {...product} retry={product.reload} />
      {!product.loading && !product.error && product.data && <Product key={id} product={product.data} />}
    </>
  );
}
