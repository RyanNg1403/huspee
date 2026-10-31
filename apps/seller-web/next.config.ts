import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Build with /seller when this app shares the buyer's public origin.
  basePath: process.env.SELLER_BASE_PATH || '',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  transpilePackages: ['@huspee/web-ui'],
  env: {
    NEXT_PUBLIC_HUSPEE_SURFACE: 'seller',
    NEXT_PUBLIC_HUSPEE_BASE_PATH: process.env.SELLER_BASE_PATH || '',
  },
  // Lets several dev servers run side by side from one checkout without sharing build output.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Errors still surface in dev; only the route badge is hidden.
  devIndicators: false,
};

export default nextConfig;
