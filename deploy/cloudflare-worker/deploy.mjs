import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const directory = fileURLToPath(new URL('./', import.meta.url));
const stateDirectory = new URL('.token/cloudflare-worker/', root);
const stateFile = new URL('deployment.json', stateDirectory);
const metrics = process.env.HUSPEE_TUNNEL_METRICS || 'http://127.0.0.1:20249/quicktunnel';
const result = await fetch(metrics, { signal: AbortSignal.timeout(5000) });
if (!result.ok) throw new Error(`Tunnel metrics returned ${result.status}`);
const { hostname } = await result.json();
if (typeof hostname !== 'string' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(hostname)) {
  throw new Error('Tunnel metrics did not return a valid Quick Tunnel hostname');
}
const origin = `https://${hostname}`;
const hash = createHash('sha256').update(origin);
for (const name of ['index.mjs', 'wrangler.jsonc']) hash.update(await readFile(new URL(name, import.meta.url)));
const fingerprint = hash.digest('hex');
let previous;
try { previous = JSON.parse(await readFile(stateFile, 'utf8')); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (process.argv.includes('--if-changed') && previous?.fingerprint === fingerprint) {
  console.log('Huspee Worker already points at the current tunnel.');
  process.exit(0);
}
const args = ['--yes', 'wrangler@4.156.0', 'deploy', '--config', 'wrangler.jsonc', '--var', `TUNNEL_ORIGIN:${origin}`];
const dryRun = process.argv.includes('--dry-run');
if (dryRun) args.push('--dry-run', '--outdir', fileURLToPath(new URL('build/', stateDirectory)));
console.log(`Deploying Huspee Worker → ${origin}`);
const deployment = spawnSync('npx', args, { cwd: directory, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
if (deployment.error) throw deployment.error;
if (deployment.status !== 0) process.exit(deployment.status || 1);
if (!dryRun) {
  await mkdir(stateDirectory, { recursive: true });
  await writeFile(stateFile, JSON.stringify({ origin, fingerprint, deployedAt: new Date().toISOString() }, null, 2) + '\n');
}
