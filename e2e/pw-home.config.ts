import { defineConfig, devices } from '@playwright/test';

/**
 * §FE-18 首页 `/` 门面离线 CSS 判据：page.setContent 注入真实产物字节，
 * 不访问 URL、不依赖后端/夹具；刻意不配 webServer（沿用 FE-16/FE-17 教训，
 * 避免主 config 等满 180s）。真 Chrome、单 worker。
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'home-visual.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { colorScheme: 'dark' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
