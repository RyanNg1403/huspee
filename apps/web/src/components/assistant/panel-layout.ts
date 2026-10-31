const KEY = 'huspee:assistant-panel';

/** Desktop keeps the pinned panel open unless the buyer collapsed it earlier in this browser session. */
export function readPinnedPreference(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(KEY) !== 'collapsed';
  } catch {
    return true;
  }
}

export function writePinnedPreference(storage: Pick<Storage, 'setItem'> | undefined, open: boolean): void {
  try {
    storage?.setItem(KEY, open ? 'open' : 'collapsed');
  } catch {
    // Private browsing or blocked storage: the panel still works, it just is not remembered.
  }
}

/**
 * The pinned panel spans the visible part of the page column: below a sticky header, and not past
 * the end of the column when a footer follows it.
 */
export function pinnedBounds(input: {
  columnTop: number;
  columnBottom: number;
  viewportHeight: number;
  stickyHeaderBottom?: number;
}): { top: number; bottom: number } {
  const top = Math.max(0, input.columnTop, input.stickyHeaderBottom ?? 0);
  const bottom = Math.max(0, input.viewportHeight - input.columnBottom);
  return { top, bottom };
}
