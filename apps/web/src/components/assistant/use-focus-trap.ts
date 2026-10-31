'use client';
import { type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside a modal sheet, closes it on Escape and returns focus afterwards: to
 * `returnTo` when given (the control that opened it may be hidden while the sheet is open).
 */
export function useFocusTrap(
  container: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape: () => void,
  returnTo?: RefObject<HTMLElement | null>,
) {
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });
  useEffect(() => {
    const root = container.current;
    if (!active || !root) return;
    const previous = returnTo?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const focusables = () =>
      [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0);
    if (!root.contains(document.activeElement)) root.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        escape.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const inside = root.contains(document.activeElement);
      if (event.shiftKey && (!inside || document.activeElement === first || document.activeElement === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [container, active, returnTo]);
}
