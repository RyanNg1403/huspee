'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { addToHistory, parseHistory } from './search-history';

/** Stored only in this browser. */
const KEY = 'huspee_search_history';
const EVENT = 'huspee:search-history';

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(list: string[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode or blocked storage: history is a convenience only.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useSearchHistory() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const items = useMemo(() => parseHistory(raw), [raw]);
  return {
    items,
    add: (keyword: string) => write(addToHistory(parseHistory(read()), keyword)),
    clear: () => write([]),
  };
}
