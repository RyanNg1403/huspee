'use client';
import { useT } from '@huspee/web-ui/i18n/client';
import { common } from '@huspee/web-ui/i18n/common';

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const t = useT(common);
  const button =
    'flex h-9 w-9 items-center justify-center text-lg text-gray-600 hover:bg-gray-50 disabled:opacity-30';
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border border-line bg-white">
      <button
        aria-label={t('decrease')}
        className={button}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="min-w-10 border-x border-line px-3 text-center text-sm font-medium tabular-nums">
        {value}
      </span>
      <button
        aria-label={t('increase')}
        className={button}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
