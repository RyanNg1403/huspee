'use client';
import { useSyncExternalStore } from 'react';

/** Phones and small tablets get the bottom sheet; wider screens pin the panel beside the page. */
export const SHEET_QUERY = '(max-width: 1023px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
