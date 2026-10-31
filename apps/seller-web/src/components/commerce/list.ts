/** Pure helpers shared by the client-filtered commerce lists. */

/** Lower-case and strip Vietnamese diacritics so "nguyen" finds "Nguyễn". */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function matchesSearch(query: string, fields: Array<string | null | undefined>): boolean {
  const q = normalizeSearch(query);
  return !q || fields.some((f) => f && normalizeSearch(f).includes(q));
}

export function pageSlice<T>(list: T[], page: number, size: number): T[] {
  return list.slice(page * size, (page + 1) * size);
}

export function countBy<T, K extends string>(
  list: T[],
  keys: readonly K[],
  tabsOf: (row: T) => K[],
): Record<K, number> {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const row of list) for (const k of tabsOf(row)) counts[k] += 1;
  return counts;
}
