'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { Button, Card, Input, Select } from '@huspee/web-ui/components/ui';
import { useSession } from '@huspee/web-ui/components/session';
import { useT } from '@huspee/web-ui/i18n/client';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient } from '@huspee/web-ui/lib/api';
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function AuthForm({ signup = false, seller = false }: { signup?: boolean; seller?: boolean }) {
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const t = useT(common);
  const router = useRouter();
  const params = useSearchParams();
  const { login, refresh } = useSession();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const role = seller || data.get('role') === 'seller' ? 'seller' : 'buyer';
    setLoading(true);
    setError('');
    try {
      if (signup) {
        await getApiClient().auth.signup({
          email: String(data.get('email')),
          password: String(data.get('password')),
          name: String(data.get('name')),
          phone: String(data.get('phone') || '') || undefined,
          account_type: role,
        });
        await refresh();
      } else await login(String(data.get('email')), String(data.get('password')));
      const next = params.get('next');
      router.push(
        next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
          ? next
          : signup && role === 'seller'
            ? seller
              ? '/shops'
              : '/seller/shops'
            : '/',
      );
      router.refresh();
    } catch (err) {
      setError(t(errorMessageKey(err)));
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card className="mx-auto mt-8 max-w-md">
      <h1 className="mb-5 text-2xl font-bold">{t(signup ? 'signup' : 'login')}</h1>
      <form method="post" onSubmit={submit} className="space-y-4">
        {signup && (
          <>
            <label className="block">
              {t('name')}
              <Input name="name" autoComplete="name" required />
            </label>
            <label className="block">
              {t('phone')}
              <Input name="phone" autoComplete="tel" />
            </label>
            {!seller && (
              <label className="block">
                {t('role')}
                <Select name="role">
                  <option value="buyer">{t('buyer')}</option>
                  <option value="seller">{t('sellerRole')}</option>
                </Select>
              </label>
            )}
          </>
        )}
        <label className="block">
          {t('email')}
          <Input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="block">
          {t('password')}
          <Input
            name="password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            minLength={signup ? 8 : undefined}
          />
        </label>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!ready} loading={loading} className="w-full">
          {t(signup ? 'signup' : 'login')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link
          className="text-primary"
          href={`${signup ? '/login' : '/signup'}${params.toString() ? `?${params}` : ''}`}
        >
          {t(signup ? 'login' : 'signup')}
        </Link>
      </p>
    </Card>
  );
}
