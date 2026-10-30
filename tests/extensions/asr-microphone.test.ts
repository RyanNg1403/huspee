import { expect, it } from 'vitest';
import { setMicrophoneEnabled } from '../../apps/web/src/components/assistant/microphone.js';

it('mutes and unmutes existing tracks without stopping them', () => {
  const tracks = [{ enabled: true }, { enabled: true }];
  const stream = { getAudioTracks: () => tracks as MediaStreamTrack[] };
  setMicrophoneEnabled(stream, false);
  expect(tracks.map((track) => track.enabled)).toEqual([false, false]);
  setMicrophoneEnabled(stream, true);
  expect(tracks.map((track) => track.enabled)).toEqual([true, true]);
});
