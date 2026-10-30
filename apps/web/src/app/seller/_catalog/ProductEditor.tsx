'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useSelectedShop } from '@/components/layout';
import { Button, Card, EmptyState, ErrorState, Input, Spinner, Textarea, useToast } from '@/components/ui';
import { useLang, useT } from '@/i18n/client';
import { common as commonMessages } from '@/i18n/common';
import { errorMessageKey } from '@/lib/api';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { call } from './api';
import { messages } from './messages';
import type { Item, Models } from './types';
import { Variations } from './Variations';
type Category = { category_id: number; display_category_name: string; has_children: boolean };
type Attribute = {
  attribute_id: number;
  mandatory: boolean;
  name: string;
  multi_lang: { language: string; value: string }[];
  attribute_info: { input_type: number };
  attribute_value_list: { value_id: number; name: string }[];
};
type Brand = { brand_id: number; display_brand_name: string };

async function loadAllBrands(
  shopId: number,
  categoryId: number,
): Promise<{ brand_list: Brand[]; is_mandatory: boolean }> {
  const allBrands: Brand[] = [];
  let offset = 0;
  let hasNext = true;
  let isMandatory = false;
  while (hasNext) {
    const res = await call<{
      brand_list: Brand[];
      has_next_page: boolean;
      next_offset?: number;
      is_mandatory: boolean;
    }>(shopId, '/product/get_brand_list', {
      category_id: categoryId,
      offset,
      page_size: 100,
    });
    if (res.brand_list) {
      allBrands.push(...res.brand_list);
    }
    isMandatory = res.is_mandatory ?? isMandatory;
    hasNext = Boolean(res.has_next_page && res.brand_list?.length);
    offset = res.next_offset ?? offset + (res.brand_list?.length || 100);
  }
  return { brand_list: allBrands, is_mandatory: isMandatory };
}
type Channel = { logistics_channel_id: number; logistics_channel_name: string; enabled: boolean };
export function ProductEditor({ itemId }: { itemId?: number }) {
  const t = useT(messages);
  const { lang } = useLang();
  const commonT = useT(commonMessages);
  const toast = useToast();
  const router = useRouter();
  const { shops, selectedShopId, loading, error, refresh } = useSelectedShop();
  const shop = shops.find((s) => s.shop_id === selectedShopId);
  const [pending, setPending] = useState(false);
  const [category, setCategory] = useState<number | null>(null);
  const [fieldError, setFieldError] = useState('');
  const [images, setImages] = useState<string[] | null>(null);
  const data = useApi(async () => {
    if (!shop?.connection.connected) return null;
    const id = shop.shop_id;
    const [categories, channels, base] = await Promise.all([
      call<{ category_list: Category[] }>(id, '/product/get_category'),
      call<{ logistics_channel_list: Channel[] }>(id, '/logistics/get_channel_list'),
      itemId
        ? call<{ item_list: Item[] }>(id, '/product/get_item_base_info', { item_id_list: [itemId] })
        : Promise.resolve(null),
    ]);
    const item = base?.item_list[0];
    if (itemId && !item) throw new Error('Item not found');
    const models = item?.has_model
      ? await call<Models>(id, '/product/get_model_list', { item_id: itemId })
      : null;
    return { categories: categories.category_list, channels: channels.logistics_channel_list, item, models };
  }, [selectedShopId, shop?.connection.connected, itemId]);
  const categoryId = category ?? data.data?.item?.category_id ?? 0;
  const details = useApi(async () => {
    if (!selectedShopId || !categoryId) return null;
    const [brands, attributes] = await Promise.all([
      loadAllBrands(selectedShopId, categoryId),
      call<{ list: { attribute_tree: Attribute[] }[] }>(selectedShopId, '/product/get_attribute_tree', {
        category_id_list: [categoryId],
      }),
    ]);
    return { brands, attributes: attributes.list[0]?.attribute_tree ?? [] };
  }, [selectedShopId, categoryId]);
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedShopId) return;
    setPending(true);
    try {
      const x = await getApiClient().seller.shopee.uploadImage(selectedShopId, file, file.name);
      if (x.error || !x.response) throw new Error(x.message);
      setImages((current) => [
        ...(current ?? data.data?.item?.image.image_id_list ?? []),
        x.response!.image_info.image_id,
      ]);
      toast(t('saved'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failedMutation'));
    } finally {
      setPending(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedShopId || !data.data) return;
    setPending(true);
    const f = new FormData(e.currentTarget);
    const num = (k: string) => Number(f.get(k));
    setFieldError('');
    const common = {
      item_name: String(f.get('name')),
      description: String(f.get('description')),
      item_sku: String(f.get('sku')),
      weight: num('weight'),
      category_id: num('category'),
      brand: { brand_id: num('brand') },
      attribute_list: (details.data?.attributes ?? []).flatMap((a) => {
        const value = String(f.get(`attribute_${a.attribute_id}`) ?? '');
        if (!value) return [];
        return [
          {
            attribute_id: a.attribute_id,
            attribute_value_list: [
              a.attribute_info.input_type === 2
                ? { value_id: 0, original_value_name: value }
                : { value_id: Number(value) },
            ],
          },
        ];
      }),
      image: { image_id_list: images ?? data.data.item?.image.image_id_list ?? [] },
      logistic_info: data.data.channels.map((c) => ({
        logistic_id: c.logistics_channel_id,
        enabled: f.getAll('logistics').includes(String(c.logistics_channel_id)),
      })),
    };
    try {
      if (itemId) {
        await call(selectedShopId, '/product/update_item', { item_id: itemId, ...common });
        toast(t('saved'));
        data.reload();
      } else {
        const result = await call<{ item_id: number }>(selectedShopId, '/product/add_item', {
          ...common,
          original_price: num('price'),
          seller_stock: [{ stock: num('stock') }],
        });
        toast(t('saved'));
        router.push(`/seller/products/${result.item_id}`);
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : '';
      const field = [
        'item_name',
        'description',
        'category',
        'brand',
        'attribute',
        'weight',
        'image',
        'price',
        'stock',
        'logistic',
        'sku',
      ].find((key) => text.toLowerCase().includes(key));
      setFieldError(field ?? '');
      toast(commonT(errorMessageKey(e)));
    } finally {
      setPending(false);
    }
  }
  if (loading) return <Spinner />;
  if (error) return <ErrorState message={t('failed')} onRetry={refresh} retryLabel={t('retry')} />;
  if (!shop) return <EmptyState title={t('noShop')} />;
  if (!shop.connection.connected) return <EmptyState title={t('notConnected')} />;
  if (data.loading) return <Spinner />;
  if (data.error || !data.data)
    return (
      <ErrorState
        message={commonT(errorMessageKey(data.error))}
        onRetry={data.reload}
        retryLabel={t('retry')}
      />
    );
  const { item, categories, channels, models } = data.data;
  const fieldMessage = (field: string) =>
    fieldError === field ? (
      <span role="alert" className="block text-red-700">
        {t('fieldError')}
      </span>
    ) : null;
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-bold">{item ? t('edit') : t('addProduct')}</h1>
        {item && (
          <Link className="text-primary" href={`/products/${item.item_id}`}>
            {t('view')}
          </Link>
        )}
        <form className="mt-4 grid max-w-2xl gap-3" onSubmit={submit}>
          <label>
            {t('productName')}
            <Input name="name" required maxLength={120} defaultValue={item?.item_name} />
            {fieldMessage('item_name')}
          </label>
          <label>
            {t('description')}
            <Textarea name="description" required defaultValue={item?.description} />
            {fieldMessage('description')}
          </label>
          <label>
            {t('sku')}
            <Input name="sku" defaultValue={item?.item_sku} />
            {fieldMessage('sku')}
          </label>
          <label>
            {t('category')}
            <select
              className="block w-full rounded-xl border px-3 py-2"
              name="category"
              required
              value={categoryId || ''}
              onChange={(e) => setCategory(Number(e.target.value))}
            >
              <option value="">—</option>
              {categories
                .filter((c) => !c.has_children)
                .map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.display_category_name}
                  </option>
                ))}
            </select>
            {fieldMessage('category')}
          </label>
          {details.loading && categoryId > 0 && <Spinner />}
          {Boolean(details.error) && (
            <ErrorState
              message={commonT(errorMessageKey(details.error))}
              onRetry={details.reload}
              retryLabel={t('retry')}
            />
          )}
          {details.data && (
            <>
              <label>
                {t('brand')}
                <select
                  className="block w-full rounded-xl border px-3 py-2"
                  name="brand"
                  defaultValue={item?.brand?.brand_id ?? 0}
                  required={details.data.brands.is_mandatory}
                  key={categoryId}
                >
                  <option value="0">—</option>
                  {details.data.brands.brand_list.map((b) => (
                    <option key={b.brand_id} value={b.brand_id}>
                      {b.display_brand_name}
                    </option>
                  ))}
                </select>
                {fieldMessage('brand')}
              </label>
              {details.data.attributes.map((a) => {
                const old = item?.attribute_list?.find((x) => x.attribute_id === a.attribute_id)
                  ?.attribute_value_list[0];
                return (
                  <label key={a.attribute_id}>
                    {a.multi_lang.find((x) => x.language === lang)?.value ?? a.name}
                    {a.attribute_info.input_type === 2 ? (
                      <Input
                        name={`attribute_${a.attribute_id}`}
                        required={a.mandatory}
                        defaultValue={old?.original_value_name}
                      />
                    ) : (
                      <select
                        className="block w-full rounded-xl border px-3 py-2"
                        name={`attribute_${a.attribute_id}`}
                        required={a.mandatory}
                        defaultValue={old?.value_id ?? ''}
                      >
                        <option value="">—</option>
                        {a.attribute_value_list.map((v) => (
                          <option key={v.value_id} value={v.value_id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {fieldMessage('attribute')}
                  </label>
                );
              })}
            </>
          )}
          <label>
            {t('weight')}
            <Input
              name="weight"
              type="number"
              min="0.001"
              step="0.001"
              required
              defaultValue={item?.weight}
            />
            {fieldMessage('weight')}
          </label>
          {!item && (
            <>
              <label>
                {t('price')}
                <Input name="price" type="number" min="1000" required />
                {fieldMessage('price')}
              </label>
              <label>
                {t('stock')}
                <Input name="stock" type="number" min="0" required />
                {fieldMessage('stock')}
              </label>
            </>
          )}
          <fieldset>
            <legend>{t('logistics')}</legend>
            {channels.map((c) => (
              <label className="mr-4" key={c.logistics_channel_id}>
                <input
                  type="checkbox"
                  name="logistics"
                  value={c.logistics_channel_id}
                  defaultChecked={
                    item
                      ? item.logistic_info.some((l) => l.logistic_id === c.logistics_channel_id && l.enabled)
                      : c.enabled
                  }
                />{' '}
                {c.logistics_channel_name}
              </label>
            ))}
            {fieldMessage('logistic')}
          </fieldset>
          <label>
            {t('image')}
            <Input type="file" accept="image/*" onChange={upload} disabled={pending} />
            {fieldMessage('image')}
          </label>
          <p>{(images ?? item?.image.image_id_list ?? []).length} / 9</p>
          {(images ?? item?.image.image_id_list ?? []).map((id, index, list) => (
            <div key={id} className="flex flex-wrap gap-2 items-center">
              <span className="break-all">{id}</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setImages(list.filter((_, i) => i !== index))}
              >
                {t('removeImage')}
              </Button>
              {[
                [-1, 'moveUp'],
                [1, 'moveDown'],
              ].map(([delta, label]) => (
                <Button
                  key={label}
                  type="button"
                  variant="ghost"
                  disabled={index + Number(delta) < 0 || index + Number(delta) >= list.length}
                  onClick={() => {
                    const next = [...list];
                    const target = index + Number(delta);
                    [next[index], next[target]] = [next[target], next[index]];
                    setImages(next);
                  }}
                >
                  {t(label as 'moveUp' | 'moveDown')}
                </Button>
              ))}
            </div>
          ))}
          <Button loading={pending || details.loading || Boolean(details.error)} type="submit">
            {t('save')}
          </Button>
        </form>
      </Card>
      {item && (
        <Card>
          <h2 className="text-xl font-bold">{t('variants')}</h2>
          <Variations shopId={shop.shop_id} itemId={item.item_id} models={models} reload={data.reload} />
          <Link className="text-primary" href="/seller/products">
            {t('back')}
          </Link>
        </Card>
      )}
    </div>
  );
}
