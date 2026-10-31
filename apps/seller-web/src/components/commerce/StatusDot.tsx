export type StatusTone = 'action' | 'progress' | 'success' | 'muted' | 'warning';

const DOT: Record<StatusTone, string> = {
  action: 'bg-primary',
  progress: 'bg-gray-400',
  success: 'bg-success-dot',
  muted: 'bg-gray-300',
  warning: 'bg-warning',
};

/** Status as a small dot plus plain text (no coloured pills). */
export function StatusDot({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}
