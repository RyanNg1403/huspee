'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ProductDetail } from '@huspee/sdk';
import { Button, EmptyState, Pagination, QuantityStepper, Rating, useToast } from '@/components/ui';
import { useSession } from '@/components/session';
import { useLang, useT } from '@/i18n';
import { common } from '@/i18n/common';
import { errorMessageKey, getApiClient } from '@/lib/api';
import { formatCount, formatDate, formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { messages } from '../../_browse/messages';
import { panel, State, Vouchers } from '../../_browse/shared';

function ShopInfo({ id }: { id: number }) {
  const t = useT(messages);
  const shop = useApi(() => getApiClient().marketplace.getShop(id), [id]);
  const vouchers = useApi(() => getApiClient().marketplace.shopVouchers(id), [id]);
  const policies = useApi(() => getApiClient().marketplace.shopPolicies(id), [id]);
  return (
    <>
      <section className={panel}>
        <State {...shop} retry={shop.reload} />
        {!shop.loading && !shop.error && shop.data && (
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-[#ee4d2d]">
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
            <div>
              <h2 className="font-medium">{shop.data.shop_name}</h2>
              <Link href={`/shops/${id}`} className="text-sm text-[#ee4d2d]">
                {t('visitShop')} →
              </Link>
            </div>
          </div>
        )}
      </section>
      <section className={panel}>
        <h2 className="mb-3 text-lg">{t('vouchers')}</h2>
        <State {...vouchers} retry={vouchers.reload} />
        {!vouchers.loading && !vouchers.error && vouchers.data && <Vouchers vouchers={vouchers.data} />}
      </section>
      <section className={panel}>
        <h2 className="mb-3 text-lg">{t('policies')}</h2>
        <State {...policies} retry={policies.reload} />
        {!policies.loading && !policies.error && policies.data && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{t('shipping')}: </strong>
              {policies.data.shipping_policy}
            </p>
            <p>
              <strong>{t('returns')}: </strong>
              {policies.data.return_policy}
            </p>
          </div>
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
      <h2 className="mb-4 text-lg">{t('reviews')}</h2>
      <label className="block text-sm">
        {t('reviews')}{' '}
        <select
          className="ml-2 border p-2"
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
      <State {...reviews} retry={reviews.reload} />
      {!reviews.loading &&
        !reviews.error &&
        reviews.data &&
        (reviews.data.data.length ? (
          <>
            <div className="divide-y">
              {reviews.data.data.map((r) => (
                <article key={r.comment_id} className="space-y-1 py-4">
                  <div className="text-sm font-medium">{r.buyer_name}</div>
                  <Rating value={r.rating} />
                  <div className="text-xs text-gray-500">
                    {formatDate(r.create_time, lang)} {r.model_name && `· ${r.model_name}`}
                  </div>
                  <p className="whitespace-pre-wrap">{r.comment}</p>
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
                          className="h-16 w-16 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {r.seller_reply && <p className="bg-gray-50 p-2 text-sm">{r.seller_reply}</p>}
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
    <div className="space-y-4">
      <section
        className={`${panel} grid gap-6 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,40%)_minmax(0,1fr)]`}
      >
        <div className="min-w-0">
          <div className="aspect-square bg-gray-100">
            {product.images[image] && (
              <Image
                unoptimized
                width={500}
                height={500}
                src={product.images[image]}
                alt={product.name}
                className="h-full w-full object-contain"
              />
            )}
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {product.images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                aria-label={`${t('chooseImage')} ${i + 1}`}
                onClick={() => setImage(i)}
                className={`h-16 w-16 shrink-0 border-2 ${image === i ? 'border-[#ee4d2d]' : 'border-transparent'}`}
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
        <div className="min-w-0 space-y-4 break-words">
          <h1 className="text-xl font-medium">{product.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-[#ee4d2d]">
              {product.rating_star.toFixed(1)} <Rating value={product.rating_star} />
            </span>
            <span>
              {formatCount(product.rating_count, lang)} {t('reviews')}
            </span>
            <span>
              {t('sold')} {formatCount(product.sold, lang)}
            </span>
          </div>
          <div className="bg-gray-50 p-4 text-2xl text-[#ee4d2d]">
            {model && model.original_price > model.price && (
              <span className="mr-3 text-sm text-gray-400 line-through">
                {formatVnd(model.original_price)}
              </span>
            )}
            {price}
          </div>
          {product.tier_variations.map((tier, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-sm text-gray-500">{tier.name}</span>
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
                    onClick={() => {
                      setSelected(selected.map((n, k) => (k === i ? j : n)));
                      setQuantity(1);
                    }}
                    className={`border px-3 py-2 text-sm disabled:opacity-30 ${selected[i] === j ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-gray-300'}`}
                  >
                    {option.option}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500">{t('quantity')}</span>
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              max={model?.stock ?? Math.max(1, product.stock)}
            />
            <span className="text-sm text-gray-500">
              {model?.stock ?? product.stock} {t('stock')}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
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
      <ShopInfo id={product.shop.shop_id} />
      <section className={panel}>
        <h2 className="mb-3 text-lg">{t('description')}</h2>
        <p className="whitespace-pre-wrap text-sm">{product.description}</p>
        {product.attributes.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 font-medium">{t('attributes')}</h3>
            <dl className="space-y-2 text-sm">
              {product.attributes.map((a, i) => (
                <div key={i} className="flex gap-4">
                  <dt className="w-32 text-gray-500">{a.name}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>
      <Reviews id={product.item_id} />
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
      <State {...product} retry={product.reload} />
      {!product.loading && !product.error && product.data && <Product key={id} product={product.data} />}
    </>
  );
}
