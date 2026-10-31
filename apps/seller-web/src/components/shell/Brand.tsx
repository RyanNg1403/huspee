import type { ReactNode } from 'react';
import { Logo } from '@huspee/web-ui/components/brand/Logo';

/** Logo, divider and channel name, as in every Seller Centre header. */
export function Brand({ channel }: { channel: string }) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <Logo className="shrink-0 text-[19px] text-ink [&>span:first-child]:h-7 [&>span:first-child]:w-7 [&>span:first-child]:rounded-md [&>span:first-child]:shadow-none [&_svg]:h-4 [&_svg]:w-4" />
      <span aria-hidden="true" className="h-5 border-l border-[#d9d9d9]" />
      <span className="truncate text-base text-muted">{channel}</span>
    </div>
  );
}

/** Header bar shared by the Seller Centre shell and its sign-in and onboarding pages. */
export function HeaderBar({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 bg-white px-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)] md:px-6">
      {children}
    </header>
  );
}

/** Header-only frame for sign-in, sign-up and shop onboarding. */
export function FocusFrame({
  channel,
  right,
  children,
}: {
  channel: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-page">
      <HeaderBar>
        <Brand channel={channel} />
        <div className="ml-auto flex items-center gap-4">{right}</div>
      </HeaderBar>
      <main className="px-4 pt-8 pb-12 md:px-6">{children}</main>
    </div>
  );
}
