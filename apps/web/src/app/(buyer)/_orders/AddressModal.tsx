'use client';

import { useState } from 'react';
import type { Address } from '@huspee/sdk';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { common } from '@/i18n/common';
import { getApiClient } from '@/lib/api';
import { messages } from './messages';
import { getErrorMessage } from './shared';

function AddressForm({
  initialData,
  onClose,
  onSuccess,
}: {
  initialData?: Address | null;
  onClose: () => void;
  onSuccess: (address: Address) => void;
}) {
  const t = useT(messages);
  const tCommon = useT(common);
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState(initialData?.name ?? '');
  const [phone, setPhone] = useState(initialData?.phone ?? '');
  const [state, setState] = useState(initialData?.state ?? '');
  const [city, setCity] = useState(initialData?.city ?? '');
  const [district, setDistrict] = useState(initialData?.district ?? '');
  const [address, setAddress] = useState(initialData?.address ?? '');
  const [isDefault, setIsDefault] = useState(initialData?.is_default ?? false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const client = getApiClient();
      let res: Address;
      if (initialData) {
        res = await client.buyer.addresses.update(initialData.address_id, {
          name,
          phone,
          state,
          city,
          district,
          address,
          is_default: isDefault,
        });
      } else {
        res = await client.buyer.addresses.create({
          name,
          phone,
          state,
          city,
          district,
          address,
          is_default: isDefault,
        });
      }
      toast(t('addressSaved'));
      onSuccess(res);
      onClose();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('recipientName')}</label>
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('recipientName')}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('recipientPhone')}</label>
        <Input
          required
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('recipientPhone')}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">{t('state')}</label>
          <Input
            required
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder={t('placeholderState')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">{t('city')}</label>
          <Input
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t('placeholderCity')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">{t('district')}</label>
          <Input
            required
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            placeholder={t('placeholderDistrict')}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('detailedAddress')}</label>
        <Input
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('placeholderDetailedAddress')}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="modal_is_default"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <label htmlFor="modal_is_default" className="text-sm text-gray-700">
          {t('setAsDefault')}
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          {t('cancel')}
        </Button>
        <Button type="submit" loading={submitting}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

export function AddressModal({
  open,
  onClose,
  onSuccess,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (address: Address) => void;
  initialData?: Address | null;
}) {
  const t = useT(messages);

  return (
    <Modal open={open} onClose={onClose} title={initialData ? t('editAddress') : t('addNewAddress')}>
      {open && (
        <AddressForm
          key={initialData?.address_id ?? 'new'}
          initialData={initialData}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      )}
    </Modal>
  );
}
