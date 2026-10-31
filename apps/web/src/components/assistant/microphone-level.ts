/** Display level only, not calibrated decibels or a speech-recognition confidence score. */
export function microphoneLevel(samples: Float32Array): { rms: number; level: number } {
  if (!samples.length) return { rms: 0, level: 0 };
  let sum = 0;
  for (const sample of samples) sum += Number.isFinite(sample) ? sample * sample : 0;
  const rms = Math.sqrt(sum / samples.length);
  // A logarithmic display makes normal, quiet microphone input visible without inventing motion.
  const level = rms > 0 ? Math.round(Math.max(0, Math.min(100, (20 * Math.log10(rms) + 60) / 60 * 100))) : 0;
  return { rms, level };
}
