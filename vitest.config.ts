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
    // 并行还会串台，不只是慢：discover 的列表硬夹 60 条，而库里公开版本已经积到 100+，
    // 于是"我这张卡在不在列表里"取决于别的文件此刻在发布还是在清理——2026-09-26 那次
    // `npm test` 的 social / trending 三条就是这么红的（串行跑 12/12 绿）。
    // 串行整套 352s（88 个文件 / 954 条），比"绿得随机"便宜。要恢复并行，得先把这些用例改成不吃列表宽度。
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@nexus/design-model': from('./packages/design-model/src/index.ts'),
      '@nexus/schemas': from('./packages/schemas/src/index.ts'),
      '@nexus/world-model': from('./packages/world-model/src/index.ts'),
      '@nexus/game-model': from('./packages/game-model/src/index.ts'),
      '@': from('./apps/web/src'),
      '@web': from('./apps/web/src'),
    },
  },
});
