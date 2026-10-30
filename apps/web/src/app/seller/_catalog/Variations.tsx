'use client';
import { useState, type FormEvent } from 'react';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { useT } from '@/i18n/client';
import { call } from './api';
import { messages } from './messages';
import type { Models } from './types';
export function Variations({
  shopId,
  itemId,
  models,
  reload,
}: {
  shopId: number;
  itemId: number;
  models: Models | null;
  reload: () => void;
}) {
  const t = useT(messages);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<number | null>(null);
  async function run(path: string, params: Record<string, unknown>) {
    setBusy(true);
    try {
      await call(shopId, path, { item_id: itemId, ...params });
      toast(t('saved'));
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failedMutation'));
    } finally {
      setBusy(false);
    }
  }
  async function saveModel(modelId: number, f: FormData) {
    setBusy(true);
    try {
      await call(shopId, '/product/update_model', {
        item_id: itemId,
        model: [{ model_id: modelId, model_sku: String(f.get('sku')) }],
      });
      for (const [path, params] of [
        [
          '/product/update_price',
          { price_list: [{ model_id: modelId, original_price: Number(f.get('price')) }] },
        ],
        [
          '/product/update_stock',
          { stock_list: [{ model_id: modelId, seller_stock: [{ stock: Number(f.get('stock')) }] }] },
        ],
      ] as const) {
        const result = await call<{ failure_list?: { failed_reason: string }[] }>(shopId, path, {
          item_id: itemId,
          ...params,
        });
        if (result.failure_list?.length) throw new Error(result.failure_list[0].failed_reason);
      }
      toast(t('saved'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failedMutation'));
    } finally {
      reload();
      setBusy(false);
    }
  }
  function tiers(f: FormData) {
    return [0, 1]
      .map((i) => ({
        name: String(f.get(`name${i}`) || '').trim(),
        option_list: String(f.get(`options${i}`) || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((option) => ({ option })),
      }))
      .filter((x) => x.name && x.option_list.length);
  }
  function saveTiers(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const list = tiers(f);
    if (!list.length) return;
    if (models) {
      void run('/product/update_tier_variation', { tier_variation: list });
      return;
    }
    const combinations =
      list.length === 1
        ? list[0].option_list.map((_, i) => [i])
        : list[0].option_list.flatMap((_, i) => list[1].option_list.map((_, j) => [i, j]));
    void run('/product/init_tier_variation', {
      tier_variation: list,
      model: combinations.map((tier_index) => ({
        tier_index,
        original_price: Number(f.get('price')),
        seller_stock: [{ stock: Number(f.get('stock')) }],
        model_sku: '',
      })),
    });
  }
  return (
    <div className="space-y-4">
      <form onSubmit={saveTiers} className="grid gap-3">
        {[0, 1].map((i) => (
          <div className="grid gap-2 sm:grid-cols-2" key={i}>
            <label>
              {t('tierName')} {i + 1}
              <Input name={`name${i}`} maxLength={20} defaultValue={models?.tier_variation[i]?.name} />
            </label>
            <label>
              {t('options')}
              <Input
                name={`options${i}`}
                defaultValue={models?.tier_variation[i]?.option_list.map((o) => o.option).join(', ')}
              />
            </label>
          </div>
        ))}
        {!models && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              {t('price')}
              <Input name="price" type="number" min="1000" required />
            </label>
            <label>
              {t('stock')}
              <Input name="stock" type="number" min="0" required />
            </label>
          </div>
        )}
        <Button type="submit" loading={busy}>
          {models ? t('save') : t('initVariants')}
        </Button>
      </form>
      {models && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>{t('variants')}</th>
                  <th>{t('sku')}</th>
                  <th>{t('price')}</th>
                  <th>{t('stock')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {models.model.map((m) => (
                  <tr key={m.model_id}>
                    <td>
                      {m.tier_index
                        .map((idx, i) => models.tier_variation[i]?.option_list[idx]?.option)
                        .join(' / ')}
                    </td>
                    <td colSpan={4}>
                      <form
                        className="flex min-w-max gap-2 py-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void saveModel(m.model_id, f);
                        }}
                      >
                        <Input name="sku" aria-label={t('sku')} defaultValue={m.model_sku} />
                        <Input
                          name="price"
                          aria-label={t('price')}
                          type="number"
                          min="1000"
                          max="1000000000"
                          required
                          defaultValue={m.price_info[0]?.original_price}
                        />
                        <Input
                          name="stock"
                          aria-label={t('stock')}
                          type="number"
                          min="0"
                          max="999999"
                          required
                          defaultValue={m.stock_info_v2.summary_info.total_available_stock}
                        />
                        <Button type="submit" loading={busy}>
                          {t('save')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setRemove(m.model_id)}
                        >
                          {t('delete')}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run('/product/add_model', {
                model_list: [
                  {
                    tier_index: models.tier_variation.map((_, i) => Number(f.get(`tier${i}`))),
                    model_sku: String(f.get('sku')),
                    original_price: Number(f.get('price')),
                    seller_stock: [{ stock: Number(f.get('stock')) }],
                  },
                ],
              });
            }}
          >
            {models.tier_variation.map((tier, i) => (
              <label key={i}>
                {tier.name}
                <select name={`tier${i}`} className="block rounded-xl border px-3 py-2">
                  {tier.option_list.map((o, index) => (
                    <option value={index} key={index}>
                      {o.option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              {t('sku')}
              <Input name="sku" />
            </label>
            <label>
              {t('price')}
              <Input name="price" type="number" min="1000" required />
            </label>
            <label>
              {t('stock')}
              <Input name="stock" type="number" min="0" required />
            </label>
            <Button type="submit" loading={busy}>
              {t('addVariant')}
            </Button>
          </form>
        </>
      )}
      <Modal open={remove !== null} title={t('delete')} onClose={() => setRemove(null)}>
        <p className="my-4">{t('confirmDelete')}</p>
        <Button
          loading={busy}
          onClick={() => void run('/product/delete_model', { model_id: remove }).then(() => setRemove(null))}
        >
          {t('delete')}
        </Button>
      </Modal>
    </div>
  );
}
