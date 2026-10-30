import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpeechLanguage } from './speech-check';

export type SpeechAudio = { mime: string; data: string };

/**
 * Turns checked assistant text into audio on the API host. The page plays it like any other page
 * audio, so the browser's echo cancellation removes it from the microphone. Returns null when no
 * local engine is configured; the browser then uses its own speech synthesis.
 */
export async function synthesizeSpeech(text: string, lang: SpeechLanguage): Promise<SpeechAudio | null> {
  const engine = process.env.ASSISTANT_TTS || (process.platform === 'darwin' ? 'say' : 'browser');
  if (engine !== 'say') return null;
  const voice = lang === 'en' ? process.env.ASSISTANT_TTS_VOICE_EN || 'Samantha' : process.env.ASSISTANT_TTS_VOICE_VI || 'Linh';
  const dir = await mkdtemp(join(tmpdir(), 'assistant-tts-'));
  try {
    await writeFile(join(dir, 'in.txt'), text, 'utf8');
    await new Promise<void>((resolve, reject) =>
      execFile(
        'say',
        ['-v', voice, '-f', join(dir, 'in.txt'), '--file-format=m4af', '--data-format=aac', '-o', join(dir, 'out.m4a')],
        { timeout: 15000 },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    return { mime: 'audio/mp4', data: (await readFile(join(dir, 'out.m4a'))).toString('base64') };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
