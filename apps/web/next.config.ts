import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lets several dev servers run side by side from one checkout without sharing build output.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
