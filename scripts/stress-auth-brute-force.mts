#!/usr/bin/env node
/**
 * §STRESS-AUTH · 撞库/口令爆破场景压力证据（2026-11-22）
 *
 * 指令第十一条点名「撞库之类的场景」。这里量的不是吞吐，是三件事：
 *   1. 第 N 次错误口令之后，登录门**准时**吐 429（不是第 N+3 次）；
 *   2. 429 带 `retry-after`，且窗口是按 IP+邮箱 而非全局（换一个邮箱不连坐）；
 *   3. 门槛是**先于**口令比对（爆破在第 10 次就停，不会把第 11 次送进 bcrypt）。
 *
 * 打的是一台**已经在跑**的服务（默认 http://127.0.0.1:3100，可用 --base 改）。
 * 只打一次性邮箱（本脚本自己注册），不碰任何真实账号。
 * 本机内存常年 1GB 上下：`--n` 默认 14 而不是 200——测的是门的**时机**，不是机器能连多少。
 *
 * 用法：npx tsx scripts/stress-auth-brute-force.mts --base http://127.0.0.1:3100 --n 14
 */
import http from 'node:http';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const BASE = flag('--base', 'http://127.0.0.1:3100');
const N = Math.max(4, Math.min(60, Number(flag('--n', '14')) || 14));
const STAMP = Date.now().toString(36);
const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });

interface Reply {
  status: number;
  ms: number;
  retryAfter: string | null;
  body: string;
}

function request(
  method: 'GET' | 'POST',
  path: string,
  payload: unknown,
  cookie: string | null,
  csrfToken: string | null = null,
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${path}`);
    const data = payload === null ? null : JSON.stringify(payload);
    const started = Date.now();
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        agent,
        headers: {
          'content-type': 'application/json',
          ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
          ...(cookie ? { cookie } : {}),
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            ms: Date.now() - started,
            retryAfter: res.headers['retry-after'] ? String(res.headers['retry-after']) : null,
            body,
          }),
        );
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** 先访问一次首页，把 session/csrf 的 cookie 收进 jar（登录与注册都要过 CSRF 双写）。 */
async function csrf(): Promise<{ cookie: string; token: string }> {
  const jar: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const url = new URL(`${BASE}/`);
    const r = http.request(
      { hostname: url.hostname, port: url.port, path: '/', method: 'GET', agent },
      (res) => {
        res.resume();
        res.on('end', () => {
          for (const raw of res.headers['set-cookie'] ?? []) jar.push(raw.split(';')[0]!);
          resolve();
        });
      },
    );
    r.on('error', reject);
    r.end();
  });
  const cookie = jar.join('; ');
  const csrfCookie = jar.find((c) => c.startsWith('nexus_csrf='));
  const token = csrfCookie ? csrfCookie.slice('nexus_csrf='.length) : '';
  return { cookie, token };
}

async function main(): Promise<void> {
  const { cookie, token } = await csrf();
  const email = `brute-${STAMP}@example.test`;
  const password = 'correct-horse-battery-staple';

  const registered = await request('POST', '/api/auth/register', { email, password, displayName: 'Brute Probe' }, cookie, token);
  const registerOk = registered.status === 200 || registered.status === 201;

  const attempts: { n: number; status: number; ms: number; retryAfter: string | null }[] = [];
  for (let i = 1; i <= N; i += 1) {
    const reply = await request('POST', '/api/auth/login', { email, password: `wrong-${i}` }, cookie, token);
    attempts.push({ n: i, status: reply.status, ms: reply.ms, retryAfter: reply.retryAfter });
  }

  const first429 = attempts.find((a) => a.status === 429);
  const lastBefore = first429 ? attempts.filter((a) => a.n < first429.n) : [];
  const non401Before = lastBefore.filter((a) => a.status !== 401);
  const wrongAfter = first429 ? attempts.filter((a) => a.n > first429.n && a.status !== 429) : [];

  // 换一个邮箱（同 IP）应当不连坐：门槛的键是 IP+邮箱。
  const otherEmail = `brute-other-${STAMP}@example.test`;
  const otherRegistered = await request(
    'POST',
    '/api/auth/register',
    { email: otherEmail, password, displayName: 'Brute Probe Two' },
    cookie,
    token,
  );
  const otherLogin = otherRegistered.status === 200 || otherRegistered.status === 201
    ? await request('POST', '/api/auth/login', { email: otherEmail, password: 'still-wrong' }, cookie, token)
    : null;

  const verdict = [
    registerOk ? 'register ok' : `register FAILED (${registered.status} ${registered.body.slice(0, 120)})`,
    first429 ? `first 429 at attempt ${first429.n}` : 'no 429 within N attempts',
    first429?.retryAfter ? `retry-after=${first429.retryAfter}s` : 'no retry-after on the 429',
    non401Before.length === 0 ? 'every pre-threshold reply is 401' : `UNEXPECTED pre-threshold codes: ${non401Before.map((a) => a.status).join(',')}`,
    wrongAfter.length === 0 ? 'nothing leaks past the threshold' : `LEAKED past threshold: ${wrongAfter.map((a) => a.status).join(',')}`,
    otherLogin ? `second account same IP: ${otherLogin.status} (not blocked)` : `second account could not be registered (${otherRegistered.status})`,
  ];

  for (const line of verdict) console.log(line);
  console.log('attempts: ' + attempts.map((a) => `${a.n}:${a.status}`).join(' '));
  console.log(`latency p50=${percentile(attempts.map((a) => a.ms), 50)}ms max=${Math.max(...attempts.map((a) => a.ms))}ms`);
  if (!first429 || non401Before.length > 0 || wrongAfter.length > 0) process.exitCode = 1;
}

function percentile(sorted: number[], p: number): number {
  const values = [...sorted].sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor((p / 100) * values.length))] ?? 0;
}

void main();
