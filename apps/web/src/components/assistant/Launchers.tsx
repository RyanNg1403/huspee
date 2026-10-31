'use client';
import type { RefObject } from 'react';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from '@huspee/web-ui/components/assistant/messages';
import { ChevronGlyph, MicGlyph } from './icons';

/** Phones: a bar above the page's own bottom bar that opens the assistant sheet. */
export function LauncherBar({
  buttonRef,
  hidden,
  subject,
  live,
  onOpen,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  hidden: boolean;
  /** What the buyer is looking at, e.g. a product and its variant; without it the bar just offers the assistant. */
  subject?: { name: string; detail?: string };
  live: boolean;
  onOpen: () => void;
}) {
  const t = useT(messages);
  return (
    <button
      ref={buttonRef}
      type="button"
      hidden={hidden}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={hidden}
      data-testid="assistant-launcher"
      className="assistant-launcher fixed z-30 flex h-12 items-center gap-2.5 rounded-full border border-line bg-white pr-3 pl-1.5 text-left text-sm text-ink shadow-lift lg:hidden"
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
        <MicGlyph className="h-[18px] w-[18px]" />
        {live && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success-dot ring-2 ring-white" />}
      </span>
      {subject ? (
        <span className="flex min-w-0 flex-1 items-baseline gap-1">
          <span className="shrink-0">{t('launcherAbout')}</span>
          <strong className="min-w-0 truncate font-semibold">{subject.name}</strong>
          {subject.detail && <strong className="shrink-0 font-semibold">· {subject.detail}</strong>}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{t('launcher')}</span>
      )}
      <ChevronGlyph direction="up" className="h-[18px] w-[18px] shrink-0 text-subtle" />
    </button>
  );
}

/** Wide screens with the panel collapsed: a narrow rail that brings it back. */
export function PanelRail({ shopName, live, onOpen }: { shopName: string; live: boolean; onOpen: () => void }) {
  const t = useT(messages);
  return (
    <aside
      aria-label={t('open')}
      className="assistant-rail fixed right-0 z-30 hidden w-[76px] flex-col items-center gap-2 border-l border-line bg-white py-5 lg:flex"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('openFor', { shop: shopName })}
        className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary text-white hover:bg-primary-hover"
      >
        <MicGlyph className="h-6 w-6" />
        {live && <span aria-hidden="true" className="absolute top-0 right-0 h-3 w-3 rounded-full bg-success-dot ring-2 ring-white" />}
      </button>
      <span aria-hidden="true" className="w-14 text-center text-xs leading-tight text-muted">
        {t('launcher')}
      </span>
    </aside>
  );
}
