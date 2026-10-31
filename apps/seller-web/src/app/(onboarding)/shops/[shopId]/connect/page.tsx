'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@huspee/web-ui/components/session';
import { Button, ErrorState, Skeleton } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient } from '@huspee/web-ui/lib/api';
import { useSelectedShop } from '@/components/layout';
import { ShellIcon } from '@/components/shell/icons';
import { Steps } from '@/components/shell/Steps';
import { onboardingMessages } from '../../messages';

const PERMISSIONS = ['permProducts', 'permOrders', 'permVouchers', 'permShop'] as const;

/** Step 3: start the shared-Partner authorization; consent itself is the platform page it opens. */
export default function ConnectShop() {
  const id = Number(useParams().shopId);
  const callbackError = useSearchParams().get('connect_error');
  const t = useT(onboardingMessages);
  const commonT = useT(common);
  const router = useRouter();
  const { user, logout } = useSession();
  const { shops, loading, error, refresh } = useSelectedShop();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const shop = shops.find((s) => s.shop_id === id);
  const connected = !!shop?.connection.connected;

  useEffect(() => {
    if (connected) router.replace(`/shops/${id}`);
  }, [connected, id, router]);

  if (loading || connected) return <Skeleton className="mx-auto h-96 max-w-[560px]" />;
  if (error) return <ErrorState message={t('failed')} onRetry={refresh} retryLabel={t('retry')} />;
  if (!shop || !user) return <ErrorState message={t('notFound')} />;

  const choices = shops.filter((s) => !s.connection.connected && (s.role === 'owner' || s.shop_id === id));
  async function allow() {
    setPending(true);
    setFailure('');
    try {
      const { authorization_url } = await getApiClient().seller.shops.authorizationUrl(id);
      window.location.assign(authorization_url);
    } catch (err) {
      setFailure(commonT(errorMessageKey(err)));
      setPending(false);
    }
  }
  async function switchAccount() {
    await logout();
    router.replace(`/login?next=${encodeURIComponent(`/shops/${id}/connect`)}`);
  }

  const alert = failure || (callbackError ? t('connectFailed', { reason: callbackError }) : '');
  return (
    <>
      <Steps current={2} />
      <section
        aria-labelledby="connect-title"
        className="mx-auto max-w-[560px] rounded bg-white px-6 pt-7 pb-6 shadow-card sm:px-8"
      >
        <div className="mb-5 flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-ink text-white">
            <ShellIcon name="wrench" className="h-[26px] w-[26px]" />
          </span>
          <div>
            <h1 id="connect-title" className="text-xl font-semibold">
              {t('wantsAccess', { app: shop.connection.partner_name })}
            </h1>
            <p className="text-[13px] text-muted">{t('platformApp')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-[#f0f0f0] py-3">
          <span className="min-w-0 truncate">
            {user.name} <span className="text-muted">· {user.email}</span>
          </span>
          <button
            type="button"
            onClick={() => void switchAccount()}
            className="text-[13px] text-link hover:underline"
          >
            {t('switchAccount')}
          </button>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 font-semibold">{t('chooseShop')}</legend>
          <div className="flex flex-col gap-2">
            {choices.map((s) => (
              <label
                key={s.shop_id}
                className={`flex cursor-pointer items-center gap-2.5 rounded border p-3 ${
                  s.shop_id === id ? 'border-primary bg-[#fffaf8]' : 'border-line'
                }`}
              >
                <input
                  type="radio"
                  name="shop"
                  value={s.shop_id}
                  checked={s.shop_id === id}
                  onChange={() => router.replace(`/shops/${s.shop_id}/connect`)}
                  className="h-4 w-4"
                />
                <span className="min-w-0 flex-1 truncate">{s.shop_name}</span>
                <span className="text-[13px] text-muted">{t('shopCode', { id: s.shop_id })}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <h2 className="mt-5 mb-1 font-semibold">{t('permissions')}</h2>
        <ul>
          {PERMISSIONS.map((key) => (
            <li key={key} className="flex items-start gap-2.5 py-2">
              <ShellIcon name="check" className="mt-0.5 h-3.5 w-3.5 text-success" strokeWidth={2.6} />
              {t(key)}
            </li>
          ))}
        </ul>
        {alert && (
          <p role="alert" className="mt-3 text-[13px] text-primary">
            {alert}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3 border-t border-[#f0f0f0] pt-4">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded border border-line bg-white px-4 font-semibold hover:bg-gray-50"
          >
            {t('deny')}
          </Link>
          <Button loading={pending} onClick={() => void allow()} className="rounded! px-6">
            {t('allow')}
          </Button>
        </div>
      </section>
    </>
  );
}
