import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nexus/design-model', '@nexus/schemas', '@nexus/world-model'],
  // §69 Code Index 用真实 TypeScript AST。打进 server bundle 会触发动态 require 警告，
  // 而且编译器有几百个内部模块——让 Node 自己在运行时从 node_modules 加载它。
  serverExternalPackages: ['typescript'],
};

export default nextConfig;
