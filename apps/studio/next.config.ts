import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile the shared TS packages from source (ADR 0002 workspace consumption).
  transpilePackages: ['@nexus/design-model', '@nexus/ai-providers'],
};

export default nextConfig;
