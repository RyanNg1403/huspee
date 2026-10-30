# Huspee web

Build the SDK first: `pnpm --filter @huspee/sdk build`. Set `NEXT_PUBLIC_API_URL` as in `.env.example`, then run `pnpm --filter @huspee/web dev` on port 3001. The API must allow credentialed requests from this origin.
