// Copies the Silero VAD model, its audio worklet and the ONNX runtime into public/vad, so the
// browser loads them from this origin. Runs before `next dev` and `next build`; the output is ignored by Git.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const vad = dirname(require.resolve('@ricky0123/vad-web'));
const ort = dirname(createRequire(join(vad, 'index.js')).resolve('onnxruntime-web/wasm'));
const out = join(dirname(fileURLToPath(import.meta.url)), '../public/vad');
mkdirSync(out, { recursive: true });
for (const [from, file] of [
  [vad, 'silero_vad_v5.onnx'],
  [vad, 'vad.worklet.bundle.min.js'],
  [ort, 'ort-wasm-simd-threaded.wasm'],
  [ort, 'ort-wasm-simd-threaded.mjs'],
])
  copyFileSync(join(from, file), join(out, file));
