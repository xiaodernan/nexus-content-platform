import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nexus/creative-model', '@nexus/schemas', '@nexus/world-model'],
  // Next 16 默认只放行 localhost 访问 dev 资源 / HMR：从 127.0.0.1（或内网 IP）打开
  // dev server 时 /_next/hmr 会被拦下，React 水合静默失败——页面能看但点任何按钮都没反应。
  // 这是 dev 限定字段，对生产无任何影响。
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.1.5'],
  // §69 Code Index 用真实 TypeScript AST。打进 server bundle 会触发动态 require 警告，
  // 而且编译器有几百个内部模块——让 Node 自己在运行时从 node_modules 加载它。
  serverExternalPackages: ['typescript'],
  // §147 的诊断分段（studio/store.ts 的 __studioPerf）默认只在开发模式打。
  // 设了 NEXUS_PERF_SEGMENTS=1 的生产构建也打——构建期内联成常量，
  // 探针脚本（perf-browser.mts 的 phases 一格）才读得到生产构建的分段。
  // 不设就是零成本（一个 false 分支），别让诊断常驻生产。
  env: {
    NEXT_PUBLIC_NEXUS_PERF_SEGMENTS:
      process.env.NEXUS_PERF_SEGMENTS === '1' ? '1' : '0',
  },
};

export default nextConfig;
