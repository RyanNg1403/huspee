'use client';

import { useLang } from '@huspee/web-ui/i18n/client';
import { digitsOnly, groupDigits } from './format';
import { input } from './ui';

/** "₫" adornment with grouped digits; the value stays a plain digit string. */
export function MoneyInput({
  id,
  value,
  onChange,
  label,
  invalid,
  disabled,
  className = '',
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { lang } = useLang();
  return (
    <div className={`relative ${className}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-0 flex h-9 w-8 -translate-y-1/2 items-center justify-center border-r border-line text-[13px] text-muted"
      >
        ₫
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={invalid}
        disabled={disabled}
        className={`${input} pl-11`}
        value={groupDigits(value, lang)}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
      />
    </div>
  );
}
