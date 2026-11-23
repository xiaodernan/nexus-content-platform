import { performance } from 'node:perf_hooks';

const BASE = 'http://localhost:3100';
const TIMEOUT_MS = 20000;

async function one(fn) {
  const t0 = performance.now();
  try {
    const res = await fn();
    return { status: res.status, ms: performance.now() - t0 };
  } catch (err) {
    return { status: -1, ms: performance.now() - t0, err: String(err).slice(0, 60) };
  }
}

async function pool(items, conc, worker) {
  const queue = [...items];
  const results = [];
  const lane = async () => {
    while (queue.length) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  };
  await Promise.all(Array.from({ length: conc }, lane));
  return results;
}

const bucket = (rs) => {
  const by = {};
  for (const r of rs) by[r.status] = (by[r.status] ?? 0) + 1;
  const lat = rs.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length / 2)] ?? 0;
  const p95 = lat[Math.floor(lat.length * 0.95)] ?? 0;
  const max = lat[lat.length - 1] ?? 0;
  return { by, p50: Math.round(p50), p95: Math.round(p95), max: Math.round(max) };
};
const summary = (name, rs) => {
  const b = bucket(rs);
  console.log(`${name}: n=${rs.length} statuses=${JSON.stringify(b.by)} p50=${b.p50}ms p95=${b.p95}ms max=${b.max}ms`);
};

const stamp = Date.now().toString(36);
const fakeIp = (i) => `203.0.113.${i + 10}`;
const LIGHT = process.env.LIGHT === '1';

// Phase A · read burst (public GET, no cookie)
if (!LIGHT) {
  summary('A read-burst  /api/notifications', await pool(Array.from({ length: 96 }), 24, () => one(() => fetch(`${BASE}/api/notifications?limit=1`, { signal: AbortSignal.timeout(TIMEOUT_MS) }))));
} else {
  console.log('A skipped (LIGHT=1 · DB/Docker 不可用时只测无依赖路由，如实避开假容量数字)');
}

// Phase B · 登录撞库模拟（15 个伪造右端 XFF 来源 · 密码故意全错）
const wrong = Array.from({ length: 90 }, (_, i) => ({ ip: fakeIp(i % 15), i }));
summary('B brute-force /api/insight/login (wrong pw, 15 srcs)', await pool(wrong, 30, ({ ip, i }) => one(() =>
  fetch(`${BASE}/api/insight/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.9, ${ip}` },
    body: JSON.stringify({ password: `wrong-${i}` }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }))));

// Phase C · 合法管理员瞬时突增（全部来自同一 IP · 密码 123）
const legit = Array.from({ length: 24 });
summary('C legit-burst /api/insight/login (pw=123, one src)', await pool(legit, 24, () => one(() =>
  fetch(`${BASE}/api/insight/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.77' },
    body: JSON.stringify({ password: '123' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }))));

// Phase D · 新账号并发注册（真实写库 · 5xx 检查）
if (!LIGHT) {
  const signups = Array.from({ length: 12 }, (_, i) => `stress-${stamp}-${i}@example.com`);
  summary('D register-burst /api/auth/register (12 fresh)', await pool(signups, 6, (email) => one(() =>
    fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${200 + (email.length % 40)}` },
      body: JSON.stringify({ email, password: 'Stress-12345', displayName: 'stress' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }))));

  // Phase E · 复制同一封邮件并发（撞库/重复注册场景）
  summary('E duplicate-email /api/auth/register (x6, same addr)', await pool(Array.from({ length: 6 }), 6, () => one(() =>
    fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.250' },
      body: JSON.stringify({ email: `dup-${stamp}@example.com`, password: 'Stress-12345', displayName: 'stress' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }))));
} else {
  console.log('D/E skipped (LIGHT=1 · DB/Docker 不可用时只测无依赖路由，如实避开假容量数字)');
}
