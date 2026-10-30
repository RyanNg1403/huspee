import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Lets several dev servers run side by side from one checkout without sharing build output.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Errors still surface in dev; only the route badge is hidden.
  devIndicators: false,
};

export default nextConfig;
