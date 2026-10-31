import { proxyApi } from '../../../lib/api-proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export {
  proxyApi as GET,
  proxyApi as POST,
  proxyApi as PUT,
  proxyApi as PATCH,
  proxyApi as DELETE,
  proxyApi as HEAD,
  proxyApi as OPTIONS,
};
