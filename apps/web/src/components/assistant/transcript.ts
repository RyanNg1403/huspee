export type TranscriptEntry = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  final: boolean;
  cutOff?: boolean;
  startMs?: number;
  endMs?: number;
  createdAt?: number;
};

type Turn = {
  id: string;
  role: 'user' | 'assistant';
  transcript: string;
  start_ms?: number;
  end_ms?: number;
};
export type ChannelEvent =
  | { type: 'turn.created' | 'turn.done'; turn: Turn }
  | { type: 'turn.delta'; turn_id: string; delta: string }
  | { type: string; [key: string]: unknown };

/** Correlate only protocol turn IDs; interruption is inferred from timing, not a protocol flag. */
export function applyChannelEvent(
  entries: TranscriptEntry[],
  event: ChannelEvent,
  now: number,
  detection?: { available: boolean; speechStart?: number },
): TranscriptEntry[] {
  if (event.type === 'turn.created' || event.type === 'turn.done') {
    const turn = event.turn as Turn | undefined;
    if (
      !turn ||
      typeof turn.id !== 'string' ||
      !['user', 'assistant'].includes(turn.role) ||
      typeof turn.transcript !== 'string'
    )
      return entries;
    const next = [...entries];
    const index = next.findIndex((entry) => entry.id === turn.id);
    if (event.type === 'turn.created') {
      if (index !== -1) return entries;
      if (turn.role === 'user' && !detection?.available) {
        for (let i = 0; i < next.length; i++) {
          const assistant = next[i]!;
          if (
            assistant.role === 'assistant' &&
            assistant.startMs !== undefined &&
            turn.start_ms !== undefined &&
            turn.start_ms >= assistant.startMs &&
            assistant.endMs !== undefined &&
            turn.start_ms < assistant.endMs
          )
            next[i] = { ...assistant, cutOff: true };
        }
      }
      return [
        ...next,
        {
          id: turn.id,
          role: turn.role,
          text: turn.transcript,
          final: false,
          startMs: turn.start_ms,
          endMs: turn.end_ms,
          createdAt: now,
        },
      ];
    }
    if (index === -1) return entries;
    const old = next[index]!;
    const recentUser =
      old.role === 'assistant' &&
      !detection?.available &&
      next.some(
        (entry) =>
          entry.role === 'user' &&
          entry.createdAt !== undefined &&
          now >= entry.createdAt &&
          now - entry.createdAt <= 1500 &&
          entry.createdAt >= (old.createdAt ?? 0),
      );
    next[index] = {
      ...old,
      text: turn.transcript,
      final: true,
      endMs: turn.end_ms,
      cutOff:
        old.cutOff ||
        recentUser ||
        (old.role === 'assistant' &&
          detection?.available &&
          detection.speechStart !== undefined &&
          detection.speechStart >= (old.createdAt ?? 0) &&
          now >= detection.speechStart &&
          now - detection.speechStart <= 1500),
    };
    return next;
  }
  if (event.type === 'turn.delta' && typeof event.turn_id === 'string' && typeof event.delta === 'string') {
    return entries.map((entry) =>
      entry.id === event.turn_id && !entry.final ? { ...entry, text: entry.text + event.delta } : entry,
    );
  }
  return entries;
}

/** Flat SSE transcript events have no reliable voice turn identity. */
export function appendFinalTranscript(
  entries: TranscriptEntry[],
  event: { role: 'user' | 'assistant'; text: string; final: boolean },
  id: number,
): TranscriptEntry[] {
  return event.final
    ? [...entries, { id: `sse-${id}`, role: event.role, text: event.text, final: true }]
    : entries;
}

/** Each WebRTC call may reuse turn IDs; preserve earlier calls in the shared chat timeline. */
export function scopeCallEvent(event: ChannelEvent, callId: string): ChannelEvent {
  if ((event.type === 'turn.created' || event.type === 'turn.done') && event.turn && typeof event.turn === 'object') {
    const turn = event.turn as Turn;
    if (typeof turn.id !== 'string') return event;
    return { ...event, turn: { ...turn, id: `call-${callId}-${turn.id}` } };
  }
  if (event.type === 'turn.delta' && typeof event.turn_id === 'string') return { ...event, turn_id: `call-${callId}-${event.turn_id}` };
  return event;
}
