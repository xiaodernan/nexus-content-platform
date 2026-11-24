#!/usr/bin/env node
/**
 * 一键网络/端口自查：把过去十几轮反复排查的结论固化成可重复执行的读数。
 * 零 provider、零外网依赖（探测本机 3100 与 WinHTTP/系统代理的注册表读数）。
 *
 * 用法：node scripts/diagnose-connectivity.mjs
 */
import http from 'node:http';
import { execFileSync } from 'node:child_process';

function probe(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', () => resolve(0));
    req.setTimeout(15000, () => { req.destroy(); resolve(0); });
  });
}

const out = {};
out.app3100 = await probe(3100);
out.app3101 = await probe(3101);

// Windows 系统代理（IE/LAN）——Clash 曾写回这里
if (process.platform === 'win32') {
  try {
    const ps = `Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' | ForEach-Object { "enable=$($_.ProxyEnable) server=$($_.ProxyServer)" }`;
    out.ieProxy = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  } catch (e) { out.ieProxy = 'read-failed: ' + String(e).slice(0, 80); }
  try {
    out.winhttp = execFileSync('netsh', ['winhttp', 'show', 'proxy'], { encoding: 'utf8' }).trim().split('\n').slice(-2).join(' ').trim();
  } catch { out.winhttp = 'unavailable'; }
  try {
    const ps2 = `Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(7890,7891,7897,1080,10809) } | ForEach-Object { "port=$($_.LocalPort) pid=$($_.OwningProcess)" }`;
    const r = execFileSync('powershell', ['-NoProfile', '-Command', ps2], { encoding: 'utf8' }).trim();
    out.proxyPorts = r || 'none';
  } catch { out.proxyPorts = 'unavailable'; }
}
out.envProxy = {
  HTTP: process.env.HTTP_PROXY ?? null,
  HTTPS: process.env.HTTPS_PROXY ?? null,
  ALL: process.env.ALL_PROXY ?? null,
};

console.log(JSON.stringify(out, null, 1));
