import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const from = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    // v215 (master): the ROOT config excludes the proof-scratch tree and its stale copies.
    // main: the 35s room for real-DB suites and the parallelism ban lives here too.
    exclude: ['**/.scratch/**', '**/node_modules/**', '**/dist/**', '**/.git/**'],
    include: ['packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'apps/mcp-server/test/**/*.test.ts', 'scripts/test/**/*.test.mts'],
    environment: 'node',
    globals: false,
    reporters: 'dot',
    // The real-DB suites share one Postgres; 5s kills them when they queue. Sequential is cheaper than red.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['packages/game-model/src/**/*.ts'],
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@nexus/creative-model': from('./packages/creative-model/src/index.ts'),
      '@nexus/schemas': from('./packages/schemas/src/index.ts'),
      '@nexus/world-model': from('./packages/world-model/src/index.ts'),
      '@nexus/game-model': from('./packages/game-model/src/index.ts'),
      '@nexus/video-model': from('./packages/video-model/src/index.ts'),
      '@': from('./apps/web/src'),
      '@web': from('./apps/web/src'),
    },
  },
});
