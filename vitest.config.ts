import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const from = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: 'dot',
  },
  resolve: {
    alias: {
      '@nexus/design-model': from('./packages/design-model/src/index.ts'),
      '@nexus/schemas': from('./packages/schemas/src/index.ts'),
      '@web': from('./apps/web/src'),
    },
  },
});
