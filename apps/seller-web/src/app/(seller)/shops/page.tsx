'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { Button, ErrorState, Modal, Skeleton, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatDate } from '@huspee/web-ui/lib/format';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useSelectedShop } from '@/components/layout';
import { Block, PageTitle, StatusDot, tableClass, tbodyClass, tdClass, thClass } from '@/components/shell';
import { shopMessages } from './messages';

function ConnectionStatus({ shop }: { shop: SellerShop }) {
  const t = useT(shopMessages);
  const { connected, grant_status: status } = shop.connection;
  if (connected) return <StatusDot tone="success">{t('connected')}</StatusDot>;
  return (
    <StatusDot>
      {t(status === 'REVOKED' ? 'revoked' : status === 'EXPIRED' ? 'expired' : 'disconnected')}
    </StatusDot>
  );
}

export default function Shops() {
  const t = useT(shopMessages);
  const { lang } = useLang();
  const toast = useToast();
  const { shops, loading, error, refresh } = useSelectedShop();
  const [pending, setPending] = useState<number | null>(null);
  const [disconnect, setDisconnect] = useState<SellerShop | null>(null);

  async function connect(id: number) {
    setPending(id);
    try {
      const { authorization_url } = await getApiClient().seller.shops.authorizationUrl(id);
      window.location.assign(authorization_url);
    } catch {
      toast(t('saveFailed'));
      setPending(null);
    }
  }
  async function confirmDisconnect() {
    if (!disconnect) return;
    setPending(disconnect.shop_id);
    try {
      await getApiClient().seller.shops.disconnect(disconnect.shop_id);
      setDisconnect(null);
      refresh();
    } catch {
      toast(t('saveFailed'));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <PageTitle
        actions={
          <Link
            href="/shops/new"
            className="inline-flex h-9 items-center rounded border border-primary px-4 text-primary hover:bg-primary-soft"
          >
            {t('createShop')}
          </Link>
        }
      >
        {t('connectionTitle')}
      </PageTitle>
      <Block>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <ErrorState message={t('failed')} onRetry={refresh} retryLabel={t('retry')} />
        ) : !shops.length ? (
          <p className="py-10 text-center text-muted">{t('noShops')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>
                    {t('shop')}
                  </th>
                  <th scope="col" className={thClass}>
                    {t('app')}
                  </th>
                  <th scope="col" className={thClass}>
                    {t('status')}
                  </th>
                  <th scope="col" className={thClass}>
                    {t('validUntil')}
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {shops.map((s) => (
                  <tr key={s.shop_id}>
                    <td className={tdClass}>
                      <Link href={`/shops/${s.shop_id}`} className="text-link hover:underline">
                        {s.shop_name}
                      </Link>
                      <div className="text-[13px] text-muted">{t('shopCode', { id: s.shop_id })}</div>
                    </td>
                    <td className={tdClass}>{s.connection.partner_name}</td>
                    <td className={tdClass}>
                      <ConnectionStatus shop={s} />
                    </td>
                    <td className={tdClass}>
                      {s.connection.connected && s.connection.grant_expire_time
                        ? formatDate(s.connection.grant_expire_time, lang)
                        : '—'}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      {s.connection.connected ? (
                        <button
                          type="button"
                          disabled={pending !== null}
                          onClick={() => setDisconnect(s)}
                          className="text-link hover:underline disabled:opacity-50"
                        >
                          {t('disconnect')}
                        </button>
                      ) : (
                        <Button
                          size="sm"
                          loading={pending === s.shop_id}
                          disabled={pending !== null}
                          onClick={() => void connect(s.shop_id)}
                          className="rounded!"
                        >
                          {t('connect')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>
      <Modal open={disconnect !== null} onClose={() => setDisconnect(null)} title={t('disconnect')}>
        {disconnect && (
          <p className="mb-5">
            {t('confirmDisconnect', { shop: disconnect.shop_name, app: disconnect.connection.partner_name })}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDisconnect(null)} className="rounded!">
            {t('cancel')}
          </Button>
          <Button loading={pending !== null} onClick={() => void confirmDisconnect()} className="rounded!">
            {t('disconnect')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
