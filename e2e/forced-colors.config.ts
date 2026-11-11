import { defineConfig, devices } from '@playwright/test';

/**
 * §A11Y-1 离线 CSS 判据专用 config：本片的 e2e 用 `page.setContent` 做纯 CSS A/B 对照，
 * **不访问任何 URL、不依赖后端**，因此刻意不配 `webServer`——避免主 config 的探活
 * 在本机后端网关 502 时等满 180s（FE-7 首跑踩过的坑）。真 Chrome、单 worker。
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'forced-colors.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { colorScheme: 'dark' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
