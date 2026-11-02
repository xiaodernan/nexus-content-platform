/**
 * §64 那句"多实例共享计数"的最后一寸：两个**真实的操作系统进程**，不是一个进程里的两个对象。
 *
 * `apps/web/test/rate-limit.redis.integration.test.ts` 里那两个 limiter 实例共享同一个
 * globalThis、同一个进程、同一份模块图——它证明的是**窗口与回执**，证明不了生产路径上那台单例
 * 会在两个进程里各自选到 Redis 驱动，也证明不了"跨进程的并发突发"真的一次只挤进 limit 条
 * （同进程里两条并发命令走的是同一条连接的 pipeline，跨进程才是两条连接）。这里补的是那一寸：
 *
 * - 每一趟判定都是一个**新进程**（`spawnSync` / `spawn`），那份单例在它们身上各建各的；
 * - 进程之间唯一的通道是那台 Redis 上的同一个键，与生产部署里两台机器之间的一样；
 * - 判据读的是**那台 Redis 里那条集合**（父进程自己 `ZRANGE`），不采信孩子进程自述的数——
 *   "退回进程内"这件事在自述里也可能写着放行，读线路才分得开。
 *
 * 最要紧的一对是 `SHARED_WINDOW_CAPPED` 与 `MEMORY_COUNTS_SEPARATELY`：前者说"四个进程合计
 * 恰好三次放行"，后者是它的对照——同一串请求、同一个键名、同一个限额，把环境变量换成空之后
 * 四次全放行。少了后者，前者就分不清是"共享窗口生效了"还是"这台机器上压根没在限"。
 *
 * `CROSS_PROCESS_ATOMIC_BURST` 单独一条问原子性：两个进程**同时**各砸 5 条并发，
 * 合计必须恰好放行 4 条，而 Redis 里必须正好 4 条成员。`ZADD` 对同名成员是"改分数"，
 * 所以配上 `BURST_MEMBERS_DISTINCT_ACROSS_AND_WITHIN`：成员名若取 `Date.now()`，同毫秒那几条
 * 会在集合里压成一条，于是计数恒等于 1、而"放行 4 条"这种读法可能还是绿的
 * （探针实测过那个形状：成员同名时五条全放行，`[1,1,1,1,1]`）。
 *
 * 反向控制跑过一遍（2026-10-31，手工把 redis 段那一趟的 `NEXUS_REDIS_URL` 指到没人听的 56399）：
 * `SHARED_WINDOW_CAPPED` 当场红，而 `REDIS_DOWN_STILL_GATES` 照样绿。所以判据读的是线路，
 * 不是磁盘上那份报告——这一遍的读数存在 `.scratch/s32-arm-A5.txt`。
 *
 * 用法：`npm run ratelimit:two-process`（只要 Redis 在 56379，不需要数据库）。
 * 每条判据打一行 `verdict <名>: <值>`，任何一条不对就非零退出。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Redis } from 'ioredis';

/** 与 `rateLimitRedis.ts` 的 `REDIS_URL_ENV` 同一串；父进程不 import 那个模块（见下面 load() 的说明）。 */
const REDIS_URL_ENV = 'NEXUS_REDIS_URL';
/** 与 `rateLimitRedis.ts` 的 `DEFAULT_KEY_PREFIX` 同一串——孩子进程走生产单例，前缀也是默认那个。 */
const KEY_PREFIX = 'nexus:ratelimit:v1:';

type RateLimitModule = typeof import('../apps/web/src/server/security/rateLimit');
type MemoryModule = typeof import('../apps/web/src/server/security/rateLimitMemory');
type RedisDriverModule = typeof import('../apps/web/src/server/security/rateLimitRedis');

/**
 * 只有拿到 role 的孩子进程才走到这里。顶层一个 app 模块都不 import：那些模块属于 `apps/web`
 * 的模块图，父进程在仓库根下没有那份 tsconfig 也就解析不到别名，而父进程本来也不该拿到限流器的
 * 连接——它只负责 spawn、查线路与判定。
 */
async function load(): Promise<RateLimitModule & MemoryModule & RedisDriverModule> {
  return {
    ...(await import('../apps/web/src/server/security/rateLimit')),
    ...(await import('../apps/web/src/server/security/rateLimitMemory')),
    ...(await import('../apps/web/src/server/security/rateLimitRedis')),
  };
}

const ROOT = resolve(import.meta.dirname, '..');
/** apps/web 的模块用了 `@/…` 别名；tsx 只认这个 tsconfig，仓库根下没有。 */
const WEB_TSCONFIG = resolve(ROOT, 'apps/web/tsconfig.json');
const WORK = resolve(ROOT, '.scratch/rate-limit-two-process');
const REDIS_URL = process.env[REDIS_URL_ENV]?.trim() || 'redis://127.0.0.1:56379';
/** 没人监听的端口：`REDIS_DOWN_STILL_GATES` 那一格要的正是"连不上"，所以不能借用上面那个真地址。 */
const DEAD_URL = 'redis://127.0.0.1:56399';

/** 桶键的形状是生产的（`路由|身份|IP`），但路由名是这条演练专用的，不与任何真实闸的窗口撞。 */
const KEY_SEQ = 'two-process/seq|ops-seq|192.0.2.10';
const KEY_BURST = 'two-process/burst|ops-burst|192.0.2.11';
const KEY_DEAD = 'two-process/dead|ops-dead|127.0.0.1';
const KEY_DEAD_PAIR = 'two-process/dead-pair|ops-pair|127.0.0.1';
const SEQ_LIMIT = 3;
const BURST_LIMIT = 4;
const BURST_PER_PROCESS = 5;
const WINDOW_MS = 60_000;

type Phase = 'redis' | 'memory' | 'dead';

interface Decision {
  allowed: boolean;
  count: number;
  retryAfterMs: number;
}

interface ProbeReport {
  phase: Phase;
  pid: number;
  driver: string;
  /** 只有 Redis 驱动才有这一格；进程内驱动没有连接，报 `null` 而不是 `true`。 */
  ready: boolean | null;
  fallbackCount: number;
  lastConnectionError: string | null;
  key: string;
  limit: number;
  decisions: Decision[];
}

/** 落盘走 temp + rename：父进程读的时候不能读到半份 JSON。 */
function write(name: string, value: unknown): void {
  const tmp = resolve(WORK, `${name}.tmp`);
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, resolve(WORK, name));
}

function read<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(resolve(WORK, name), 'utf8')) as T;
  } catch {
    return null;
  }
}

function childEnv(redisUrl: string): NodeJS.ProcessEnv {
  // 放在 `...process.env` 之后：父进程自己那一份（可能来自 .env）不该决定孩子选哪个驱动。
  return { ...process.env, [REDIS_URL_ENV]: redisUrl, TSX_TSCONFIG_PATH: WEB_TSCONFIG };
}

async function sequential(call: () => Promise<Decision>, times: number): Promise<Decision[]> {
  const log: Decision[] = [];
  for (let i = 0; i < times; i += 1) log.push(await call());
  return log;
}

/**
 * 孩子进程：走**生产的单例入口**（`getRateLimiter()`），不是自己 `new` 一个驱动——
 * 这一格要证的正是"设了这个环境变量，这台机器上的这一份就会选到 Redis 那份"，
 * 绕过门面直接 new 就把要测的东西测了个空。
 */
async function roleProbe(phase: Phase, key: string, limit: number, times: number, concurrent: boolean, out: string): Promise<void> {
  const m = await load();
  const limiter = m.getRateLimiter();
  const isRedis = limiter instanceof m.RedisRateLimiter;
  const ready = isRedis ? await limiter.ready : null;
  const call = (): Promise<Decision> => limiter.hit(key, limit, WINDOW_MS);
  // 并发那一趟一次把 N 条发出去（同一条连接上 pipeline 出去）；顺序那一趟一条条来。
  const raw = concurrent ? await Promise.all(Array.from({ length: times }, call)) : await sequential(call, times);
  const report: ProbeReport = {
    phase,
    pid: process.pid,
    driver: limiter.constructor.name,
    ready,
    fallbackCount: isRedis ? limiter.fallbackCount : 0,
    lastConnectionError: isRedis ? limiter.lastConnectionError : null,
    key,
    limit,
    decisions: raw.map((d): Decision => ({ allowed: d.allowed, count: d.count, retryAfterMs: d.retryAfterMs })),
  };
  write(out, report);
  if (isRedis) limiter.dispose();
  process.exit(0);
}

const ROLE = process.argv[2];
if (ROLE === 'probe') {
  const [, , , phase, key, limit, times, concurrent, out] = process.argv;
  await roleProbe(phase as Phase, key!, Number(limit), Number(times), concurrent === '1', out!);
  process.exit(0);
}

// —— 以下是父进程 ——

mkdirSync(WORK, { recursive: true });
for (const name of ['seq-1.json', 'seq-2.json', 'seq-3.json', 'seq-4.json', 'mem-1.json', 'mem-2.json', 'mem-3.json', 'mem-4.json', 'burst-a.json', 'burst-b.json', 'dead-1.json', 'dead-2.json', 'dead-3.json']) {
  rmSync(resolve(WORK, name), { force: true });
}

const wire = new Redis(REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 2_000 });

/**
 * 先探一次线路。这一格的失败里最坏的一种不是"代码坏了"而是"引擎没了"：
 * Docker 的端口在引擎死掉之后还会继续 LISTENING（本机实测过），于是这里会花掉整预算才超时，
 * 看起来像是新驱动有 bug。一次 ping 几毫秒就能把两种红分开。
 */
try {
  await wire.connect();
  if ((await wire.ping()) !== 'PONG') throw new Error('ping 回来的不是 PONG');
  console.log(`[线路] ${REDIS_URL} 在（PONG）`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Redis 线路不通（${REDIS_URL}）：${message}\n这一格只要 Redis，不要数据库：起服务用 npm run infra:up。`, { cause: error });
}

/** 把演练用的键清干净，并且**确认真的干净**——踩上一轮留下的窗口，"合计恰好三次"就读不出来了。 */
async function wipe(...keys: string[]): Promise<void> {
  await wire.unlink(...keys.map((k) => `${KEY_PREFIX}${k}`));
  for (const key of keys) {
    if ((await wire.exists(`${KEY_PREFIX}${key}`)) !== 0) throw new Error(`键还没清干净：${KEY_PREFIX}${key}`);
  }
}

function runProbe(label: string, phase: Phase, url: string, key: string, limit: number, times: number, concurrent: boolean): ProbeReport {
  const done = spawnSync(process.execPath, ['--import', 'tsx', import.meta.filename, 'probe', phase, key, String(limit), String(times), concurrent ? '1' : '0', label], {
    cwd: resolve(ROOT, 'apps/web'),
    env: childEnv(url),
    encoding: 'utf8',
  });
  const printed = `${done.stdout ?? ''}${done.stderr ?? ''}`;
  writeFileSync(resolve(WORK, `log-${label}`), printed);
  if (done.status !== 0) throw new Error(`${label} 非零退出（status=${done.status}）：\n${printed.slice(-1500)}`);
  const report = read<ProbeReport>(label);
  if (!report) throw new Error(`${label} 零退出却没写出报告`);
  console.log(`[${label} pid=${report.pid} ${report.driver}] ${report.decisions.map((d) => (d.allowed ? '放行' : '挡')).join(' ')}`);
  return report;
}

/** 并发那一组：两个进程**同时**起来，各自砸 5 条并发到同一个键上（两条真连接）。 */
async function runConcurrentPair(labelA: string, labelB: string, url: string, key: string, limit: number, times: number): Promise<[ProbeReport, ProbeReport]> {
  const start = (label: string): Promise<ProbeReport> =>
    new Promise((resolveRun, rejectRun) => {
      const fd = openSync(resolve(WORK, `log-${label}`), 'w');
      const child = spawn(process.execPath, ['--import', 'tsx', import.meta.filename, 'probe', 'redis', key, String(limit), String(times), '1', label], {
        cwd: resolve(ROOT, 'apps/web'),
        env: childEnv(url),
        stdio: ['ignore', fd, fd],
      });
      child.once('error', rejectRun);
      child.once('exit', (code) => {
        const report = read<ProbeReport>(label);
        if (code !== 0) return rejectRun(new Error(`${label} 非零退出（status=${code}）：\n${readFileSync(resolve(WORK, `log-${label}`), 'utf8').slice(-1500)}`));
        if (!report) return rejectRun(new Error(`${label} 零退出却没写出报告`));
        resolveRun(report);
      });
    });
  const pair = await Promise.all([start(labelA), start(labelB)]);
  console.log(`[并发对] ${labelA}(pid=${pair[0].pid}) + ${labelB}(pid=${pair[1].pid})`);
  return pair;
}

// ① 跨进程共享窗口：三个进程各打一次都放行，第四个进程被挡。
await wipe(KEY_SEQ);
const seq = [1, 2, 3, 4].map((n) => runProbe(`seq-${n}.json`, 'redis', REDIS_URL, KEY_SEQ, SEQ_LIMIT, 1, false));

// ② 对照：同样的四个进程、同样的键名与限额，只是不设环境变量 ⇒ 进程内驱动，四次全放行。
const mem = [1, 2, 3, 4].map((n) => runProbe(`mem-${n}.json`, 'memory', '', KEY_SEQ, SEQ_LIMIT, 1, false));

// ③ 跨进程并发突发：两个进程同时各砸 5 条，合计恰好放行 4 条。
await wipe(KEY_BURST);
const [burstA, burstB] = await runConcurrentPair('burst-a.json', 'burst-b.json', REDIS_URL, KEY_BURST, BURST_LIMIT, BURST_PER_PROCESS);

// ④ 线路断了：判定退回进程内，不抛、仍挡住，而且每台各数各的（这一句是代价，不是成功）。
await wipe(KEY_DEAD, KEY_DEAD_PAIR);
const dead = runProbe('dead-1.json', 'dead', DEAD_URL, KEY_DEAD, 3, 5, false);
const deadPair = [
  runProbe('dead-2.json', 'dead', DEAD_URL, KEY_DEAD_PAIR, 1, 1, false),
  runProbe('dead-3.json', 'dead', DEAD_URL, KEY_DEAD_PAIR, 1, 1, false),
];

// ⑤ 权威读数：Redis 里那两条集合，由父进程自己数，不采信孩子进程的自述。读完就清场，
//     不给下一轮留残窗口（残窗口的红会长成"限额生效了"的样子）。
const seqMembers = await wire.zrange(`${KEY_PREFIX}${KEY_SEQ}`, 0, '-1');
const burstMembers = await wire.zrange(`${KEY_PREFIX}${KEY_BURST}`, 0, '-1');
await wipe(KEY_SEQ, KEY_BURST, KEY_DEAD, KEY_DEAD_PAIR);
await wire.quit();

const allowedOf = (...reports: ProbeReport[]): number =>
  reports.reduce((n, r) => n + r.decisions.filter((d) => d.allowed).length, 0);
const seqAllowed = seq.map((r) => r.decisions[0]?.allowed ?? false);
const memAllowed = mem.map((r) => r.decisions[0]?.allowed ?? false);
const redisChildren = [...seq, burstA, burstB];
/** 成员名是 `实例身份:序号`，而身份的第一段是 pid：跨进程必然不同，同进程同毫秒靠序号不同。 */
const pidOf = (member: string): string => member.split(':')[0] ?? '';
const multiplicity = (members: string[]): number => {
  const counts = new Map<string, number>();
  for (const member of members) counts.set(pidOf(member), (counts.get(pidOf(member)) ?? 0) + 1);
  return Math.max(0, ...counts.values());
};
const burstPids = new Set([String(burstA.pid), String(burstB.pid)]);

const verdicts: [string, boolean, string][] = [
  [
    'CHILDREN_USE_REDIS_DRIVER',
    redisChildren.every((r) => r.driver === 'RedisRateLimiter') && redisChildren.every((r) => r.ready === true),
    `redis 段 ${redisChildren.length} 个进程：驱动 ${[...new Set(redisChildren.map((r) => r.driver))].join('/')}，ready ${[...new Set(redisChildren.map((r) => String(r.ready)))].join('/')}`,
  ],
  ['MEMORY_PHASE_SELECTS_MEMORY', mem.every((r) => r.driver === 'MemoryRateLimiter'), `不设变量那四个进程：${[...new Set(mem.map((r) => r.driver))].join('/')}`],
  ['SHARED_WINDOW_CAPPED', JSON.stringify(seqAllowed) === JSON.stringify([true, true, true, false]), `四个进程各一次的判定：${seqAllowed.join(' / ')}`],
  ['MEMORY_COUNTS_SEPARATELY', memAllowed.every((ok) => ok), `同一串请求换成进程内驱动：${memAllowed.join(' / ')}——全放行，所以上一句不是"这台机器没在限"`],
  ['BLOCKED_DECISION_CARRIES_RETRY_AFTER', (seq[3]?.decisions[0]?.retryAfterMs ?? 0) > 0 && (seq[3]?.decisions[0]?.retryAfterMs ?? 0) <= WINDOW_MS, `第四次的 retryAfterMs=${seq[3]?.decisions[0]?.retryAfterMs}（路由那一边靠它写 Retry-After）`],
  [
    'WINDOW_IN_REDIS_HAS_LIMIT_MEMBERS',
    seqMembers.length === SEQ_LIMIT && new Set(seqMembers).size === SEQ_LIMIT && new Set(seqMembers.map(pidOf)).size === SEQ_LIMIT,
    `Redis 里 ${seqMembers.length} 条成员、来自 ${new Set(seqMembers.map(pidOf)).size} 个不同进程：${seqMembers.join(' | ')}`,
  ],
  [
    'CROSS_PROCESS_ATOMIC_BURST',
    allowedOf(burstA, burstB) === BURST_LIMIT && burstMembers.length === BURST_LIMIT,
    `两个进程同时各 ${BURST_PER_PROCESS} 条并发：合计放行 ${allowedOf(burstA, burstB)} 条，集合里 ${burstMembers.length} 条`,
  ],
  [
    'BURST_MEMBERS_DISTINCT_ACROSS_AND_WITHIN',
    new Set(burstMembers).size === burstMembers.length && burstMembers.every((member) => burstPids.has(pidOf(member))) && multiplicity(burstMembers) >= 2,
    `${burstMembers.length} 条成员名两两不同、只出自那两个进程，而其中一个进程在同毫秒里留下 ≥2 条（${multiplicity(burstMembers)} 条）——跨进程与同进程两个维度都不同名`,
  ],
  [
    'NO_FALLBACK_ON_REDIS_PHASE',
    redisChildren.every((r) => r.fallbackCount === 0),
    `redis 段各进程的退回计数：${redisChildren.map((r) => r.fallbackCount).join('/')}——有数字涨就说明"共享窗口"那句话其实没生效`,
  ],
  [
    'REDIS_DOWN_STILL_GATES',
    dead.ready === false && dead.driver === 'RedisRateLimiter' && dead.fallbackCount === 5 && JSON.stringify(dead.decisions.map((d) => d.allowed)) === JSON.stringify([true, true, true, false, false]),
    `连不上的那趟：ready=${dead.ready}、${dead.fallbackCount} 次退回、判定 ${dead.decisions.map((d) => (d.allowed ? '放' : '挡')).join('')}（进程退出码 0，没抛）`,
  ],
  [
    'FALLBACK_SCOPE_IS_PER_PROCESS',
    deadPair.every((r) => r.decisions[0]?.allowed === true),
    `断线时两个进程各打一次、限额 1：${deadPair.map((r) => (r.decisions[0]?.allowed ? '放行' : '挡')).join(' / ')}——退回期间额度是这台各算各的，这是代价，写进判据而不是藏在注释里`,
  ],
];
for (const [name, ok, detail] of verdicts) console.log(`verdict ${name}: ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
const failed = verdicts.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`判据没过：${failed.join(', ')}｜产物在 ${WORK}`);
console.log(`跨进程限流通过：${seq.length + mem.length + 2 + deadPair.length} 个进程、线路 ${REDIS_URL}。`);
