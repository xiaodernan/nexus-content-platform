import { defineConfig, devices } from '@playwright/test';

/**
 * §A11Y-2 disclosure 契约的**离线 CSS/DOM 因果判据**专用 config：本片 e2e 用
 * `page.setContent` 做纯 DOM A/B 对照（真 Chromium 下验 aria-controls 指向的面板真实存在），
 * **不访问任何 URL、不依赖后端**，因此刻意不配 `webServer`——避免主 config 的探活
 * 在本机后端网关 502 时等满 180s（A11Y-1 / FE-7 踩过的坑）。真 Chrome、单 worker。
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'disclosure-controls.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { colorScheme: 'dark' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
