import { existsSync, lstatSync } from 'node:fs';
import { chmod, lstat, mkdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/** The runtime's private CODEX_HOME. The login files in it are never opened by this app. */
export function codexHome(): string {
  return resolve(process.env.ASSISTANT_CODEX_HOME || './.token/assistant-codex');
}

const hostLogin = () => resolve(homedir(), '.codex/auth.json');
const homeLogin = () => resolve(codexHome(), 'auth.json');

/** Where the login comes from: made in the web app, linked from `codex login` on this machine, or none. */
export function codexLoginSource(): 'app' | 'host' | null {
  if (existsSync(homeLogin())) {
    try {
      return lstatSync(homeLogin()).isSymbolicLink() ? 'host' : 'app';
    } catch {
      return null;
    }
  }
  return existsSync(hostLogin()) ? 'host' : null;
}

/**
 * Creates the private home before an app-server starts. A host `codex login` is linked in when the
 * home has none, and logins made here are stored as a file, not in the system keychain.
 */
export async function prepareCodexHome(): Promise<string> {
  const home = codexHome();
  await mkdir(home, { recursive: true, mode: 0o700 });
  // A Docker volume's folder already exists with open permissions; the login stays owner-only.
  await chmod(home, 0o700);
  const login = homeLogin();
  // A link whose target is gone would make a new login write through it, so drop it.
  if ((await lstat(login).catch(() => undefined))?.isSymbolicLink() && !existsSync(login)) await unlink(login);
  if (!existsSync(login) && existsSync(hostLogin())) {
    await symlink(hostLogin(), login).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
  }
  await writeFile(resolve(home, 'config.toml'), 'cli_auth_credentials_store = "file"\n', { flag: 'wx', mode: 0o600 }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    },
  );
  return home;
}
