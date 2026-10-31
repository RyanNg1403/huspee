/** Keywords this browser searched for, newest first. */
export const HISTORY_LIMIT = 8;

/** Newest first, without case-insensitive duplicates. */
export function addToHistory(list: readonly string[], keyword: string): string[] {
  const q = keyword.trim();
  if (!q) return [...list];
  return [q, ...list.filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, HISTORY_LIMIT);
}

export function parseHistory(raw: string | null): string[] {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}
