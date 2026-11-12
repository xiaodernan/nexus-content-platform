import { defineConfig, devices } from '@playwright/test';

/**
 * §A11Y-4 /admin 管理台首页离线 CSS 判据配置：用 `page.setContent` 注入真实产物字节，
 * 不访问任何 URL、不依赖后端/夹具（`page.setContent` 零外部访问）；刻意不配 `webServer`
 * （避免主 config 等满 180s，沿用 FE-7/FE-16 教训）。真 Chrome、单 worker。
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'admin-home.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { colorScheme: 'dark' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
