# Huspee web

Build the SDK first: `pnpm --filter @huspee/sdk build`. Copy `.env.example` to `.env.local`, then run `pnpm --filter @huspee/web dev` on port 3001. By default, browser requests use the web origin and `/api/*`, `/media/*` and `/healthz` are proxied to the server-only `API_INTERNAL_URL`. Enable `BROWSER_PROXY_ENABLED=true` on the API. Only port 3001 needs forwarding, including cookies and assistant events. Use an HTTPS forwarding URL for phone microphone access.
