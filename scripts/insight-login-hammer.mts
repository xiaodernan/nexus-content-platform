#!/usr/bin/env node
/**
 * §STRESS-INSIGHT · 观察坞口令 123 守门撞库沙盘：
 *   同一 IP 每 5 分钟 30 次尝试后，后续请求（无论口令对错）返回 429；
 *   不同 IP 互不影响；正确口令在未超额时可拿到 nexus-insight cookie。
 *
 * 这是一次真实的撞库模拟（口令 123 为产品明示公开门铃，/insight 的公共口令门）—
 * 只用保留地址 203.0.113.0/24（RFC 5737 文档专用段），不做任何真实目标。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';

const PORT = 3409;
const BASE = `http://127.0.0.1:${PORT}`;

interface Sample { status: number; json: unknown; setCookie: string | null }

function req(method: 'POST', path: string, ip: string, body?: unknown): Promise<Sample> {
  return new Promise((resolve) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      `${BASE}${path}`,
      {
        method,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': ip,
          ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
        },
        timeout: 10_000,
      },
      (res) => {
        let buf = '';
        res.on('data', (c: Buffer) => (buf += c));
        res.on('end', () => {
          let json: unknown = null;
          try { json = JSON.parse(buf); } catch { json = buf; }
          resolve({ status: res.statusCode ?? 0, json, setCookie: (res.headers['set-cookie'] ?? []).join('; ') || null });
        });
      },
    );
    req.on('error', () => resolve({ status: 0, json: null, setCookie: null }));
    req.on('timeout', () => req.destroy());
    if (data) req.write(data);
    req.end();
  });
}

function startServer(): ChildProcess {
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    cwd: process.cwd() + '\\apps\\web',
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return child;
}

async function waitForServer(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await req('POST', '/api/insight/login', '203.0.113.1', { password: '000' });
    if (r.status > 0) return;
    await new Promise((r2) => setTimeout(r2, 500));
  }
  throw new Error('server did not become ready');
}

async function main(): Promise<void> {
  const child = startServer();
  try {
    await waitForServer();
    const ipFlood = '203.0.113.42';
    const ipOther = '203.0.113.77';
    const results: { label: string; status: number }[] = [];

    for (let i = 1; i <= 30; i += 1) {
      const r = await req('POST', '/api/insight/login', ipFlood, { password: `000${i}` });
      results.push({ label: `flood-${i}`, status: r.status });
    }
    for (let i = 31; i <= 35; i += 1) {
      const r = await req('POST', '/api/insight/login', ipFlood, { password: `000${i}` });
      results.push({ label: `flood-${i}`, status: r.status });
    }
    const blockedCorrect = await req('POST', '/api/insight/login', ipFlood, { password: '123' });
    const otherCorrect = await req('POST', '/api/insight/login', ipOther, { password: '123' });
    const otherWrong = await req('POST', '/api/insight/login', ipOther, { password: '999' });

    console.log('flood 1-30:', JSON.stringify(results.slice(0, 30).map((r) => r.status)));
    console.log('flood 31-35:', JSON.stringify(results.slice(30).map((r) => r.status)));
    console.log('blocked-correct:', blockedCorrect.status);
    console.log('other-correct:', otherCorrect.status, '| set-cookie has nexus-insight=1:', Boolean(otherCorrect.setCookie && otherCorrect.setCookie.includes('nexus-insight=1')));
    console.log('other-wrong:', otherWrong.status);

    const flood401sUniform = results.slice(0, 30).every((r) => r.status === 401);
    const flood429After30 = results.slice(30).every((r) => r.status === 429);
    const blockedCorrect429 = blockedCorrect.status === 429;
    const otherCorrect200 = otherCorrect.status === 200;
    const otherWrong401 = otherWrong.status === 401;
    console.log('flood-401s-uniform:', flood401sUniform);
    console.log('flood-429-after-30:', flood429After30);
    console.log('same-IP-correct-also-429:', blockedCorrect429);
    console.log('other-IP-correct-OK:', otherCorrect200);
    console.log('other-IP-wrong-401:', otherWrong401);

    if (flood401sUniform && flood429After30 && blockedCorrect429 && otherCorrect200 && otherWrong401) {
      console.log('INSIGHT-GATE PASSED — rate limit enforced per IP, cross-IP isolation holds');
    } else {
      console.log('INSIGHT-GATE FAILED — inspect output above');
      process.exitCode = 1;
    }
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
