'use client';
import Image from 'next/image';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from '@huspee/web-ui/components/assistant/messages';
import { ChevronGlyph, ClockGlyph, SpeakingBars, Spinner } from './icons';
import type { PanelStatus } from './panel-status';

const iconButton =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-gray-100 hover:text-ink';

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

export function ShopAvatar({ name, logo, size = 'h-10 w-10' }: { name: string; logo?: string | null; size?: string }) {
  return logo ? (
    <Image src={logo} alt="" width={80} height={80} unoptimized className={`${size} shrink-0 rounded-full object-cover ring-1 ring-line`} />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-link text-xs font-bold text-white`}>
      {initials(name)}
    </span>
  );
}

function StatusLine({ status }: { status: PanelStatus }) {
  const t = useT(messages);
  const dot = {
    ready: 'bg-success-dot',
    live: 'bg-primary',
    error: 'bg-primary',
    off: 'bg-gray-400',
  } as const;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite">
      {status.indicator === 'spinner' && <Spinner className="h-3 w-3" />}
      {status.indicator === 'bars' && <SpeakingBars />}
      {status.indicator in dot && (
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[status.indicator as keyof typeof dot]}`} />
      )}
      <span className="truncate">{t(status.key)}</span>
    </span>
  );
}

/** Shop identity, live status and the panel's own controls. */
export function PanelHeader({
  shopName,
  logo,
  status,
  historyAvailable,
  historyOpen,
  onHistory,
  onCollapse,
  onMinimize,
}: {
  shopName: string;
  logo?: string | null;
  status: PanelStatus;
  historyAvailable: boolean;
  historyOpen: boolean;
  onHistory: () => void;
  onCollapse: () => void;
  onMinimize: () => void;
}) {
  const t = useT(messages);
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-line-soft py-2 pr-2 pl-4 lg:py-3.5">
      <ShopAvatar name={shopName} logo={logo} size="h-8 w-8 lg:h-10 lg:w-10" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold text-ink">{t('title', { shop: shopName })}</h2>
        <StatusLine status={status} />
      </div>
      {historyAvailable && (
        <button
          type="button"
          onClick={onHistory}
          aria-label={historyOpen ? t('back') : t('history')}
          aria-pressed={historyOpen}
          title={t('history')}
          className={`${iconButton} ${historyOpen ? 'bg-primary-soft text-primary' : ''}`}
        >
          <ClockGlyph className="h-5 w-5" />
        </button>
      )}
      <button type="button" onClick={onCollapse} aria-label={t('collapse')} className={`${iconButton} hidden lg:flex`}>
        <ChevronGlyph direction="right" className="h-5 w-5" />
      </button>
      <button type="button" onClick={onMinimize} aria-label={t('minimize')} className={`${iconButton} lg:hidden`}>
        <ChevronGlyph direction="down" className="h-5 w-5" />
      </button>
    </div>
  );
}
