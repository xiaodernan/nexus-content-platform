import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  // dev server 按需编译，并行跑会在首屏编译上超时（docs/ENVIRONMENT.md：16GB 本机）
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
