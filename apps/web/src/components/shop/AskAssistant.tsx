'use client';
import type { ReactNode } from 'react';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';

/** Cancelable window event that opens the page's shop assistant; the dock calls preventDefault() when it opens. */
export const OPEN_ASSISTANT_EVENT = 'huspee:assistant-open';

export function openAssistant() {
  if (!window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT, { cancelable: true }))) return;
  // Until the dock handles the event, press its launcher.
  document.querySelector<HTMLButtonElement>('.assistant-dock > button[aria-expanded="false"]')?.click();
}

/** The assistant is on for every shop unless its seller turned it off. */
export function useAssistantEnabled(shopId: number) {
  const profile = useApi(() => getApiClient().assistant.profile(shopId), [shopId]);
  return profile.data?.enabled === true;
}

export function MicIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

/** Entry point only: the panel itself belongs to the assistant dock. */
export function AskAssistantButton({ className, children }: { className: string; children: ReactNode }) {
  return (
    <button type="button" onClick={openAssistant} className={className}>
      {children}
    </button>
  );
}
