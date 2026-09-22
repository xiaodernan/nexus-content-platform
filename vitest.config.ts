import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const from = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: 'dot',
    // 打真库的用例共用一个 Postgres：整套并行跑时，一条分支/方案往返要排在别人的
    // 连接后面，默认 5s 会把它掐成 timeout（不是逻辑慢，是排队）。给到 30s，
    // 真死循环仍然会暴露。
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@nexus/design-model': from('./packages/design-model/src/index.ts'),
      '@nexus/schemas': from('./packages/schemas/src/index.ts'),
      '@nexus/world-model': from('./packages/world-model/src/index.ts'),
      '@': from('./apps/web/src'),
      '@web': from('./apps/web/src'),
    },
  },
});
