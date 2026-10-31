'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@huspee/web-ui/components/session';
import { LanguageSwitch } from '@huspee/web-ui/components/layout/LanguageSwitch';
import { useT } from '@huspee/web-ui/i18n/client';
import { ShellIcon } from './icons';
import { shellMessages } from './messages';

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8e8e8] text-[13px] font-semibold text-muted"
    >
      {/* Vietnamese names put the given name last. */}
      {(name.trim().split(/\s+/).pop() ?? '').charAt(0).toUpperCase()}
    </span>
  );
}

/** Signed-in seller with language and sign-out. */
export function AccountMenu({ afterLogout = '/login' }: { afterLogout?: string }) {
  const t = useT(shellMessages);
  const { user, logout } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  async function signOut() {
    setPending(true);
    try {
      await logout();
      router.replace(afterLogout);
    } finally {
      setPending(false);
    }
  }
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t('account')}: ${user.name}`}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded py-1 text-ink"
      >
        <Avatar name={user.name} />
        <span className="hidden max-w-48 truncate sm:inline">{user.name}</span>
        <ShellIcon name="chevron" className="h-3.5 w-3.5 text-muted" strokeWidth={2} />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-40 mt-2 w-64 rounded border border-line bg-white py-2 shadow-lift"
        >
          <div className="border-b border-line-soft px-4 pb-3">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-[13px] text-muted">{user.email}</p>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
            <span className="text-muted">{t('language')}</span>
            <LanguageSwitch />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => void signOut()}
            className="block w-full px-4 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50"
          >
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
