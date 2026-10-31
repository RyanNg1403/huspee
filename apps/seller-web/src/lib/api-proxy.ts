import { createApiProxy } from '@huspee/web-ui/server/api-proxy';

export const proxyApi = createApiProxy(
  () => process.env.SELLER_APP_URL || 'http://localhost:3002',
  process.env.NEXT_PUBLIC_HUSPEE_BASE_PATH || '',
);
