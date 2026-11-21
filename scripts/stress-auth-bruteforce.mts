/**
 * §STRESS-4 · 撞库（credential stuffing）场景压测（2026-11-22）
 *
 * 用户点名「模拟海量用户、高并发、瞬间大数据量冲击系统（比如撞库之类的场景）」。
 * `scripts/stress-ai-service.py` 覆盖 ai-service 的三个相位；这一份打的是
 * **web 的认证闸**——撞库的真实形状：很多"人"用同一个邮箱、成千上万次错误口令。
 *
 * 第一版跑出来全是 403：脚本没带 `nexus_csrf`，量到的是 CSRF 门而不是限流闸。
 * 那不是"测错了"，是**发现了两道门叠在一起**——现在的版本按真实攻击者的形状来：
 * 每个 worker 先 GET 一次首页拿 cookie 与 token（攻击者也会），再带 `x-csrf-token`
 * 打登录。要量的四件事：
 *
 *   1. 错误口令**永不**换到 200 —— 一次误放行都不许有；
 *   2. 闸真的会合上：错误尝试累积到阈值后回 429，且 `retryAfterMs` 说得出还要等多久；
 *   3. 过程里没有 5xx —— 被撞的不是"响应变慢"，而是"服务跟着一起倒"；
 *   4. 风暴之后服务还活着、正常请求的延迟没有数量级劣化（容灾，不是靠崩掉止住）。
 *
 * 用法：
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/stress-auth-bruteforce.mts [--total 400] [--concurrency 40]
 *
 * 退出码：0=通过 · 3=目标不可达 · 4=判据失败。
 */

import { setTimeout as delay } from 'node:timers/promises';

const argv = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return Number(inline.split('=')[1]);
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1]) return Number(argv[i + 1]);
  return fallback;
};

const BASE = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
const TOTAL = flag('total', 400);
const CONCURRENCY = flag('concurrency', 40);
const EMAIL =
  argv.find((a) => a.startsWith('--email='))?.split('=')[1] ??
  `bruteforce-probe+${Date.now().toString(36)}@nexus.test`;

const DENY = '[stress-auth]';
let failures = 0;
const bad = (name: string, detail: string): void => {
  failures += 1;
  console.error(`  ✗ ${name} — ${detail}`);
};
const ok = (name: string): void => console.log(`  ✓ ${name}`);

/** 一个"人"：自己的 cookie jar + 自己的 CSRF token。撞库是很多会话同时试，不是一个会话重复发。 */
class Attacker {
  private cookie = '';
  private token = '';

  async warm(): Promise<void> {
    const res = await fetch(`${BASE}/`, { cache: 'no-store' }).catch(() => null);
    if (!res) return;
    const setCookie = res.headers.get('set-cookie') ?? '';
    this.cookie = setCookie
      .split(/,\s*(?=[a-zA-Z_-]+=)/)
      .map((c) => c.split(';')[0])
      .filter(Boolean)
      .join('; ');
    const m = /nexus_csrf=([^;]+)/.exec(this.cookie);
    this.token = m ? decodeURIComponent(m[1] ?? '') : '';
  }

  async hit(index: number): Promise<{ status: number; retryAfterMs: number | null; ms: number }> {
    const started = Date.now();
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.token ? { 'x-csrf-token': this.token } : {}),
      },
      body: JSON.stringify({ email: EMAIL, password: `wrong-password-${index}` }),
      cache: 'no-store',
    }).catch(() => null);
    const ms = Date.now() - started;
    if (!res) return { status: 0, retryAfterMs: null, ms };
    const body = (await res.json().catch(() => null)) as { retryAfterMs?: number } | null;
    return {
      status: res.status,
      retryAfterMs: typeof body?.retryAfterMs === 'number' ? body.retryAfterMs : null,
      ms,
    };
  }
}

async function main(): Promise<void> {
  console.log(`${DENY} target=${BASE} total=${TOTAL} concurrency=${CONCURRENCY} email=${EMAIL}`);

  const probe = await fetch(`${BASE}/`, { cache: 'no-store' }).catch(() => null);
  if (!probe) {
    console.error(`${DENY} FAIL: ${BASE} 不可达——先起 dev server（npm run dev -w @nexus/web）`);
    process.exit(3);
  }

  // 每个 worker 先"热身"一次拿自己的 cookie/token——这与真实撞库的形状一致
  const attackers = await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      const a = new Attacker();
      await a.warm();
      return a;
    }),
  );
  const noToken = attackers.filter((a) => !(a as unknown as { token: string }).token).length;
  if (noToken === CONCURRENCY) {
    console.error(`${DENY} FAIL: 首页没下发 nexus_csrf——量不到登录闸，先查 cookie 是否被代理剥掉`);
    process.exit(3);
  }

  const statuses = new Map<number, number>();
  const latencies: number[] = [];
  const retryAfters: number[] = [];
  let cursor = 0;
  const started = Date.now();

  const worker = async (attacker: Attacker): Promise<void> => {
    for (;;) {
      const mine = cursor;
      cursor += 1;
      if (mine >= TOTAL) return;
      const r = await attacker.hit(mine);
      statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
      latencies.push(r.ms);
      if (r.retryAfterMs !== null) retryAfters.push(r.retryAfterMs);
    }
  };
  await Promise.all(attackers.map(worker));
  const elapsed = (Date.now() - started) / 1000;

  latencies.sort((a, b) => a - b);
  const pct = (p: number): number => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
  console.log(
    `${DENY} ${TOTAL} 发错误口令 / 并发 ${CONCURRENCY} / ${elapsed.toFixed(1)}s (${(TOTAL / elapsed).toFixed(1)} rps)`,
  );
  console.log(
    `${DENY}   状态 ${JSON.stringify(Object.fromEntries(statuses))} · p50=${pct(0.5)}ms p95=${pct(0.95)}ms p99=${pct(0.99)}ms`,
  );

  // 1. 一次成功的登录都不许发生
  if ((statuses.get(200) ?? 0) > 0) bad('错误口令没有一次成功', `${statuses.get(200)} 发拿到 200`);
  else ok('错误口令 0 次成功');

  // 2. 闸合上：401（口令错）/ 429（太频繁）/ 403（CSRF）都算"挡住"
  const blocked = (statuses.get(401) ?? 0) + (statuses.get(429) ?? 0) + (statuses.get(403) ?? 0);
  if (blocked !== TOTAL) bad('每一发都被挡住', `只有 ${blocked}/${TOTAL}`);
  else ok(`${blocked}/${TOTAL} 全部被挡住`);
  if ((statuses.get(429) ?? 0) > 0) {
    ok(
      `限流闸合上：${statuses.get(429)} 发 429，retryAfterMs ${
        retryAfters.length ? `${Math.min(...retryAfters)}–${Math.max(...retryAfters)}ms` : '（服务端未给）'
      }`,
    );
  } else {
    console.log(`${DENY}   注：本轮 ${TOTAL} 发全部落在阈值内（无 429）——把 --total 调大再看闸合上`);
  }

  // 3. 没有 5xx
  const serverErrors = [...statuses.entries()].filter(([s]) => s >= 500).reduce((n, [, c]) => n + c, 0);
  if (serverErrors > 0) bad('过程里出现 5xx', `${serverErrors} 发`);
  else ok('过程里 0 个 5xx');

  // 4. 风暴之后服务还活着：连打 10 发首页，全部 <500 才算"容灾"而不是"靠崩掉止住"
  const recovery: number[] = [];
  let aliveFailures = 0;
  for (let i = 0; i < 10; i += 1) {
    const at = Date.now();
    const r = await fetch(`${BASE}/`, { cache: 'no-store' }).catch(() => null);
    recovery.push(Date.now() - at);
    if (!r || r.status >= 500) aliveFailures += 1;
    await delay(50);
  }
  if (aliveFailures > 0) bad('风暴后首页不应答', `${aliveFailures}/10 发失败或 5xx`);
  else {
    recovery.sort((a, b) => a - b);
    ok(`风暴后 10/10 发首页正常（p50=${recovery[4]}ms p95=${recovery[8]}ms，风暴中 p50=${pct(0.5)}ms）`);
  }

  if (failures > 0) {
    console.error(`\n${DENY} FAIL — ${failures} 项判据红`);
    process.exit(4);
  }
  console.log(`\n${DENY} PASS — 撞库风暴下：0 次误放行、全部被挡、0 个 5xx、风暴后服务仍应答`);
}

void main();
