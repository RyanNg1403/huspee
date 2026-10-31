'use client';
import { Fragment } from 'react';
import { useT } from '@huspee/web-ui/i18n/client';
import { ShellIcon } from './icons';
import { shellMessages } from './messages';

const STEPS = ['stepAccount', 'stepShop', 'stepConnect'] as const;

/** Seller onboarding progress: account, shop details, Partner connection. */
export function Steps({ current }: { current: 0 | 1 | 2 }) {
  const t = useT(shellMessages);
  return (
    <ol aria-label={t('steps')} className="mx-auto mb-6 flex max-w-[640px] items-center gap-3">
      {STEPS.map((key, i) => (
        <Fragment key={key}>
          {i > 0 && (
            <li
              aria-hidden="true"
              className={`h-px min-w-6 flex-1 ${i <= current ? 'bg-primary' : 'bg-line-strong'}`}
            />
          )}
          <li
            aria-current={i === current ? 'step' : undefined}
            className={`flex shrink-0 items-center gap-2 ${
              i === current ? 'font-semibold text-ink' : i < current ? 'text-ink' : 'text-subtle'
            }`}
          >
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[13px] ${
                i <= current ? 'bg-primary font-semibold text-white' : 'border border-[#d9d9d9]'
              }`}
            >
              {i < current ? <ShellIcon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} /> : i + 1}
            </span>
            {t(key)}
            {i < current && <span className="sr-only">({t('stepDone')})</span>}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
