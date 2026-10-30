import { describe, expect, it } from 'vitest';
import { InterruptionDetector } from '../../apps/web/src/components/assistant/interruption.js';
import { applyChannelEvent, type TranscriptEntry } from '../../apps/web/src/components/assistant/transcript.js';

function run(mic: number, remote: number, duration: number): number | undefined {
  const detector = new InterruptionDetector();
  for (let t = 0; t <= 1000; t += 50) detector.sample(t, 0.002, 0, false);
  let result: number | undefined;
  for (let t = 1050; t <= 1050 + duration; t += 50)
    result ??= detector.sample(t, mic, remote, true);
  return result;
}

describe('mic interruption inference', () => {
  it('ignores silence, short coughs and echo', () => {
    expect(run(0.002, 0, 500)).toBeUndefined();
    expect(run(0.1, 0, 250)).toBeUndefined();
    expect(run(0.04, 0.08, 500)).toBeUndefined();
  });
  it('reports sustained speech and applies it only to a nearby assistant completion', () => {
    const speechStart = run(0.1, 0.04, 400);
    expect(speechStart).toBe(1050);
    const initial: TranscriptEntry[] = [{ id: 'a', role: 'assistant', text: '', final: false, createdAt: 1000 }];
    const done = { type: 'turn.done', turn: { id: 'a', role: 'assistant' as const, transcript: 'answer' } };
    expect(applyChannelEvent(initial, done, 1450, { available: true, speechStart })[0]?.cutOff).toBe(true);
    expect(applyChannelEvent(initial, done, 3000, { available: true, speechStart })[0]?.cutOff).toBe(false);
    expect(applyChannelEvent(initial, done, 1450, { available: true })[0]?.cutOff).toBe(false);
  });
});
