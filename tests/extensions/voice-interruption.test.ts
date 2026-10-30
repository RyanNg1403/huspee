import { describe, expect, it } from 'vitest';
import { BargeInGate, InterruptionDetector } from '../../apps/web/src/components/assistant/interruption.js';
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
  it('turns the assistant down within ~120 ms of buyer speech, before sustained speech is confirmed', () => {
    const detector = new InterruptionDetector();
    for (let t = 0; t <= 1000; t += 50) detector.sample(t, 0.002, 0, false);
    detector.sample(1050, 0.1, 0.04, true);
    expect(detector.ducking).toBe(false);
    detector.sample(1200, 0.1, 0.04, true);
    expect(detector.ducking).toBe(true);
    detector.sample(1250, 0.002, 0.04, true);
    expect(detector.ducking).toBe(false);
  });
});

describe('barge-in gate', () => {
  it('ducks, then mutes on detected speech and stays muted until the assistant starts a new turn', () => {
    const gate = new BargeInGate();
    expect(gate.sample(0, false, false, false)).toBe(1);
    expect(gate.sample(50, true, false, false)).toBe(0.2);
    expect(gate.sample(100, true, true, false)).toBe(0);
    gate.buyerTurn();
    expect(gate.sample(5000, false, false, false)).toBe(0);
    gate.assistantTurn();
    expect(gate.sample(5050, false, false, false)).toBe(1);
  });
  it('lets the next answer play once the cut-off speech has stopped, but not across a short pause', () => {
    const gate = new BargeInGate();
    expect(gate.sample(0, true, true, false)).toBe(0);
    gate.buyerTurn();
    expect(gate.sample(300, false, false, true)).toBe(0);
    expect(gate.sample(600, false, false, false)).toBe(0);
    expect(gate.sample(700, false, false, true)).toBe(0);
    expect(gate.sample(1300, false, false, true)).toBe(1);
  });
  it('restores the sound after a false alarm with no buyer turn', () => {
    const gate = new BargeInGate();
    expect(gate.sample(0, true, true, false)).toBe(0);
    expect(gate.sample(1900, false, false, false)).toBe(0);
    expect(gate.sample(2100, false, false, false)).toBe(1);
  });
});
