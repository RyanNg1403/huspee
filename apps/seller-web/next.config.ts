import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  transpilePackages: ['@huspee/web-ui'],
  // Lets several dev servers run side by side from one checkout without sharing build output.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Errors still surface in dev; only the route badge is hidden.
  devIndicators: false,
  redirects: async () => [{ source: '/seller/:path*', destination: '/:path*', permanent: false }],
};

export default nextConfig;
