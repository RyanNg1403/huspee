export function OfficialBadge({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-sm bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-white ${className}`}
    >
      {label}
    </span>
  );
}
