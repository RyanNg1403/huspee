'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, ErrorState, Input, Skeleton, Textarea, useToast } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { useSelectedShop } from '@/components/layout';
import { Block, PageTitle, StatusDot } from '@/components/shell';
import { call } from '@/lib/seller-api';
import { shopMessages } from '../messages';

type Profile = { shop_name: string; description: string; shop_logo: string };
type Policy = {
  version: number;
  shipping_policy: string;
  return_policy: string;
  warranty_policy: string;
  return_window_days: number;
  free_shipping_min_spend: number | null;
};

function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
      <label htmlFor={htmlFor} className="sm:pt-2.5 sm:text-right">
        {label}
      </label>
      <div className="max-w-[640px]">{children}</div>
    </div>
  );
}

export default function ShopProfile() {
  const id = Number(useParams().shopId);
  const query = useSearchParams();
  const t = useT(shopMessages);
  const commonT = useT(common);
  const toast = useToast();
  const router = useRouter();
  const field = useId();
  const { shops, loading, error, refresh } = useSelectedShop();
  const shop = shops.find((s) => s.shop_id === id);
  const connected = !!shop?.connection.connected;
  const [pending, setPending] = useState(false);
  const callbackHandled = useRef(false);

  useEffect(() => {
    if (callbackHandled.current || query.get('connected') !== '1') return;
    callbackHandled.current = true;
    toast(t('connectedNotice'));
    refresh();
  }, [query, refresh, t, toast]);
  // A shop without an active grant is sent to the connection step, keeping a callback error.
  useEffect(() => {
    if (loading || !shop || connected) return;
    const reason = query.get('connect_error');
    router.replace(`/shops/${id}/connect${reason ? `?connect_error=${encodeURIComponent(reason)}` : ''}`);
  }, [loading, shop, connected, id, query, router]);

  const info = useApi(async () => {
    if (!connected) return null;
    const [profile, holiday, policy] = await Promise.all([
      call<Profile>(id, '/shop/get_profile'),
      call<{ holiday_mode_on: boolean }>(id, '/shop/get_shop_holiday_mode'),
      call<Policy>(id, '/custom/shop/get_policies'),
    ]);
    return { profile, holiday, policy };
  }, [id, connected]);

  async function act(fn: () => Promise<unknown>) {
    setPending(true);
    try {
      await fn();
      toast(t('saved'));
      refresh();
    } catch (e) {
      toast(
        e instanceof Error && e.message.includes('error_version_conflict') ? t('conflict') : t('saveFailed'),
      );
    } finally {
      info.reload();
      setPending(false);
    }
  }

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={t('failed')} onRetry={refresh} retryLabel={t('retry')} />;
  if (!shop) return <ErrorState message={t('notFound')} />;
  if (!connected) return <Skeleton className="h-96 w-full" />;

  const title = (
    <PageTitle
      actions={
        <span className="flex items-center gap-3 text-[13px] text-muted">
          {t('shopCode', { id })}
          <StatusDot tone="success">{t('connectedTo', { app: shop.connection.partner_name })}</StatusDot>
        </span>
      }
    >
      {t('profileTitle')}
    </PageTitle>
  );
  if (info.loading)
    return (
      <>
        {title}
        <Skeleton className="h-96 w-full" />
      </>
    );
  if (info.error || !info.data)
    return (
      <>
        {title}
        <ErrorState
          message={commonT(errorMessageKey(info.error))}
          onRetry={info.reload}
          retryLabel={t('retry')}
        />
      </>
    );
  const { profile, holiday, policy } = info.data;

  function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const logo = String(f.get('logo') ?? '').trim();
    void act(() =>
      call(id, '/shop/update_profile', {
        shop_name: String(f.get('name') ?? '').trim(),
        description: String(f.get('description') ?? ''),
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
        shipping_policy: String(f.get('shipping') ?? ''),
        return_policy: String(f.get('returns') ?? ''),
        warranty_policy: String(f.get('warranty') ?? ''),
        return_window_days: Number(f.get('days')),
        free_shipping_min_spend: f.get('free') ? Number(f.get('free')) : null,
      }),
    );
  }

  return (
    <>
      {title}
      <div className="flex flex-col gap-4">
        <Block title={t('basics')}>
          <form key={JSON.stringify(profile)} onSubmit={saveProfile} className="flex flex-col gap-4">
            <Row label={t('name')} htmlFor={`${field}-name`}>
              <Input
                id={`${field}-name`}
                name="name"
                defaultValue={profile.shop_name}
                required
                minLength={3}
                maxLength={80}
                className="rounded!"
              />
            </Row>
            <Row label={t('description')} htmlFor={`${field}-description`}>
              <Textarea
                id={`${field}-description`}
                name="description"
                rows={3}
                defaultValue={profile.description}
                className="rounded!"
              />
            </Row>
            <Row label={t('logo')} htmlFor={`${field}-logo`}>
              <Input
                id={`${field}-logo`}
                name="logo"
                type="url"
                defaultValue={profile.shop_logo}
                className="rounded!"
              />
            </Row>
            <Row label={t('holiday')} htmlFor={`${field}-holiday`}>
              <input
                id={`${field}-holiday`}
                type="checkbox"
                checked={holiday.holiday_mode_on}
                disabled={pending}
                onChange={(e) =>
                  void act(() =>
                    call(id, '/shop/set_shop_holiday_mode', { holiday_mode_on: e.target.checked }),
                  )
                }
                className="mt-3 h-4 w-4"
              />
            </Row>
            <div className="sm:pl-[204px]">
              <Button type="submit" loading={pending} className="rounded! px-6">
                {t('save')}
              </Button>
            </div>
          </form>
        </Block>
        <Block title={t('policies')}>
          <form key={policy.version} onSubmit={savePolicy} className="flex flex-col gap-4">
            {(
              [
                ['shipping', policy.shipping_policy],
                ['returns', policy.return_policy],
                ['warranty', policy.warranty_policy],
              ] as const
            ).map(([key, value]) => (
              <Row key={key} label={t(key)} htmlFor={`${field}-${key}`}>
                <Textarea
                  id={`${field}-${key}`}
                  name={key}
                  rows={2}
                  required
                  defaultValue={value}
                  className="rounded!"
                />
              </Row>
            ))}
            <Row label={t('returnDays')} htmlFor={`${field}-days`}>
              <Input
                id={`${field}-days`}
                name="days"
                type="number"
                min="0"
                max="30"
                defaultValue={policy.return_window_days}
                className="max-w-40 rounded!"
              />
            </Row>
            <Row label={t('freeShipping')} htmlFor={`${field}-free`}>
              <Input
                id={`${field}-free`}
                name="free"
                type="number"
                min="0"
                defaultValue={policy.free_shipping_min_spend ?? ''}
                className="max-w-60 rounded!"
              />
            </Row>
            <div className="sm:pl-[204px]">
              <Button type="submit" loading={pending} className="rounded! px-6">
                {t('save')}
              </Button>
            </div>
          </form>
        </Block>
      </div>
    </>
  );
}
