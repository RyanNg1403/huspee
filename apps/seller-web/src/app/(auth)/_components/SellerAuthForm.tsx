'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { Button, Input } from '@huspee/web-ui/components/ui';
import { useSession } from '@huspee/web-ui/components/session';
import { useT } from '@huspee/web-ui/i18n/client';
import { common } from '@huspee/web-ui/i18n/common';
import { errorMessageKey, getApiClient, isApiError } from '@huspee/web-ui/lib/api';
import { authMessages } from '../messages';

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** Only same-origin paths are followed after sign-in. */
function safeNext(next: string | null): string | null {
  return next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : null;
}

export function SellerAuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  // Native submit before hydration would post credentials to the page URL.
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const t = useT(authMessages);
  const commonT = useT(common);
  const router = useRouter();
  const params = useSearchParams();
  const { login, refresh } = useSession();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function message(err: unknown) {
    if (isApiError(err) && err.status === 401 && !signup) return t('invalidLogin');
    if (isApiError(err) && err.status === 403) return t('notSeller');
    if (isApiError(err) && err.status === 409 && signup) return t('emailTaken');
    return commonT(errorMessageKey(err));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    setPending(true);
    setError('');
    try {
      if (signup) {
        await getApiClient().auth.signup({
          name: value('name'),
          email: value('email'),
          phone: value('phone').replace(/\s+/g, '') || undefined,
          password: String(form.get('password') ?? ''),
          account_type: 'seller',
        });
        await refresh();
      } else {
        await login(value('email'), String(form.get('password') ?? ''));
      }
      router.push(safeNext(params.get('next')) ?? (signup ? '/shops/new' : '/'));
      router.refresh();
    } catch (err) {
      setError(message(err));
      setPending(false);
    }
  }

  const query = params.toString() ? `?${params}` : '';
  return (
    <section
      aria-labelledby="auth-title"
      className="mx-auto max-w-[440px] rounded bg-white px-8 pt-7 pb-6 shadow-card"
    >
      <h1 id="auth-title" className="mb-5 text-xl font-semibold">
        {t(signup ? 'signupTitle' : 'loginTitle')}
      </h1>
      <form method="post" onSubmit={submit} className="flex flex-col gap-4">
        {signup && (
          <label className="flex flex-col gap-1.5">
            {t('name')}
            <Input name="name" autoComplete="name" required maxLength={120} className="rounded!" />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          {t('email')}
          <Input name="email" type="email" autoComplete="email" required className="rounded!" />
        </label>
        {signup && (
          <label className="flex flex-col gap-1.5">
            {t('phone')}
            <Input name="phone" type="tel" autoComplete="tel" maxLength={20} className="rounded!" />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          {t('password')}
          <span className="relative block">
            <Input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              required
              minLength={signup ? 8 : undefined}
              className="rounded! pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={t(showPassword ? 'hidePasswordLabel' : 'showPasswordLabel')}
              className="absolute top-1 right-1 h-8 rounded px-2.5 text-[13px] text-link hover:underline"
            >
              {t(showPassword ? 'hidePassword' : 'showPassword')}
            </button>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-[13px] text-primary">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={!ready}
          loading={pending}
          className="h-11! w-full rounded! text-[15px]!"
        >
          {t(signup ? 'signup' : 'login')}
        </Button>
      </form>
      <p className="mt-5 text-center text-muted">
        {t(signup ? 'haveAccount' : 'noAccount')}{' '}
        <Link href={`${signup ? '/login' : '/signup'}${query}`} className="text-link hover:underline">
          {t(signup ? 'login' : 'signup')}
        </Link>
      </p>
    </section>
  );
}
