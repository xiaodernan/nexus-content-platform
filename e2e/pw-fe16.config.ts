import { defineConfig, devices } from '@playwright/test';

/**
 * §FE-16 credits 页门面化离线 CSS 判据专用 config：e2e 用 `page.setContent` 注入真实产物字节，
 * **不访问任何 URL、不依赖后端**，刻意不配 `webServer`（避免主 config 探活在本机后端网关 502
 * 时等满 180s，沿用 FE-7 教训）。真 Chrome、单 worker。
 * 初稿标注为"临时文件提交前删"；spec（`e2e/credits-visual.spec.ts`）补齐落地后此配置成为
 * 它的唯一入口，永久保留——删它等于再让 §FE-16 的浏览器那一寸无法复检。
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'credits-visual.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { colorScheme: 'dark' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
