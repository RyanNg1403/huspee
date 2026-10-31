'use client';
import { useT } from '@huspee/web-ui/i18n';
import { openAssistant } from '../shop/AskAssistant';
import { messages } from './messages';

const icon = 'h-5 w-5';
const side =
  'flex shrink-0 flex-col items-center justify-center gap-0.5 text-[11px] leading-tight text-ink disabled:text-gray-400';

/** Fixed purchase bar on phones; it replaces the inline buttons shown on wider screens. */
export function MobileBuyBar({
  assistant,
  disabled,
  onPurchase,
}: {
  assistant: boolean;
  disabled: boolean;
  onPurchase: (buyNow: boolean) => void;
}) {
  const t = useT(messages);
  return (
    <div
      data-buy-bar=""
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {assistant && (
        <button type="button" onClick={openAssistant} className={`${side} w-[78px] border-r border-line`}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            className={icon}
          >
            <path d="M4 5h16v11H9l-5 4V5Z" />
          </svg>
          {t('askShop')}
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPurchase(false)}
        className={`${side} w-[92px]`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={icon}
        >
          <path d="M3 4h2l2.2 11h10.6L20 7H8" />
          <path d="M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM13 8v4M11 10h4" />
        </svg>
        {t('addShort')}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPurchase(true)}
        className="flex-1 bg-primary text-base font-semibold text-white disabled:bg-gray-300"
      >
        {t('buyNow')}
      </button>
    </div>
  );
}
