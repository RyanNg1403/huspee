import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { codexLoginSource } from './codex-home';

let found: { bin: string; installed: boolean } | undefined;

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The Codex CLI the runtime would start exists (an explicit path, or a name found on PATH). */
export function codexInstalled(): boolean {
  const bin = process.env.ASSISTANT_CODEX_BIN || 'codex';
  if (found?.bin !== bin) {
    const candidates = bin.includes('/')
      ? [bin]
      : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, bin));
    found = { bin, installed: candidates.some(executable) };
  }
  return found.installed;
}

/**
 * The assistant is on by default; ASSISTANT_VOICE_ENABLED=false turns it off. It also stays off
 * without the Codex CLI or a Codex login (connected at /setup/codex, or `codex login` on this
 * machine), so the app never offers a session it cannot start.
 */
export function voiceEnabled(): boolean {
  return process.env.ASSISTANT_VOICE_ENABLED !== 'false' && codexInstalled() && codexLoginSource() !== null;
}
