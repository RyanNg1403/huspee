'use client';
import { useT } from '@/i18n/client';
import { common } from '@/i18n/common';

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
  return (
    <div className="inline-flex items-center border border-gray-300">
      <button
        aria-label={t('decrease')}
        className="px-3"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="border-x px-4 py-1">{value}</span>
      <button
        aria-label={t('increase')}
        className="px-3"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
