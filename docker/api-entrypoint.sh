#!/bin/sh
# Apply migrations (non-destructive), optionally load the deterministic demo seed, then start.
set -e
npx prisma migrate deploy
if [ "${HUSPEE_SEED_ON_START:-false}" = "true" ]; then
  # The seed truncates all tables; only enable this for demo/dev databases.
  HUSPEE_ALLOW_SEED_RESET=true npx prisma db seed
fi
exec "$@"
