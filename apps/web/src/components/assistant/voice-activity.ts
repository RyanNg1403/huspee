/**
 * Silero VAD on the session's own microphone stream and audio context. It reports how likely the
 * latest 32 ms frame is speech, so noise (a door, a fan, a clap) does not count as the buyer talking.
 * The model and ONNX runtime are served from /vad (copied there by scripts/copy-vad-assets.mjs).
 */
export type VoiceActivity = {
  /** Speech probability of the latest frame, or undefined when no recent frame was processed. */
  probability(now: number): number | undefined;
  stop(): void;
};

export async function startVoiceActivity(stream: MediaStream, context: AudioContext): Promise<VoiceActivity> {
  const { MicVAD } = await import('@ricky0123/vad-web');
  let latest: { at: number; value: number } | undefined;
  const vad = await MicVAD.new({
    model: 'v5',
    audioContext: context,
    // Share the session's stream: never open a second microphone or stop the session's tracks.
    getStream: async () => stream,
    pauseStream: async () => undefined,
    resumeStream: async () => stream,
    baseAssetPath: '/vad/',
    onnxWASMBasePath: '/vad/',
    ortConfig: (ort) => {
      ort.env.logLevel = 'error';
      // Threads need cross-origin isolation, which the app does not enable.
      ort.env.wasm.numThreads = 1;
    },
    onFrameProcessed: (probabilities) => {
      latest = { at: Date.now(), value: probabilities.isSpeech };
    },
    startOnLoad: true,
  });
  return {
    probability: (now) => (latest && now - latest.at < 250 ? latest.value : undefined),
    stop: () => void vad.destroy().catch(() => undefined),
  };
}
