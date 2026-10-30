'use client';

import { useState } from 'react';
import type { Address } from '@huspee/sdk';
import { RequireRole } from '@/components/session';
import { Badge, Button, Icon, QueryState, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { AddressModal } from '../../_orders/AddressModal';
import { messages } from '../../_orders/messages';
import { getErrorMessage, panel } from '../../_orders/shared';

function AddressesView() {
  const t = useT(messages);
  const tCommon = useT(common);
  const toast = useToast();

  const {
    data: addresses,
    loading,
    error,
    reload,
  } = useApi<Address[]>(() => getApiClient().buyer.addresses.list(), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);

  const handleOpenAdd = () => {
    setEditingAddress(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (addr: Address) => {
    setEditingAddress(addr);
    setModalOpen(true);
  };

  const handleSetDefault = async (addressId: number) => {
    setActingId(addressId);
    try {
      await getApiClient().buyer.addresses.update(addressId, { is_default: true });
      toast(t('addressDefaultSet'));
      reload();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (addressId: number) => {
    if (!window.confirm(t('deleteAddressConfirm'))) return;
    setActingId(addressId);
    try {
      await getApiClient().buyer.addresses.remove(addressId);
      toast(t('addressDeleted'));
      reload();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{t('addressesTitle')}</h2>
        </div>
        <Button onClick={handleOpenAdd}>{t('addNewAddress')}</Button>
      </div>

      {/* Address List */}
      {loading || error ? (
        <QueryState loading={loading} error={error} retry={reload} />
      ) : !addresses || addresses.length === 0 ? (
        <div className={`${panel} py-16 text-center`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="pin" className="h-7 w-7" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-800">{t('noAddresses')}</h3>
          <Button onClick={handleOpenAdd}>{t('addNewAddress')}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <div
              key={addr.address_id}
              className={`${panel} flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{addr.name}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-sm text-gray-600">{addr.phone}</span>
                  {addr.is_default && <Badge tone="success">{t('defaultBadge')}</Badge>}
                </div>
                <div className="text-sm text-gray-700">{addr.address}</div>
                <div className="text-xs text-gray-500">
                  {addr.district}, {addr.city}, {addr.state}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => handleOpenEdit(addr)}>
                  {t('edit')}
                </Button>

                {!addr.is_default && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actingId === addr.address_id}
                      onClick={() => handleSetDefault(addr.address_id)}
                    >
                      {t('setDefault')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actingId === addr.address_id}
                      onClick={() => handleDelete(addr.address_id)}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      {t('delete')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Address Form Modal */}
      <AddressModal
        open={modalOpen}
        initialData={editingAddress}
        onClose={() => setModalOpen(false)}
        onSuccess={() => reload()}
      />
    </div>
  );
}

export default function AccountAddressesPage() {
  return (
    <RequireRole role="buyer">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <AddressesView />
      </div>
    </RequireRole>
  );
}
