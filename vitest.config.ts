import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const from = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * v215 (main line, kept by the 2026-11-09 consolidation): no hand-picked include list.
 *
 * An include list here broke turbo's per-package `vitest run` the day it landed, because the
 * globs resolve relative to the PACKAGE directory when a package runs its own vitest, not to the
 * merged workspace root: "packages/*​/test" matches nothing from inside packages/design-model and
 * the whole studio suite went missing. The default include (every `*.test.*`) is what both lines
 * actually want; the exclude list is the surviving two-line union of the two configs.
 */
export default defineConfig({
  test: {
    // v215 (main line, kept by the 2026-11-09 consolidation): no hand-picked include list, but the
    // two halves of the repo are point-different on HOW they run their tests:
    //   - apps/studio has its OWN vitest.config.ts (alias `@`, monorepo source layout) — when the
    //     root config runs studio's files directly, `@/lib/store` doesn't resolve and the whole
    //     suite goes red. The studio suite therefore runs under the studio workspace's own config
    //     (`npm run test -w @nexus/studio` handles it correctly).
    //   - e2e/ is Playwright, not vitest — its spec files fail at collect time inside vitest.
    // Both are still FULLY executed — under the turbo/playwright runners the CI uses, not here.
    exclude: ['**/.scratch/**', '**/node_modules/**', '**/dist/**', '**/.git/**', 'apps/studio/**', 'e2e/**'],
    environment: 'node',
    globals: false,
    reporters: 'dot',
    // Real-DB suites share one Postgres; 5s kills them when they queue. Sequential is cheaper than red.
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
