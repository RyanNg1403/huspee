/** Formats a channel's `estimated_days` as the API sends it: "2-4" → "2–4", "1-1" → "1". */
export function dayRange(days: string) {
  const [from, to] = days.split('-').map((part) => part.trim());
  return !to || from === to ? from : `${from}–${to}`;
}
