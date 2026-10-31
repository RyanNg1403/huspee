import { formatVnd } from '@huspee/web-ui/lib/format';

/** API price in the grid style `₫18.490.000`: the shared formatter's digits with a small leading sign. */
export function PriceTag({ value, className = '' }: { value: number; className?: string }) {
  const digits = formatVnd(value).replace(/\s*₫\s*/u, '');
  return (
    <span className={`text-primary tabular-nums ${className}`}>
      <span className="mr-px text-[0.8em]">₫</span>
      {digits}
    </span>
  );
}
