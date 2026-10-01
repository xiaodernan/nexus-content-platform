import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile the shared TS packages from source (ADR 0002 workspace consumption).
  // `@nexus/three-runtime` joined in M5 v142, when the Studio became its first product consumer.
  transpilePackages: ['@nexus/design-model', '@nexus/ai-providers', '@nexus/agent-runtime', '@nexus/three-runtime',
    // `@nexus/world-engine` joined in M4 v148, when the Studio became its first product consumer.
    '@nexus/world-engine'],
};

export default nextConfig;
