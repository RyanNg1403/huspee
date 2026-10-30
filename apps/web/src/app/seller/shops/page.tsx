'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useSelectedShop } from '@/components/layout';
import { Button, Card, EmptyState, Modal, QueryState, useToast } from '@/components/ui';
import { useT } from '@/i18n/client';
import { getApiClient } from '@/lib/api';
import { messages } from '../_catalog/messages';
export default function Shops() {
  const t = useT(messages);
  const toast = useToast();
  const { shops, loading, error, refresh } = useSelectedShop();
  const [pending, setPending] = useState(false);
  const [disconnect, setDisconnect] = useState<number | null>(null);
  async function connect(id: number) {
    setPending(true);
    try {
      const x = await getApiClient().seller.shops.authorizationUrl(id);
      window.location.assign(x.authorization_url);
    } catch {
      toast(t('failedMutation'));
      setPending(false);
    }
  }
  async function remove() {
    if (disconnect === null) return;
    setPending(true);
    try {
      await getApiClient().seller.shops.disconnect(disconnect);
      refresh();
      setDisconnect(null);
      toast(t('saved'));
    } catch {
      toast(t('failedMutation'));
    } finally {
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
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-bold">{t('shops')}</h1>
        <Link className="text-primary" href="/seller/shops/new">
          {t('createShop')}
        </Link>
      </div>
      {!shops.length && <EmptyState title={t('noShop')} />}{' '}
      {shops.map((s) => (
        <Card key={s.shop_id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link className="font-semibold text-primary" href={`/seller/shops/${s.shop_id}`}>
                {s.shop_name}
              </Link>
              <p>
                {t('status')}: {s.status} · {s.connection.connected ? t('connected') : t('disconnected')}
              </p>
            </div>
            {s.connection.connected ? (
              <Button variant="outline" disabled={pending} onClick={() => setDisconnect(s.shop_id)}>
                {t('disconnect')}
              </Button>
            ) : (
              <Button loading={pending} onClick={() => connect(s.shop_id)}>
                {t('connect')}
              </Button>
            )}
          </div>
        </Card>
      ))}
      <Modal open={disconnect !== null} onClose={() => setDisconnect(null)} title={t('disconnect')}>
        <p className="my-4">{t('confirmDisconnect')}</p>
        <Button loading={pending} onClick={remove}>
          {t('disconnect')}
        </Button>{' '}
        <Button variant="ghost" onClick={() => setDisconnect(null)}>
          {t('cancel')}
        </Button>
      </Modal>
    </div>
  );
}
