'use client';
import { type RefObject, useEffect } from 'react';
import { pinnedBounds } from './panel-layout';

/** Keeps --assistant-pin-top/bottom in step with the page column while the pinned panel is shown. */
export function usePinnedBounds(column: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = column.current;
    if (!active || !element) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const header = document.querySelector('header');
      const sticky = header && ['sticky', 'fixed'].includes(getComputedStyle(header).position);
      const { top, bottom } = pinnedBounds({
        columnTop: rect.top,
        columnBottom: rect.bottom,
        viewportHeight: window.innerHeight,
        stickyHeaderBottom: sticky ? header.getBoundingClientRect().bottom : undefined,
      });
      root.style.setProperty('--assistant-pin-top', `${top}px`);
      root.style.setProperty('--assistant-pin-bottom', `${bottom}px`);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      root.style.removeProperty('--assistant-pin-top');
      root.style.removeProperty('--assistant-pin-bottom');
    };
  }, [column, active]);
}
