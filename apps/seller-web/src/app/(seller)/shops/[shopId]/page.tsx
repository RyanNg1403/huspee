'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useSelectedShop } from '@/components/layout';
import { Button, Card, ErrorState, Input, QueryState, Spinner, Textarea, useToast } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { common as commonMessages } from '@huspee/web-ui/i18n/common';
import { errorMessageKey } from '@huspee/web-ui/lib/api';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { call } from '../../_catalog/api';
import { messages } from '../../_catalog/messages';
type Profile = { shop_name: string; description: string; shop_logo: string };
type Policy = {
  version: number;
  shipping_policy: string;
  return_policy: string;
  warranty_policy: string;
  return_window_days: number;
  free_shipping_min_spend: number | null;
};
export default function ShopPage() {
  const id = Number(useParams().shopId);
  const query = useSearchParams();
  const t = useT(messages);
  const commonT = useT(commonMessages);
  const toast = useToast();
  const { shops, loading, error, refresh } = useSelectedShop();
  const shop = shops.find((s) => s.shop_id === id);
  const [pending, setPending] = useState(false);
  const callbackHandled = useRef(false);
  useEffect(() => {
    if (callbackHandled.current) return;
    callbackHandled.current = true;
    if (query.get('connected') === '1') {
      toast(t('connectionSuccess'));
      refresh();
    } else if (query.get('connect_error')) toast(`${t('connectionError')}: ${query.get('connect_error')}`);
  }, [id, query, refresh, t, toast]);
  const info = useApi(async () => {
    if (!shop?.connection.connected) return null;
    const [profile, holiday, policy] = await Promise.all([
      call<Profile>(id, '/shop/get_profile'),
      call<{ holiday_mode_on: boolean }>(id, '/shop/get_shop_holiday_mode'),
      call<Policy>(id, '/custom/shop/get_policies'),
    ]);
    return { profile, holiday, policy };
  }, [id, shop?.connection.connected]);
  async function act(fn: () => Promise<unknown>) {
    setPending(true);
    try {
      await fn();
      toast(t('saved'));
      info.reload();
      refresh();
    } catch (e) {
      toast(
        e instanceof Error && e.message.includes('error_version_conflict')
          ? t('conflict')
          : e instanceof Error
            ? e.message
            : t('failedMutation'),
      );
      info.reload();
    } finally {
      setPending(false);
    }
  }
  async function connect() {
    setPending(true);
    try {
      const r = await getApiClient().seller.shops.authorizationUrl(id);
      window.location.assign(r.authorization_url);
    } catch {
      toast(t('failedMutation'));
      setPending(false);
    }
  }
  if (loading || error)
    return (
      <QueryState
        loading={loading}
        error={error}
        errorMessage={t('failed')}
        retry={refresh}
        retryLabel={t('retry')}
        spinner
      />
    );
  if (!shop) return <ErrorState message={t('noShop')} />;
  if (!shop.connection.connected)
    return (
      <Card>
        <h1 className="text-2xl font-bold">{shop.shop_name}</h1>
        <p>{t('disconnected')}</p>
        <Button loading={pending} onClick={connect}>
          {t('connect')}
        </Button>
      </Card>
    );
  if (info.loading) return <Spinner />;
  if (info.error || !info.data)
    return (
      <ErrorState
        message={commonT(errorMessageKey(info.error))}
        onRetry={info.reload}
        retryLabel={t('retry')}
      />
    );
  const { profile, holiday, policy } = info.data;
  function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const logo = String(f.get('logo') || '');
    void act(() =>
      call(id, '/shop/update_profile', {
        shop_name: String(f.get('name')),
        description: String(f.get('description')),
        ...(logo ? { shop_logo: logo } : {}),
      }),
    );
  }
  function savePolicy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void act(() =>
      call(id, '/custom/shop/update_policies', {
        expected_version: policy.version,
        shipping_policy: String(f.get('shipping')),
        return_policy: String(f.get('returns')),
        warranty_policy: String(f.get('warranty')),
        return_window_days: Number(f.get('days')),
        free_shipping_min_spend: f.get('free') ? Number(f.get('free')) : null,
      }),
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-bold">{t('profile')}</h1>
        <form key={JSON.stringify(profile)} onSubmit={saveProfile} className="mt-4 grid gap-3">
          {(['name', 'description', 'logo'] as const).map((k) => (
            <label className="grid gap-1" key={k}>
              {t(k)}
              {k === 'description' ? (
                <Textarea name={k} defaultValue={profile.description} />
              ) : (
                <Input
                  name={k}
                  defaultValue={k === 'name' ? profile.shop_name : profile.shop_logo}
                  required={k === 'name'}
                />
              )}
            </label>
          ))}
          <Button type="submit" loading={pending}>
            {t('save')}
          </Button>
        </form>
        <label className="mt-4 flex gap-2">
          <input
            type="checkbox"
            checked={holiday.holiday_mode_on}
            disabled={pending}
            onChange={(e) =>
              void act(() => call(id, '/shop/set_shop_holiday_mode', { holiday_mode_on: e.target.checked }))
            }
          />
          {t('holiday')}
        </label>
      </Card>
      <Card>
        <h2 className="text-xl font-bold">{t('policies')}</h2>
        <form key={policy.version} onSubmit={savePolicy} className="mt-4 grid gap-3">
          {(['shipping', 'returns', 'warranty'] as const).map((k, i) => (
            <label key={k} className="grid gap-1">
              {t(k)}
              <Textarea
                required
                name={k}
                defaultValue={[policy.shipping_policy, policy.return_policy, policy.warranty_policy][i]}
              />
            </label>
          ))}
          <label>
            {t('returnDays')}
            <Input name="days" type="number" min="0" max="30" defaultValue={policy.return_window_days} />
          </label>
          <label>
            {t('freeShipping')}
            <Input name="free" type="number" min="0" defaultValue={policy.free_shipping_min_spend ?? ''} />
          </label>
          <Button loading={pending} type="submit">
            {t('save')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
