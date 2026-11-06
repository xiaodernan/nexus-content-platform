import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  // dev server 按需编译，并行跑会在首屏编译上超时（docs/ENVIRONMENT.md：16GB 本机）
  fullyParallel: false,
  workers: 1,
  /**
   * 断言默认等 20 秒，不是 Playwright 默认的 5 秒。
   * **Why:** 2026-11-06 分片复跑 studio 那 57 条时，两条 @smoke 用例都红在同一句话上——
   * 点击换来的那次服务端答复没在 5 秒内落到 DOM（`[data-snapshot-diff-list]` 一次、
   * `[data-branch][data-branch-name="design-v2"]` 一次），失败现场的 a11y 快照里按钮全在
   * `snapshotBusy`（"处理中…"）状态，说明请求还在路上而不是产品没做；同一批用例在路由已编译
   * 第二遍就 15.1s 整体通过。这台机器的两个慢因不是回归：dev server 首访按需编译，
   * 而 Postgres 跑在 Docker bind mount 上（docs/ENVIRONMENT.md 记过这一笔）。
   * **限度：** 这一格买的是"别把延迟读成缺陷"，不是"多慢都算过"——真正的性能账在
   * `npm run perf:browser` 与 `scripts/*-cost.mts` 那些基线脚本上，它们测的是耗时，不看通过与否。
   * 用例里已有的 `{ timeout: 20_000 }` 与此同数，不另立一套口径。
   */
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 产品首访跟随系统偏好；Playwright 默认浅色会让既有暗色用例整体漂移。
    // 浅色用例（a11y-light / theme-toggle）自己显式 emulateMedia。
    colorScheme: 'dark',
  },
  // 本机下载不到 Playwright 自带 Chromium，统一用系统 Chrome（docs/ENVIRONMENT.md）
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'npm run dev -w @nexus/web',
    url: WEB_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
