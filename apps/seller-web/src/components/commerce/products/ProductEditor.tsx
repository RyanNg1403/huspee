'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { Modal, Spinner, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { call } from '@/lib/seller-api';
import { Breadcrumb } from '../Breadcrumb';
import { ActionError } from '../errors';
import { formatInt } from '../format';
import { ListState } from '../ListState';
import { PageTabs } from '../PageTabs';
import { Panel } from '../Panel';
import { Thumb } from '../Thumb';
import { btn, panel, sub } from '../ui';
import { BasicSection } from './BasicSection';
import {
  EDITOR_TABS,
  syncRows,
  tabOfField,
  validateDraft,
  type EditorTab,
  type FieldKey,
  type ProductDraft,
  type RowDraft,
  type TierDraft,
} from './draft';
import { loadCategoryDetails, loadEditor, type EditorData } from './editor-api';
import { editorMessages } from './editor-messages';
import { ProductStatus } from './ProductStatus';
import { SalesSection } from './SalesSection';
import { saveProduct } from './save-product';
import { ShippingSection } from './ShippingSection';
import { SpecsSection } from './SpecsSection';

const TAB_LABEL = {
  basic: 'tabBasic',
  specs: 'tabSpecs',
  sales: 'tabSales',
  shipping: 'tabShipping',
} as const;

/** S4.2 / S4.3: one form split into tabs, saved with a single "Lưu". */
export function ProductEditor({ shop, itemId }: { shop: SellerShop; itemId?: number }) {
  const t = useT(editorMessages);
  const data = useApi(() => loadEditor(shop.shop_id, itemId), [shop.shop_id, itemId]);
  return (
    <div className="space-y-4">
      <ListState
        loading={data.loading}
        error={data.error}
        empty={!data.data}
        emptyTitle={t('notFound')}
        onRetry={data.reload}
      >
        {data.data && (
          <EditorForm
            key={JSON.stringify(data.data.draft)}
            shop={shop}
            data={data.data}
            reload={data.reload}
          />
        )}
      </ListState>
    </div>
  );
}

function EditorForm({ shop, data, reload }: { shop: SellerShop; data: EditorData; reload: () => void }) {
  const t = useT(editorMessages);
  const { lang } = useLang();
  const toast = useToast();
  const router = useRouter();
  const shopId = shop.shop_id;
  const { item, saved } = data;
  const [draft, setDraft] = useState<ProductDraft>(data.draft);
  const [tab, setTab] = useState<EditorTab>('basic');
  const [errors, setErrors] = useState<FieldKey[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<
    { kind: 'item' } | { kind: 'variant'; row: RowDraft; label: string } | null
  >(null);
  const details = useApi(
    () => (draft.categoryId ? loadCategoryDetails(shopId, draft.categoryId) : Promise.resolve(null)),
    [shopId, draft.categoryId],
  );
  const attributes = details.data?.attributes ?? [];
  const emptySpecs =
    attributes.filter((a) => !draft.attributes[a.attribute_id]?.trim()).length + (draft.brandId ? 0 : 1);
  const category = data.categories.find((c) => c.category_id === item?.category_id)?.display_category_name;
  const update = (patch: Partial<ProductDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function setTiers(tiers: TierDraft[]) {
    setDraft((d) => ({
      ...d,
      tiers,
      rows: tiers.length
        ? syncRows(
            tiers,
            saved.tiers.map((x) => x.options.length),
            d.rows,
          )
        : saved.rows,
    }));
  }

  async function run(name: string, fn: () => Promise<void>) {
    setPending(name);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  function save() {
    const invalid = validateDraft(
      draft,
      attributes.filter((a) => a.mandatory).map((a) => a.attribute_id),
    );
    setErrors(invalid);
    if (invalid.length) {
      setTab(tabOfField(invalid[0]));
      return;
    }
    void run('save', async () => {
      const id = await saveProduct({
        shopId,
        itemId: item?.item_id ?? null,
        saved,
        draft,
        channels: data.channels,
        attributes: details.data ? attributes : null,
      });
      if (item) {
        toast(t('saved'));
        reload();
      } else {
        toast(t('created'));
        router.push(`/products/${id}`);
      }
    });
  }

  return (
    <>
      <Breadcrumb
        items={[{ label: t('products'), href: '/products' }, { label: item?.item_name ?? t('newTitle') }]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-xl font-semibold">{item ? t('editTitle') : t('newTitle')}</h1>
          {item && <ProductStatus status={item.item_status} variants={[]} hasModel={false} />}
        </div>
        {item && ['NORMAL', 'UNLIST'].includes(item.item_status) && (
          <div className="flex gap-2">
            <button
              type="button"
              className={btn.outlineSm}
              disabled={pending !== null}
              onClick={() =>
                void run('unlist', async () => {
                  const unlist = item.item_status === 'NORMAL';
                  await call(shopId, '/product/unlist_item', {
                    item_list: [{ item_id: item.item_id, unlist }],
                  });
                  toast(unlist ? t('hidden') : t('shown'));
                  reload();
                })
              }
            >
              {item.item_status === 'NORMAL' ? t('hide') : t('show')}
            </button>
            <button
              type="button"
              className={btn.outlineSm}
              disabled={pending !== null}
              onClick={() => setConfirm({ kind: 'item' })}
            >
              {t('remove')}
            </button>
          </div>
        )}
      </div>
      <div className={`${panel} px-6`}>
        {item && (
          <div className="flex items-center gap-3 border-b border-line-soft py-4">
            <Thumb src={item.image.image_url_list[0]} size={56} />
            <div>
              <p className="font-semibold">{item.item_name}</p>
              <p className={sub}>
                {t('summary', {
                  sku: item.item_sku || '—',
                  category: category ?? '—',
                  sold: formatInt(data.sale ?? 0, lang),
                })}
              </p>
            </div>
          </div>
        )}
        <PageTabs
          label={t('sections')}
          value={tab}
          onChange={setTab}
          items={EDITOR_TABS.map((value) => ({
            value,
            label: t(TAB_LABEL[value]),
            ...(value === 'specs' && details.data && emptySpecs
              ? { note: t('emptySpecs', { count: emptySpecs }) }
              : {}),
          }))}
        />
      </div>
      <div role="tabpanel" aria-label={t(TAB_LABEL[tab])} className="space-y-4">
        {tab === 'basic' && (
          <Panel title={t('basicTitle')}>
            <BasicSection
              draft={draft}
              update={update}
              errors={errors}
              shopId={shopId}
              categories={data.categories}
            />
          </Panel>
        )}
        {tab === 'specs' &&
          (!draft.categoryId ? (
            <Panel>
              <p className="text-sm text-muted">{t('pickCategory')}</p>
            </Panel>
          ) : (
            <ListState
              loading={details.loading}
              error={details.error}
              empty={false}
              emptyTitle=""
              onRetry={details.reload}
            >
              <SpecsSection
                draft={draft}
                update={update}
                errors={errors}
                brands={details.data?.brands ?? []}
                attributes={attributes}
                savedAttributes={draft.categoryId === data.draft.categoryId ? data.draft.attributes : {}}
                savedBrandId={draft.categoryId === data.draft.categoryId ? data.draft.brandId : 0}
              />
            </ListState>
          ))}
        {tab === 'sales' && (
          <Panel title={t('salesTitle')}>
            <SalesSection
              draft={draft}
              update={update}
              errors={errors}
              isNew={!item}
              savedTiers={saved.tiers}
              onTiers={setTiers}
              onDeleteVariant={(row, label) => setConfirm({ kind: 'variant', row, label })}
            />
          </Panel>
        )}
        {tab === 'shipping' && (
          <Panel title={t('shippingTitle')}>
            <ShippingSection draft={draft} update={update} errors={errors} channels={data.channels} />
          </Panel>
        )}
      </div>
      <ActionError error={error} />
      <div className="flex justify-end gap-3">
        <Link href="/products" className={btn.outline}>
          {t('cancel')}
        </Link>
        <button
          type="button"
          className={`${btn.primary} min-w-20`}
          disabled={pending !== null}
          onClick={save}
        >
          {pending === 'save' && <Spinner />}
          {t('save')}
        </button>
      </div>
      {confirm && item && (
        <Modal
          open
          onClose={() => setConfirm(null)}
          title={
            confirm.kind === 'item'
              ? t('removeTitle', { name: item.item_name })
              : t('deleteVariantTitle', { name: confirm.label })
          }
        >
          <div className="flex justify-end gap-3">
            <button type="button" className={btn.outline} onClick={() => setConfirm(null)}>
              {t('back')}
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={pending !== null}
              onClick={() =>
                void run('delete', async () => {
                  if (confirm.kind === 'item') {
                    await call(shopId, '/product/delete_item', { item_id: item.item_id });
                    toast(t('removed'));
                    router.push('/products');
                    return;
                  }
                  await call(shopId, '/product/delete_model', {
                    item_id: item.item_id,
                    model_id: confirm.row.modelId,
                  });
                  toast(t('variantDeleted', { name: confirm.label }));
                  setConfirm(null);
                  reload();
                }).then(() => setConfirm(null))
              }
            >
              {pending === 'delete' && <Spinner />}
              {confirm.kind === 'item' ? t('remove') : t('deleteVariant')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
