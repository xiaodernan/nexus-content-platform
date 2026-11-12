import { defineConfig, devices } from '@playwright/test';

/**
 * §FE-19 Studio 顶栏 `.sp-` 门面离线 CSS 判据：page.setContent 注入真实产物字节，
 * 不访问 URL、不依赖后端/夹具/会话；刻意不配 webServer（沿用 FE-16/FE-18 教训，
 * 避免主 config 等满 180s）。真 Chrome、单 worker。
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'studio-topbar-visual.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { colorScheme: 'dark' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
