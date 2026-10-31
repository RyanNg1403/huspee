import { createApiProxy } from '@huspee/web-ui/server/api-proxy';

export const proxyApi = createApiProxy(() => process.env.WEB_APP_URL || 'http://localhost:3001');
