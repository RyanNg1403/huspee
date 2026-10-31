import { expect, it } from 'vitest';
import { setMicrophoneEnabled } from '../../apps/web/src/components/assistant/microphone.js';
import { microphoneLevel } from '../../apps/web/src/components/assistant/microphone-level.js';

it('mutes and unmutes existing tracks without stopping them', () => {
  const tracks = [{ enabled: true }, { enabled: true }];
  const stream = { getAudioTracks: () => tracks as MediaStreamTrack[] };
  setMicrophoneEnabled(stream, false);
  expect(tracks.map((track) => track.enabled)).toEqual([false, false]);
  setMicrophoneEnabled(stream, true);
  expect(tracks.map((track) => track.enabled)).toEqual([true, true]);
});

it('measures silence and input amplitude without inventing waveform motion', () => {
  const sine = (amplitude: number) => Float32Array.from({ length: 1024 }, (_, i) => amplitude * Math.sin(i * Math.PI / 16));
  expect(microphoneLevel(new Float32Array(1024))).toEqual({ rms: 0, level: 0 });
  expect(microphoneLevel(new Float32Array())).toEqual({ rms: 0, level: 0 });
  const quiet = microphoneLevel(sine(0.01));
  const loud = microphoneLevel(sine(0.2));
  expect(quiet.rms).toBeCloseTo(0.01 / Math.sqrt(2), 6);
  expect(loud.rms).toBeCloseTo(0.2 / Math.sqrt(2), 6);
  expect(quiet.level).toBeGreaterThan(0);
  expect(loud.level).toBeGreaterThan(quiet.level);
  expect(loud.level).toBeLessThanOrEqual(100);
  expect(microphoneLevel(Float32Array.from([2, -2])).level).toBe(100);
  expect(microphoneLevel(Float32Array.from([NaN, Infinity])).level).toBe(0);
});
