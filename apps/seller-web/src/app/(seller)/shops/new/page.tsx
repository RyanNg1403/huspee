'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSelectedShop } from '@/components/layout';
import { Button, Card, Input, Textarea, useToast } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { messages } from '../../_catalog/messages';
export default function NewShop() {
  const t = useT(messages);
  const toast = useToast();
  const router = useRouter();
  const { refresh, setSelectedShopId } = useSelectedShop();
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const s = (key: string) => String(form.get(key) || '');
    try {
      const shop = await getApiClient().seller.shops.create({
        shop_name: s('shop_name'),
        description: s('description'),
        city: s('city'),
        pickup_address: {
          name: s('contact'),
          phone: s('phone'),
          state: s('state'),
          city: s('city'),
          district: s('district'),
          address: s('address'),
        },
      });
      setSelectedShopId(shop.shop_id);
      refresh();
      router.push(`/shops/${shop.shop_id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('failedMutation'));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <h1 className="mb-4 text-2xl font-bold">{t('createShop')}</h1>
      <form onSubmit={submit} className="grid max-w-xl gap-4">
        {(['name', 'description', 'city', 'state', 'district', 'address', 'contact', 'phone'] as const).map(
          (key) => (
            <label key={key} className="grid gap-1">
              {t(key)}
              {key === 'description' ? (
                <Textarea name="description" />
              ) : (
                <Input name={key === 'name' ? 'shop_name' : key} required />
              )}
            </label>
          ),
        )}
        <Button loading={pending} type="submit">
          {t('create')}
        </Button>
      </form>
    </Card>
  );
}
