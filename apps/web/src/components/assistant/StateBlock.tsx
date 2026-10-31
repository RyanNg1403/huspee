import type { ReactNode } from 'react';

/** A centred icon, a short title and its actions; used for sign-in, unavailable and busy states. */
export function StateBlock({
  icon,
  tone = 'neutral',
  title,
  children,
  framed = false,
}: {
  icon: ReactNode;
  tone?: 'neutral' | 'alert';
  title: string;
  children?: ReactNode;
  /** Inside the transcript the block sits in a card; as the whole panel body it does not. */
  framed?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 text-center ${framed ? 'rounded-lg border border-line px-4 py-5' : 'px-6 pt-8'}`}
      role={tone === 'alert' ? 'alert' : undefined}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full ${tone === 'alert' ? 'bg-primary-soft text-primary' : 'bg-gray-100 text-muted'}`}
      >
        {icon}
      </span>
      <strong className="text-[15px] font-semibold text-ink">{title}</strong>
      {children && <div className="flex w-full gap-2">{children}</div>}
    </div>
  );
}
