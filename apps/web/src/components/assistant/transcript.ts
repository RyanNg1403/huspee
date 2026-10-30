export type TranscriptEvent = { role: 'user' | 'assistant'; text: string; final: boolean; item_id?: string };
export type TranscriptEntry = TranscriptEvent & { id: number; cutOff?: boolean; receivedAt: number };

function lastIndex(entries: TranscriptEntry[], predicate: (entry: TranscriptEntry) => boolean): number {
  for (let i = entries.length - 1; i >= 0; i--) if (predicate(entries[i]!)) return i;
  return -1;
}

/** Realtime v3 may deliver the user's final transcript after assistant deltas. */
export function mergeTranscript(
  entries: TranscriptEntry[],
  event: TranscriptEvent,
  id: number,
): TranscriptEntry[] {
  const next = [...entries];
  let index = event.item_id
    ? next.findIndex((entry) => entry.item_id === event.item_id && entry.role === event.role)
    : lastIndex(next, (entry) => entry.role === event.role && !entry.final && !entry.cutOff);
  if (event.role === 'user' && !event.final && index === -1) {
    const assistant = lastIndex(next, (entry) => entry.role === 'assistant' && !entry.final && !entry.cutOff);
    if (assistant !== -1) next[assistant] = { ...next[assistant]!, final: true, cutOff: true };
  }
  if (index !== -1) {
    const old = next[index]!;
    if (old.cutOff) return next;
    next[index] = { ...old, text: event.final ? event.text : old.text + event.text, final: event.final };
    return next;
  }
  if (event.final && event.role === 'user' && !event.item_id) {
    index = lastIndex(next, (entry) => entry.role === 'user');
    if (
      index !== -1 &&
      next[index]!.text.trim() === event.text.trim() &&
      Date.now() - next[index]!.receivedAt < 5000
    )
      return next;
  }
  return [...next, { ...event, id, receivedAt: Date.now() }];
}
