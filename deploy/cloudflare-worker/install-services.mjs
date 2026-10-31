import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// User services keep the tunnel alive and refresh the Worker only when its target changes.
const root = fileURLToPath(new URL('../../', import.meta.url));
const config = join(homedir(), '.config/systemd/user');
const executable = spawnSync('which', ['cloudflared'], { encoding: 'utf8' });
if (executable.status !== 0) throw new Error('Install cloudflared first');
const cloudflared = executable.stdout.trim();
const quote = (value) => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%') + '"';
await mkdir(config, { recursive: true });
const units = {
  'huspee-public-tunnel.service': `[Unit]
Description=Public Cloudflare Tunnel for Huspee
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${quote(cloudflared)} tunnel --config /dev/null --no-autoupdate --edge-ip-version 4 --protocol http2 --url http://127.0.0.1:3001 --metrics 127.0.0.1:20250
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`,
  'huspee-worker-sync.service': `[Unit]
Description=Update the Huspee Worker when its tunnel changes
After=huspee-public-tunnel.service
Wants=huspee-public-tunnel.service

[Service]
Type=oneshot
WorkingDirectory=${root.replaceAll('%', '%%')}
Environment=${quote('PATH=' + dirname(process.execPath) + ':/usr/local/bin:/usr/bin:/bin')}
Environment=HUSPEE_TUNNEL_METRICS=http://127.0.0.1:20250/quicktunnel
ExecStart=${quote(process.execPath)} ${quote(join(root, 'deploy/cloudflare-worker/deploy.mjs'))} --if-changed
TimeoutStartSec=120
`,
  'huspee-worker-sync.timer': `[Unit]
Description=Keep the stable Huspee URL connected to its current tunnel

[Timer]
OnActiveSec=15s
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
`,
};
for (const [name, contents] of Object.entries(units)) await writeFile(join(config, name), contents);
for (const args of [
  ['--user', 'daemon-reload'],
  ['--user', 'enable', 'huspee-public-tunnel.service', 'huspee-worker-sync.timer'],
  ['--user', 'restart', 'huspee-public-tunnel.service'],
  ['--user', 'start', 'huspee-worker-sync.timer'],
  ['--user', 'is-active', 'huspee-public-tunnel.service', 'huspee-worker-sync.timer'],
]) {
  const result = spawnSync('systemctl', args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Huspee public tunnel and Worker synchronization are enabled.');
