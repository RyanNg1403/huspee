'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@huspee/sdk';
import { LanguageSwitch } from '@huspee/web-ui/components/layout/LanguageSwitch';
import { useSession } from '@huspee/web-ui/components/session';
import { useT } from '@huspee/web-ui/i18n';
import { CloseIcon } from './icons';
import { messages } from './messages';
import { useOverlay } from './use-overlay';

function useAccountLinks(unread: number) {
  const t = useT(messages);
  return [
    { href: '/orders', label: t('orders'), count: 0 },
    { href: '/returns', label: t('returns'), count: 0 },
    { href: '/messages', label: t('messages'), count: unread },
    { href: '/account/addresses', label: t('addresses'), count: 0 },
  ];
}

/** First letter of the given name ("Nguyễn Văn An" → "A"). */
function initialOf(user: UserProfile) {
  return user.name.trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? '';
}

function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="min-w-[18px] rounded-full bg-primary px-1.5 text-center text-[11px] leading-[18px] font-semibold text-white">
      {count}
    </span>
  );
}

/** Top-bar account entry on desktop: sign-up/log-in links, or the buyer's name with a menu. */
export function AccountMenu({ unread }: { unread: number }) {
  const t = useT(messages);
  const router = useRouter();
  const { user, status, logout } = useSession();
  const links = useAccountLinks(unread);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      ref.current?.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (status === 'loading') return null;
  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex items-center gap-2.5 font-medium">
        <Link href="/signup" className="hover:opacity-85">
          {t('signup')}
        </Link>
        <span aria-hidden="true" className="h-3.5 w-px bg-white/60" />
        <Link href="/login" className="hover:opacity-85">
          {t('login')}
        </Link>
      </div>
    );
  }
  return (
    <details
      ref={ref}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="relative"
    >
      <summary
        aria-label={`${t('account')}: ${user.name}`}
        className="flex cursor-pointer list-none items-center gap-1.5 font-semibold [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-hidden="true"
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-xs text-primary"
        >
          {initialOf(user)}
        </span>
        <span className="max-w-40 truncate">{user.name}</span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-48 rounded-sm bg-white py-1 text-sm text-ink shadow-lift">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            className="flex h-10 items-center justify-between px-4 hover:bg-gray-50 hover:text-primary"
          >
            {link.label}
            <CountBadge count={link.count} />
          </Link>
        ))}
        <div className="my-1 border-t border-line" />
        <button
          type="button"
          onClick={() => void logout().then(() => router.push('/'))}
          className="flex h-10 w-full items-center px-4 text-left text-muted hover:bg-gray-50 hover:text-primary"
        >
          {t('logout')}
        </button>
      </div>
    </details>
  );
}

/** "Tôi" sheet above the mobile tab bar: account links, language and log out. */
export function AccountSheet({ unread, onClose }: { unread: number; onClose: () => void }) {
  const t = useT(messages);
  const router = useRouter();
  const { user, status, logout } = useSession();
  const links = useAccountLinks(unread);
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(true, panel, onClose);
  const signedIn = status === 'authenticated' && user;
  const row = 'flex h-12 items-center justify-between border-b border-line-soft px-4 text-ink';
  return (
    <div className="fixed inset-0 z-[60] md:hidden">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('account')}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-lg bg-white pb-[env(safe-area-inset-bottom)] text-sm"
      >
        <div className="flex items-center gap-3 bg-primary px-4 py-3 text-white">
          {signedIn ? (
            <>
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-base font-bold text-primary"
              >
                {initialOf(user)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{user.name}</span>
                <span className="block truncate text-xs text-white/85">{user.email}</span>
              </span>
            </>
          ) : (
            <span className="flex flex-1 gap-2">
              <Link
                href="/login"
                onClick={onClose}
                className="flex h-9 items-center rounded-sm bg-white px-4 font-semibold text-primary"
              >
                {t('login')}
              </Link>
              <Link
                href="/signup"
                onClick={onClose}
                className="flex h-9 items-center rounded-sm border border-white px-4 font-semibold"
              >
                {t('signup')}
              </Link>
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-10 w-10 shrink-0 items-center justify-center"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {signedIn &&
          links.map((link) => (
            <Link key={link.href} href={link.href} onClick={onClose} className={row}>
              {link.label}
              <CountBadge count={link.count} />
            </Link>
          ))}
        <div className={row}>
          <span>{t('language')}</span>
          <LanguageSwitch />
        </div>
        {signedIn && (
          <button
            type="button"
            onClick={() => {
              onClose();
              void logout().then(() => router.push('/'));
            }}
            className="flex h-12 w-full items-center px-4 text-left text-muted"
          >
            {t('logout')}
          </button>
        )}
      </div>
    </div>
  );
}
