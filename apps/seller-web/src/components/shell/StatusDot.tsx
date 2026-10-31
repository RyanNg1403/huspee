import type { ReactNode } from 'react';

const TONES = { action: 'bg-primary', success: 'bg-success-dot', neutral: 'bg-[#8c8c8c]' } as const;
export type StatusTone = keyof typeof TONES;

/** Status as a small dot plus text, never a coloured pill. */
export function StatusDot({
  tone = 'neutral',
  size = 'sm',
  children,
}: {
  tone?: StatusTone;
  size?: 'sm' | 'md';
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`shrink-0 rounded-full ${size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'} ${TONES[tone]}`}
      />
      {children}
    </span>
  );
}
