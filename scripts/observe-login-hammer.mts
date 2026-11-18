#!/usr/bin/env node
/**
 * §STRESS-OB — 观察站守门撞库沙盘：
 *   同一 IP 每小时 30 次尝试后，后续请求（无论口令对错）返回 429；
 *   不同 IP 互不影响；正确口令在未超额时可拿到 nx_observer cookie。
 *
 * 这是一次真实的撞库模拟（管理员页面为用户明确授权公开的 123 入口）——
 * 只用保留地址 203.0.113.0/24（RFC 5737 文档专用段），不做任何真实目标。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';

const PORT = 3407;
const BASE = `http://127.0.0.1:${PORT}`;

interface Sample { status: number; json: unknown }

function req(method: 'POST' | 'DELETE', path: string, ip: string, body?: unknown): Promise<Sample> {
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
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on('error', () => resolve({ status: 0, json: null }));
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
    const r = await req('POST', '/api/admin/observe', '203.0.113.1', { password: '000' });
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

    // 1) 撞库：同一 IP 连打 35 次错误口令 → 前 30 个 401，之后 429
    for (let i = 1; i <= 35; i++) {
      const r = await req('POST', '/api/admin/observer', ipFlood, { password: '000' });
      results.push({ label: `flood-${i}`, status: r.status });
    }
    // 2) 同一 IP 在限额内的攻击路径耗尽后，正确口令也应 429
    const blocked = await req('POST', '/api/admin/observer', ipFlood, { password: '123' });
    results.push({ label: 'blocked-correct', status: blocked.status });

    // 3) 未受限 IP：正确口令拿到 cookie；错误口令 401
    const ok = await req('POST', '/api/admin/observer', ipOther, { password: '123' });
    results.push({ label: 'other-correct', status: ok.status });
    const wrong = await req('POST', '/api/admin/observer', ipOther, { password: '000' });
    results.push({ label: 'other-wrong', status: wrong.status });

    const floodSeries = results.filter((r) => r.label.startsWith('flood-')).map((r) => r.status);
    const first30 = floodSeries.slice(0, 30);
    const rest = floodSeries.slice(30);
    console.log('flood 1-30:', JSON.stringify(first30));
    console.log('flood 31-35:', JSON.stringify(rest));
    console.log('blocked-correct:', results.find((r) => r.label === 'blocked-correct')?.status);
    console.log('other-correct:', results.find((r) => r.label === 'other-correct')?.status);
    console.log('other-wrong:', results.find((r) => r.label === 'other-wrong')?.status);

    const ok1 = first30.every((s) => s === 401);
    const restOk = rest.every((s) => s === 429);
    const blockedOk = results.find((r) => r.label === 'blocked-correct')?.status === 429;
    const otherCorrect = results.find((r) => r.label === 'other-correct')?.status === 200;
    const otherWrong = results.find((r) => r.label === 'other-wrong')?.status === 401;

    console.log('flood-401s-uniform:', ok1);
    console.log('flood-429-after-30:', restOk);
    console.log('same-IP-correct-also-429:', blockedOk);
    console.log('other-IP-correct-OK:', otherCorrect);
    console.log('other-IP-wrong-401:', otherWrong);

    if (!(ok1 && restOk && blockedOk && otherCorrect && otherWrong)) {
      process.exitCode = 1;
      console.log('OBSERVE-GATE FAILED');
    } else {
      console.log('OBSERVE-GATE PASSED — rate limit enforced per IP, cross-IP isolation holds');
    }
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
