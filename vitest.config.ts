import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const from = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'apps/mcp-server/test/**/*.test.ts'],
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
    // §85 第十八片的覆盖率仪器。**只在显式调用时开**（`npm run coverage:models`）——
    // `--coverage` 由 CLI 给，默认 `npm test` 不付这份开销，也就不必为它放宽任何超时。
    // 范围锁在 `packages/game-model/src`：这一片要回答的是"清单没列到的分支有没有"，
    // 那需要**能点名到行**的读数；全仓百分比只会把三个模型链的分支稀释成一团没法读的噪声。
    // 这里**没有** exclude：第一版把 `index.ts` 当纯转出口排掉了，读一眼才发现它是 `createGame` /
    // `patchEntity` / `removeEntity` / `validateGame` 这 21 个函数的家——仪器刚装上就先自断一块盲区分母，
    // 那种"抬高"不是读数，是我自己看不见了。
    // 阈值不在这里：`coverage:parity` 只跑两份对账文件，分母天生是残的（87% 分支是**正常的**读数），
    // 把门钉在它身上等于逼我把范围写宽。那条钉在 `coverage:models` 的命令行上——只钉整套跑的那份读数。
    coverage: {
      provider: 'v8',
      include: ['packages/game-model/src/**/*.ts'],
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@nexus/design-model': from('./packages/design-model/src/index.ts'),
      '@nexus/schemas': from('./packages/schemas/src/index.ts'),
      '@nexus/world-model': from('./packages/world-model/src/index.ts'),
      '@nexus/game-model': from('./packages/game-model/src/index.ts'),
      '@nexus/video-model': from('./packages/video-model/src/index.ts'),
      '@': from('./apps/web/src'),
      '@web': from('./apps/web/src'),
    },
  },
});
