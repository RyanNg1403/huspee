# Stable public Huspee URL

The Worker `huspee` forwards requests to a Quick Tunnel on buyer port 3001. API, media,
buyer and `/seller` use the same HTTPS origin, with independent buyer/seller session cookies.
On the configured account, the public address is https://huspee.tcuong1000.workers.dev.
Workers use `<worker>.<account>.workers.dev`; a bare `huspee.workers.dev` is not a Worker route.

The app and database still run on this machine. They must be running for the public URL to work.
This setup does not move the app or database to Cloudflare or change their startup configuration.

## Set up

1. Authenticate once with `npx --yes wrangler@4.156.0 login --device`.
2. Set `WEB_APP_URL` to the Worker URL in the API and both frontends. Set `SELLER_APP_URL`
   to that URL plus `/seller`. Keep the existing internal API and seller addresses.
3. Set `NEXT_PUBLIC_ASSISTANT_EVENT_TRANSPORT=poll` before building the buyer app.
   Quick Tunnels buffer SSE, including behind a Worker, so assistant events must use JSON polling.
4. From the repository root, run `node deploy/cloudflare-worker/install-services.mjs` on a
   Linux host with systemd user services and `cloudflared` on PATH. It starts a dedicated
   tunnel with metrics on `127.0.0.1:20250` and checks its hostname every minute.
   A changed hostname or changed Worker source triggers deployment. The synchronization uses
   the operator's Wrangler login; no Cloudflare credential is stored in this repository.
5. Keep the buyer app on port 3001 and the single-origin `/seller` routing configured as
   described in the main README. Restart the app processes after changing their runtime URLs.

The dedicated tunnel restarts automatically. The account must retain its Wrangler authorization
for synchronization to deploy updates. The first deployment can take about a minute. The installer
does not change the account's existing `workers.dev` subdomain.

## Manual deployment and checks

```bash
node --test deploy/cloudflare-worker/index.test.mjs
HUSPEE_TUNNEL_METRICS=http://127.0.0.1:20250/quicktunnel node deploy/cloudflare-worker/deploy.mjs --dry-run
HUSPEE_TUNNEL_METRICS=http://127.0.0.1:20250/quicktunnel node deploy/cloudflare-worker/deploy.mjs
systemctl --user status huspee-public-tunnel.service huspee-worker-sync.timer
journalctl --user -u huspee-worker-sync.service -n 30
```

Without the services, the deploy helper defaults to the existing tunnel metrics on port 20249.
Deployment state is stored under ignored `.token/cloudflare-worker/`. The proxy preserves request
methods, bodies, cookies, CSRF headers and Origin; it rewrites only redirects to its own upstream.
It never lets an incoming URL choose a different upstream and disables API caching.

To stop the public tunnel and synchronization:

```bash
systemctl --user disable --now huspee-worker-sync.timer huspee-public-tunnel.service
```
