#!/usr/bin/env node
/**
 * 无代理启动 web —— 防止从带 Clash 变量的 shell 继承 HTTP_PROXY/HTTPS_PROXY。
 * 2026-11-24：用户明确不再使用 Clash Verge；这也让「不开 Clash 就 ECONNREFUSED」
 * 不再由本仓的启动方式引起（真正的绑定点在 ai-service/.env，已清）。
 *
 * 用法：node scripts/start-web-clean.mjs [-- start|dev]
 * - dev（默认）：next dev -p 3100
 * - start：next start -p 3100（压测脚本要求的生产构建目标）
 */
import { spawn } from 'node:child_process';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const env = { ...process.env };
for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
  delete env[key];
}
env.NO_PROXY = 'localhost,127.0.0.1,::1';

const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', mode, '-w', '@nexus/web'], { env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
