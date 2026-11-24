#!/usr/bin/env node
/**
 * 本机应用自愈探针：检查 http://127.0.0.1:3100 是否活着。
 *
 * 背景（2026-11-24）：用户反复看到 `ECONNREFUSED`，排查确认本机代理层早已全清
 * （系统代理关 / 无 7897 监听 / env 无代理）。真正反复触发 ECONNREFUSED 的是
 * 环境/会话重启会把 dev server 进程杀掉——进程没了，端口自然没人监听。
 * 这个探针给「一键确认 + 自愈」提供确定性入口，不依赖任何 provider/网络代理。
 *
 * 用法：
 *   node scripts/check-web-health.mjs            # 只检查，健康 exit 0，否则 exit 1
 *   node scripts/check-web-health.mjs --auto     # 不健康就用 start-web-clean.mjs dev 拉起并等到 200
 */
import http from 'node:http';
import { spawn } from 'node:child_process';

const BASE = 'http://127.0.0.1:3100';
const auto = process.argv.includes('--auto');

function probe() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}/`, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', () => resolve(0));
    req.setTimeout(8000, () => { req.destroy(); resolve(0); });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let code = await probe();
  if (code === 200) {
    console.log(`WEB_OK ${BASE} -> 200`);
    return;
  }
  console.log(`WEB_DOWN ${BASE} -> ${code || 'ECONNREFUSED'}`);
  if (!auto) {
    process.exitCode = 1;
    return;
  }
  console.log('AUTO_RESTART via start-web-clean.mjs dev');
  const env = { ...process.env };
  for (const k of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']) delete env[k];
  env.NO_PROXY = 'localhost,127.0.0.1,::1';
  spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev:web:clean'], { env, detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 30; i++) {
    await wait(2000);
    code = await probe();
    if (code === 200) {
      console.log(`WEB_RECOVERED after ${(i + 1) * 2}s -> 200`);
      return;
    }
  }
  console.error('WEB_RECOVER_FAILED after 60s');
  process.exitCode = 1;
}
main();
