import type { ReactNode } from 'react';

const tones = {
  attention: 'bg-primary',
  success: 'bg-success-dot',
  neutral: 'bg-gray-400',
};

/** A status is a small dot and plain text, never a coloured pill. */
export function StatusDot({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tones[tone]}`} />
      {children}
    </span>
  );
}
