'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useSelectedShop } from '@/components/layout';
import { Button, Card, EmptyState, ErrorState, Input, Modal, Spinner, useToast } from '@/components/ui';
import { useT } from '@/i18n/client';
import { common as commonMessages } from '@/i18n/common';
import { errorMessageKey } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatVnd } from '@/lib/format';
import { call } from '../_catalog/api';
import { messages } from '../_catalog/messages';
import type { Item, Model, Models } from '../_catalog/types';
export default function Products() {
  const t = useT(messages);
  const commonT = useT(commonMessages);
  const toast = useToast();
  const { shops, selectedShopId, loading, error, refresh } = useSelectedShop();
  const shop = shops.find((s) => s.shop_id === selectedShopId);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const data = useApi(async () => {
    if (!shop?.connection.connected) return [];
    const id = shop.shop_id;
    const statuses =
      status === 'all'
        ? ['NORMAL', 'UNLIST', 'BANNED', 'REVIEWING']
        : status === 'active'
          ? ['NORMAL']
          : ['UNLIST'];
    const ids: number[] = [];
    let offset = 0;
    do {
      if (search) {
        const x = await call<{ item_id_list: number[]; next_offset: string }>(id, '/product/search_item', {
          page_size: 50,
          offset: String(offset),
          item_name: search,
          item_status: statuses,
        });
        ids.push(...x.item_id_list);
        offset = Number(x.next_offset) || 0;
      } else {
        const x = await call<{ item: { item_id: number }[]; has_next_page: boolean; next_offset: number }>(
          id,
          '/product/get_item_list',
          { page_size: 50, offset, item_status: statuses },
        );
        ids.push(...x.item.map((i) => i.item_id));
        offset = x.has_next_page ? x.next_offset : 0;
      }
    } while (offset);
    const items: Item[] = [];
    const sales = new Map<number, number>();
    for (let i = 0; i < ids.length; i += 50) {
      const x = await call<{ item_list: Item[] }>(id, '/product/get_item_base_info', {
        item_id_list: ids.slice(i, i + 50),
      });
      items.push(...x.item_list);
      const extra = await call<{ item_list: { item_id: number; sale: number }[] }>(
        id,
        '/product/get_item_extra_info',
        { item_id_list: ids.slice(i, i + 50) },
      );
      extra.item_list.forEach((entry) => sales.set(entry.item_id, entry.sale));
    }
    return Promise.all(
      items.map(async (item) => ({
        item,
        sale: sales.get(item.item_id),
        models: item.has_model
          ? (await call<Models>(id, '/product/get_model_list', { item_id: item.item_id })).model
          : [
              {
                model_id: 0,
                model_sku: item.item_sku,
                tier_index: [],
                price_info: item.price_info || [],
                stock_info_v2: item.stock_info_v2!,
              },
            ],
      })),
    );
  }, [selectedShopId, shop?.connection.connected, status, search]);
  async function action(path: string, params: Record<string, unknown>) {
    if (!selectedShopId) return false;
    setPending(true);
    try {
      const result = await call<{ failure_list?: { failed_reason: string }[] }>(selectedShopId, path, params);
      if (result.failure_list?.length) throw new Error(result.failure_list[0].failed_reason);
      toast(t('saved'));
      data.reload();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failedMutation'));
      return false;
    } finally {
      setPending(false);
    }
  }
  if (loading) return <Spinner />;
  if (error) return <ErrorState message={t('failed')} onRetry={refresh} retryLabel={t('retry')} />;
  if (!shop) return <EmptyState title={t('noShop')} />;
  if (!shop.connection.connected)
    return (
      <EmptyState title={t('notConnected')}>
        <Link href={`/seller/shops/${shop.shop_id}`} className="text-primary">
          {t('connect')}
        </Link>
      </EmptyState>
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('products')}</h1>
        <Link href="/seller/products/new" className="text-primary">
          {t('addProduct')}
        </Link>
      </div>
      <Card>
        <div className="flex gap-2">
          {(['all', 'active', 'hidden'] as const).map((k) => (
            <Button key={k} variant={status === k ? 'primary' : 'ghost'} onClick={() => setStatus(k)}>
              {t(k)}
            </Button>
          ))}
        </div>
        <form
          className="my-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
        >
          <Input aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button>{t('search')}</Button>
        </form>
        {data.loading ? (
          <Spinner />
        ) : data.error ? (
          <ErrorState
            message={commonT(errorMessageKey(data.error))}
            onRetry={data.reload}
            retryLabel={t('retry')}
          />
        ) : !data.data?.length ? (
          <EmptyState title={t('noProducts')} />
        ) : (
          <div className="space-y-4">
            {data.data.map(({ item, models, sale }) => (
              <div key={item.item_id} className="border-t py-4">
                <div className="flex flex-wrap gap-3">
                  {item.image.image_url_list[0] && (
                    <Image
                      src={item.image.image_url_list[0]}
                      alt=""
                      width={64}
                      height={64}
                      unoptimized
                      className="h-16 w-16 object-cover"
                    />
                  )}
                  <div className="grow">
                    <Link className="font-semibold text-primary" href={`/seller/products/${item.item_id}`}>
                      {item.item_name}
                    </Link>
                    <p>
                      {item.item_sku} · {item.item_status}
                    </p>
                    {sale !== undefined && (
                      <p>
                        {t('sales')}: {sale}
                      </p>
                    )}
                    <p>
                      {models.map((m) => formatVnd(m.price_info[0]?.current_price || 0)).join(' – ')} ·{' '}
                      {t('stock')}:{' '}
                      {models.reduce(
                        (n, m) => n + (m.stock_info_v2?.summary_info.total_available_stock || 0),
                        0,
                      )}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      void action('/product/unlist_item', {
                        item_list: [{ item_id: item.item_id, unlist: item.item_status === 'NORMAL' }],
                      })
                    }
                  >
                    {item.item_status === 'NORMAL' ? t('unlist') : t('relist')}
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={() => setDeleting(item.item_id)}>
                    {t('delete')}
                  </Button>
                </div>
                {models.map((m) => (
                  <Quick key={m.model_id} model={m} itemId={item.item_id} pending={pending} action={action} />
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal open={deleting !== null} title={t('delete')} onClose={() => setDeleting(null)}>
        <p className="my-4">{t('confirmDelete')}</p>
        <Button
          loading={pending}
          onClick={() => {
            void action('/product/delete_item', { item_id: deleting }).then(() => setDeleting(null));
          }}
        >
          {t('delete')}
        </Button>
      </Modal>
    </div>
  );
}
function Quick({
  model,
  itemId,
  pending,
  action,
}: {
  model: Model;
  itemId: number;
  pending: boolean;
  action: (path: string, params: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useT(messages);
  return (
    <form
      key={`${model.model_id}-${model.price_info[0]?.original_price}-${model.stock_info_v2?.summary_info.total_available_stock}`}
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void (async () => {
          const priceSaved = await action('/product/update_price', {
            item_id: itemId,
            price_list: [{ model_id: model.model_id, original_price: Number(f.get('price')) }],
          });
          if (!priceSaved) return;
          await action('/product/update_stock', {
            item_id: itemId,
            stock_list: [{ model_id: model.model_id, seller_stock: [{ stock: Number(f.get('stock')) }] }],
          });
        })();
      }}
    >
      <span>{model.model_sku || model.model_id}</span>
      <label>
        {t('price')}
        <Input
          name="price"
          type="number"
          min="1000"
          required
          defaultValue={model.price_info[0]?.original_price}
        />
      </label>
      <label>
        {t('stock')}
        <Input
          name="stock"
          type="number"
          min="0"
          required
          defaultValue={model.stock_info_v2?.summary_info.total_available_stock}
        />
      </label>
      <Button loading={pending} type="submit">
        {t('save')}
      </Button>
    </form>
  );
}
