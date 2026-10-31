'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useSession } from '@huspee/web-ui/components/session';
import { Button, Input, Textarea } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient } from '@huspee/web-ui/lib/api';
import { useSelectedShop } from '@/components/layout';
import { Steps } from '@/components/shell/Steps';
import { onboardingMessages } from '../messages';

const NAME_MAX = 80;
// Matches the API's Vietnamese phone rule; spaces between digits are removed before sending.
const PHONE_PATTERN = '(\\+84|0)( ?[0-9]){9,10}';
const ADDRESS_FIELDS = [
  ['sender', 'name'],
  ['phone', 'tel'],
  ['state', 'address-level1'],
  ['district', 'address-level2'],
  ['town', 'address-level3'],
  ['address', 'address-line1'],
] as const;

export default function NewShop() {
  const t = useT(onboardingMessages);
  const commonT = useT(common);
  const router = useRouter();
  const { user } = useSession();
  const { shops, refresh, setSelectedShopId } = useSelectedShop();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    setPending(true);
    setError('');
    try {
      const shop = await getApiClient().seller.shops.create({
        shop_name: value('shop_name'),
        description: value('description'),
        city: value('state'),
        pickup_address: {
          name: value('sender'),
          phone: value('phone').replace(/\s+/g, ''),
          state: value('state'),
          city: value('state'),
          district: value('district'),
          town: value('town') || undefined,
          address: value('address'),
        },
      });
      setSelectedShopId(shop.shop_id);
      refresh();
      router.push(`/shops/${shop.shop_id}/connect`);
    } catch (err) {
      setError(commonT(errorMessageKey(err)));
      setPending(false);
    }
  }

  const initial: Partial<Record<(typeof ADDRESS_FIELDS)[number][0], string>> = {
    sender: user?.name,
    phone: user?.phone ?? undefined,
  };
  return (
    <>
      <Steps current={1} />
      <section
        aria-labelledby="shop-title"
        className="mx-auto max-w-[720px] rounded bg-white px-6 py-7 shadow-card sm:px-8"
      >
        <h1 id="shop-title" className="mb-5 text-xl font-semibold">
          {t('shopInfo')}
        </h1>
        <form onSubmit={submit} className="flex flex-col gap-[18px]">
          <label className="flex flex-col gap-1.5">
            {t('shopName')}
            <span className="relative block">
              <Input
                name="shop_name"
                required
                minLength={3}
                maxLength={NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-describedby="shop-name-count"
                className="rounded! pr-16"
              />
              <span
                id="shop-name-count"
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-subtle"
              >
                {name.length}/{NAME_MAX}
              </span>
            </span>
          </label>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2">{t('pickupAddress')}</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {ADDRESS_FIELDS.map(([key, autoComplete]) => (
                <label key={key} className="flex flex-col">
                  <span className="sr-only">{t(key)}</span>
                  <Input
                    name={key}
                    placeholder={t(key)}
                    autoComplete={autoComplete}
                    defaultValue={initial[key] ?? ''}
                    required={key !== 'town'}
                    maxLength={key === 'address' ? 300 : 100}
                    {...(key === 'phone'
                      ? { type: 'tel', pattern: PHONE_PATTERN, title: t('phoneFormat') }
                      : {})}
                    className="rounded!"
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5">
            {t('description')}
            <Textarea name="description" rows={3} maxLength={3000} className="resize-y rounded!" />
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-primary">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-3 border-t border-[#f0f0f0] pt-5">
            {shops.length > 0 && (
              <Link
                href="/shops"
                className="inline-flex h-10 items-center rounded border border-line bg-white px-4 font-semibold hover:bg-gray-50"
              >
                {t('back')}
              </Link>
            )}
            <Button type="submit" loading={pending} className="rounded! px-6">
              {t('continue')}
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
