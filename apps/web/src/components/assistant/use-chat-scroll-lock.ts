'use client';
import { useEffect } from 'react';

/** A phone chat is a screen: preserve the underlying page while only its transcript scrolls. */
export function useChatScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-height: 500px)');
    let unlock: (() => void) | undefined;
    const sync = () => {
      if (!media.matches) { unlock?.(); unlock = undefined; return; }
      if (unlock) return;
      const body = document.body, root = document.documentElement;
      const x = window.scrollX, y = window.scrollY, path = window.location.pathname;
      const saved = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow };
      const rootOverflow = root.style.overflow, rootOverscroll = root.style.overscrollBehavior;
      body.classList.add('assistant-mobile-open');
      Object.assign(body.style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden' });
      root.style.overflow = 'hidden';
      root.style.overscrollBehavior = 'none';
      unlock = () => {
        body.classList.remove('assistant-mobile-open');
        Object.assign(body.style, saved);
        root.style.overflow = rootOverflow;
        root.style.overscrollBehavior = rootOverscroll;
        window.scrollTo(window.location.pathname === path ? x : 0, window.location.pathname === path ? y : 0);
      };
    };
    sync();
    media.addEventListener('change', sync);
    return () => { media.removeEventListener('change', sync); unlock?.(); };
  }, [open]);
}
