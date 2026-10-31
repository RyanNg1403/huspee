'use client';

import { useState } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { Modal, Spinner, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { call } from '@/lib/seller-api';
import { ActionError } from '../errors';
import { notifyOrdersChanged } from '../events';
import { btn, input } from '../ui';
import { orderUiMessages } from './messages';
import type { PickupAddress } from './types';

const VI_WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function dayChip(unix: number, lang: 'vi' | 'en') {
  const d = new Date(unix * 1000);
  const dm = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const weekday =
    lang === 'vi'
      ? VI_WEEKDAYS[d.getDay()]
      : new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d);
  return `${weekday} · ${dm}`;
}

const option = (selected: boolean) =>
  `flex flex-1 cursor-pointer items-start gap-3 rounded-[4px] border px-4 py-3 ${
    selected ? 'border-primary bg-primary-soft/40' : 'border-line-strong'
  }`;

/** S3.3: arrange pickup (address, day, slot) or drop-off for a ready-to-ship order. */
export function ShipModal({
  shop,
  orderSn,
  carrier,
  onClose,
  onShipped,
}: {
  shop: SellerShop;
  orderSn: string;
  carrier: string;
  onClose: () => void;
  onShipped: () => void;
}) {
  const t = useT(orderUiMessages);
  const { lang } = useLang();
  const toast = useToast();
  const [method, setMethod] = useState<'pickup' | 'dropoff'>('pickup');
  const [addressId, setAddressId] = useState<number | null>(null);
  const [changing, setChanging] = useState(false);
  const [day, setDay] = useState<number | null>(null);
  const [slotId, setSlotId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const params = useApi(
    () =>
      call<{ pickup: { address_list: PickupAddress[] } }>(shop.shop_id, '/logistics/get_shipping_parameter', {
        order_sn: orderSn,
      }),
    [shop.shop_id, orderSn],
  );
  const addresses = params.data?.pickup.address_list ?? [];
  const address = addresses.find((a) => a.address_id === addressId) ?? addresses[0];
  const contact = shop.addresses.find((a) => a.address_id === address?.address_id);
  const slots = address?.time_slot_list ?? [];
  const days = [...new Set(slots.map((s) => s.date))];
  const recommended = slots.find((s) => s.flags.includes('recommended'));
  const activeDay = day ?? recommended?.date ?? days[0];
  const daySlots = slots.filter((s) => s.date === activeDay);
  const activeSlot = daySlots.find((s) => s.pickup_time_id === slotId) ?? daySlots[0];

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await call(shop.shop_id, '/logistics/ship_order', {
        order_sn: orderSn,
        ...(method === 'pickup'
          ? { pickup: { address_id: address!.address_id, pickup_time_id: activeSlot?.pickup_time_id } }
          : { dropoff: {} }),
      });
      toast(t('shipped', { sn: orderSn }));
      notifyOrdersChanged();
      onShipped();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('shipTitle', { sn: orderSn })}>
      {params.loading ? (
        <div className="flex h-40 items-center justify-center text-primary">
          <Spinner />
        </div>
      ) : params.error ? (
        <ActionError error={params.error} />
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-muted">{t('carrier', { name: carrier })}</p>
          <fieldset>
            <legend className="mb-2 font-medium">{t('shipMethod', { name: carrier })}</legend>
            <div className="flex flex-col gap-3 sm:flex-row">
              {(['pickup', 'dropoff'] as const).map((m) => (
                <label key={m} className={option(method === m)}>
                  <input
                    type="radio"
                    name="ship-method"
                    className="mt-1"
                    checked={method === m}
                    onChange={() => setMethod(m)}
                  />
                  <span>
                    <span className="block font-medium">{t(m)}</span>
                    <span className="text-[13px] text-muted">
                      {m === 'pickup' ? t('pickupHint') : t('dropoffHint', { name: carrier })}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {method === 'pickup' &&
            (address ? (
              <>
                <div>
                  <p className="mb-2 font-medium">{t('pickupAddress')}</p>
                  <div className="flex items-start justify-between gap-3 rounded-[4px] border border-line px-3 py-2.5">
                    <div>
                      {contact && (
                        <p>
                          {contact.name} · {contact.phone}
                        </p>
                      )}
                      <p className="text-muted">
                        {[address.address, address.town, address.district, address.city]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                    {addresses.length > 1 && (
                      <button type="button" className={btn.link} onClick={() => setChanging((v) => !v)}>
                        {t('change')}
                      </button>
                    )}
                  </div>
                  {changing && (
                    <select
                      aria-label={t('pickupAddress')}
                      className={`${input} mt-2`}
                      value={address.address_id}
                      onChange={(e) => {
                        setAddressId(Number(e.target.value));
                        setDay(null);
                        setSlotId('');
                      }}
                    >
                      {addresses.map((a) => (
                        <option key={a.address_id} value={a.address_id}>
                          {[a.address, a.district, a.city].filter(Boolean).join(', ')}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {days.length > 0 && (
                  <fieldset>
                    <legend className="mb-2 font-medium">{t('pickupDate')}</legend>
                    <div className="flex flex-wrap gap-2">
                      {days.map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={d === activeDay}
                          onClick={() => {
                            setDay(d);
                            setSlotId('');
                          }}
                          className={`h-9 rounded-[4px] border px-3.5 ${
                            d === activeDay ? 'border-primary text-primary' : 'border-line-strong'
                          }`}
                        >
                          {dayChip(d, lang)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                {daySlots.length > 0 && (
                  <label className="block">
                    <span className="mb-2 block font-medium">{t('timeSlot')}</span>
                    <select
                      className={input}
                      value={activeSlot?.pickup_time_id}
                      onChange={(e) => setSlotId(e.target.value)}
                    >
                      {daySlots.map((s) => (
                        <option key={s.pickup_time_id} value={s.pickup_time_id}>
                          {s.time_text}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <p role="alert" className="text-primary">
                {t('noPickupAddress')}
              </p>
            ))}
          <ActionError error={error} />
          <div className="-mx-6 flex justify-end gap-3 border-t border-line-soft px-6 pt-4">
            <button type="button" className={btn.outline} onClick={onClose} disabled={pending}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={pending || (method === 'pickup' && !address)}
              onClick={() => void submit()}
            >
              {pending && <Spinner />}
              {t('confirm')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
