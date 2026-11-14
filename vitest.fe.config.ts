import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const from = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * §GATE-2b：**只跑前端视觉判据的那一份配置**，由 `tools/ci/fe-gates.mjs` 使用。
 *
 * ## 为什么不直接用根 `vitest.config.ts`
 *
 * 根配置里有一行 `fileParallelism: false`，注释写得很清楚：
 *
 *     // Real-DB suites share one Postgres; 5s kills them when they queue. Sequential is cheaper than red.
 *
 * 那是为**共用同一个 Postgres 的集成测试**设的——并行跑会让它们互相踩表，红了比慢更糟。
 *
 * 但 96 套 `*-visual-style.test.ts` **一个都不碰库**：它们只 `readFileSync` 读
 * `globals.css` / `tokens.css` / 组件源码，然后做正则。把它们跟着 DB 测试一起串行，
 * 是那条约束的**误伤**——代价可以量：
 *
 *     96 套串行：vitest 内部 161.66s，其中 tests 只有 8.66s
 *                collect 25.22s + prepare 37.15s + transform 8.79s 全是串行累积
 *
 * 换句话说 **95% 的时间不是在跑判据，是在排队**。
 *
 * ## 为什么另起一份而不是改根配置
 *
 * 根配置的那条约束是对的，只是不该管到这里。改根配置=为了视觉判据去动 DB 测试的
 * 正确性；派生一份=让两种测试各按自己的约束跑。这也是 ADR-0264「判据自身的形状也是判据」
 * 的同一条思路：**约束要落在它真正保护的东西上**。
 *
 * ## 并行安全性（为什么 96 套可以同时跑）
 *
 * - **只读文件，不写**：没有一套会 `writeFileSync` 到仓库里。
 * - **无跨文件共享状态**：每套在自己的模块作用域里读一遍文件，互不可见。
 * - **无端口 / 无 DB / 无时钟依赖**：判据头注释反复写着"零浏览器、零真库、零时钟"。
 * - **每个 fork 各读一遍 globals.css**（36 万字节）：看起来是浪费，但 OS 页缓存会命中，
 *   而且这是**内存拷贝**不是磁盘 IO——`readFileSync` 在这个尺寸上是微秒级。
 *
 * ## pool 选 forks 而不是 threads
 *
 * Windows 上 `worker_threads` 起停更慢，且 `readFileSync` 是同步阻塞调用——
 * 在线程池里阻塞会拖住同进程的其他测试；fork 各自独立进程，阻塞只影响自己。
 */
export default defineConfig({
  test: {
    include: ['apps/web/test/**/*-visual-style.test.ts'],
    // 与根配置一致：node 环境，不开 globals（判据显式 import describe/it/expect）
    environment: 'node',
    globals: false,
    reporters: 'dot',
    // 这些判据没有异步等待，30s 是给冷启动 + 大文件正则的宽裕上限，不是给慢测试的
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // ── 与根配置唯一的实质差异 ──
    fileParallelism: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        // 留一个核给主进程与 OS：判据是纯 CPU（正则），开满会与 reporter 抢。
        // 上限 8：**不是为了省 CPU，是为了省内存**——每个 fork 各自持有一份
        // 36 万字节 CSS + 若干源码字符串，16 个 fork 的峰值 RSS 会到 GB 级。
        maxForks: Math.max(2, Math.min(8, availableParallelism() - 1)),
        minForks: 1,
      },
    },

    // 不跑 coverage：fe-gates 关心的是"过没过"，覆盖率是另一条流水线的事，
    // 而 v8 coverage 会给每个 fork 装一遍探针，正好抵消并行的收益。
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
