#!/usr/bin/env node
/**
 * 本机应用自愈探针：检查 http://127.0.0.1:3100 是否活着。
 *
 * 背景（2026-11-24）：用户反复看到 `ECONNREFUSED`，排查确认本机代理层早已全清
 * （系统代理关 / 无 7897 监听 / env 无代理）。真正反复触发 ECONNREFUSED 的是
 * 环境/会话重启会把 dev server 进程杀掉——进程没了，端口自然没人监听。
 * 这个探针给「一键确认 + 自愈」提供确定性入口，不依赖任何 provider/网络代理。
 *
 * 端口可用 WEB_PORT 指定（默认 3100）。本机发现 3100 被并行线的 next start 占用，
 * 本仓最新改动跑在 3101；守护任务应设 WEB_PORT=3101，避免守护错对象。
 *
 * 用法：
 *   node scripts/check-web-health.mjs            # 只检查，健康 exit 0，否则 exit 1
 *   node scripts/check-web-health.mjs --auto     # 不健康就用 start-web-clean.mjs dev 拉起并等到 200
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.WEB_PORT || 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const auto = process.argv.includes('--auto');
const LOG = join(process.cwd(), '.scratch', 'web-watchdog.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { mkdirSync(join(process.cwd(), '.scratch'), { recursive: true }); appendFileSync(LOG, line); }
  catch { /* 日志失败不影响自检本身 */ }
  if (!auto) console.log(msg);
}

function probe() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}/`, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', () => resolve(0));
    req.setTimeout(15000, () => { req.destroy(); resolve(0); });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let code = await probe();
  if (code === 200) {
    log(`WEB_OK ${BASE} -> 200`);
    return;
  }
  log(`WEB_DOWN ${BASE} -> ${code || 'ECONNREFUSED'}`);
  if (!auto) {
    process.exitCode = 1;
    return;
  }
  log(`AUTO_RESTART next dev -p ${PORT} (no proxy)`);
  const env = { ...process.env };
  for (const k of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']) delete env[k];
  env.NO_PROXY = 'localhost,127.0.0.1,::1';
  env.NEXUS_DATABASE_URL = env.NEXUS_DATABASE_URL || 'postgres://nexus_app:nexus_dev_app_only@127.0.0.1:5433/nexus_dev';
  env.NEXUS_REDIS_URL = env.NEXUS_REDIS_URL || 'redis://127.0.0.1:56379/0';
  const spawnOpts = { env, detached: true, stdio: 'ignore', shell: process.platform === 'win32', cwd: join(process.cwd(), 'apps', 'web') };
  // Windows 下用 `start "" /b` 让 next dev 脱离计划任务的进程树——
  // 否则任务结束时 detached 子进程仍会被一并终止（实测：任务里 AUTO_RESTART 后没恢复，手动跑就恢复）。
  (process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', `start "" /b npx next dev -p ${PORT}`], spawnOpts)
    : spawn('npx', ['next', 'dev', '-p', String(PORT)], spawnOpts)
  ).unref();
  for (let i = 0; i < 30; i++) {
    await wait(2000);
    code = await probe();
    if (code === 200) {
      log(`WEB_RECOVERED after ${(i + 1) * 2}s -> 200`);
      return;
    }
  }
  log('WEB_RECOVER_FAILED after 60s');
  process.exitCode = 1;
}
void main().catch((error) => {
  log('WEB_CHECK_CRASHED: ' + (error && error.message ? error.message : String(error)));
  process.exitCode = 1;
});
