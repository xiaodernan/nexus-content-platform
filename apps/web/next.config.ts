import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nexus/design-model', '@nexus/schemas'],
};

export default nextConfig;
