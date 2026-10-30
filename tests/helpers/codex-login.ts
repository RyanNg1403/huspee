import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

/** A HOME with a dummy `codex login` file, so voice counts as available without the real login. */
export async function fakeCodexLoginHome(): Promise<string> {
  const home = await mkdtemp(resolve(tmpdir(), 'huspee-codex-login-'));
  await mkdir(resolve(home, '.codex'));
  await writeFile(resolve(home, '.codex/auth.json'), '{}');
  return home;
}
