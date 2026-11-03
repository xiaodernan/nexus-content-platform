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
 * 第三十四片加的那一组（`④′` 与 `⑤′`）问的是另一格：**桶键的上界是共享的还是每台的**。
 * 它与共享窗口同一条道理——上界若只数自己那台进程看到的键，多实例部署下实际是
 * `实例数 × 上界`，那句"这台驱动最多写 N 只键"就是假的。判据同样只读线路：
 * Redis 里到底有几只桶键、名册里到底有几条，由父进程自己数；孩子进程只报自己的退回计数。
 * 控制项是同一串请求换成一个大上界：那时三只键都建得出来、一次退回都没有——
 * 少了它，"第三只被拒"就分不清是上界生效还是"第三个进程天生被拒"。
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
/**
 * 与 `rateLimitRedis.ts` 的 `DEFAULT_KEY_PREFIX` 同一串——孩子进程走生产单例，前缀也是默认那个。
 * 只有上界那一组例外：它绕开门面直接构造，所以前缀由这里给（见 `CAP_PREFIX`）。
 */
const KEY_PREFIX = 'nexus:ratelimit:v1:';
/** 与 `rateLimitRedis.ts` 的 `BUCKET_INDEX_SUFFIX` 同一串。父进程不 import 那个模块（见 load() 上方），所以照抄。 */
const BUCKET_INDEX_SUFFIX = '__bucket_index__';

type RateLimitModule = typeof import('../apps/web/src/server/security/rateLimit');
type MemoryModule = typeof import('../apps/web/src/server/security/rateLimitMemory');
type RedisDriverModule = typeof import('../apps/web/src/server/security/rateLimitRedis');
type ObservabilityModule = typeof import('../apps/web/src/server/observability');

/**
 * 只有拿到 role 的孩子进程才走到这里。顶层一个 app 模块都不 import：那些模块属于 `apps/web`
 * 的模块图，父进程在仓库根下没有那份 tsconfig 也就解析不到别名，而父进程本来也不该拿到限流器的
 * 连接——它只负责 spawn、查线路与判定。
 *
 * `observability` 不是新依赖：`rateLimitRedis` 自己就 import 它（退回要记数），这一句只是把
 * 已经在模块图里的那份 `snapshot()` 拿到手上，用来分原因读退回账。
 */
async function load(): Promise<RateLimitModule & MemoryModule & RedisDriverModule & ObservabilityModule> {
  return {
    ...(await import('../apps/web/src/server/security/rateLimit')),
    ...(await import('../apps/web/src/server/security/rateLimitMemory')),
    ...(await import('../apps/web/src/server/security/rateLimitRedis')),
    ...(await import('../apps/web/src/server/observability')),
  };
}

/**
 * 这台进程的退回账，按原因分开。
 *
 * 为什么判据要读这一串数而不只读 `fallbackCount`：`OVER_CAP_STILL_GATES` 的**失败形状**里，
 * 最像成功的一种是"线路超时退回"——那只桶同样没建起来、同样走本机窗口、同样给出「放 放 挡」。
 * 只读行为的话，"名额用完交给本机判"和"Redis 答不上来交给本机判"长得一模一样，
 * 而这两句话在运维上是两回事（前者是容量到顶，后者是线路坏了）。原因标签把这两件事分开。
 */
function fallbackReasons(m: Awaited<ReturnType<typeof load>>): Record<string, number> {
  const out: Record<string, number> = {};
  const metric = m.snapshot().find((entry) => entry.name === 'nexus_rate_limit_driver_fallbacks_total');
  if (!metric || metric.kind !== 'counter') return out;
  for (const series of metric.series) {
    const reason = series.labels.reason ?? 'unknown';
    out[reason] = (out[reason] ?? 0) + series.value;
  }
  return out;
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

/**
 * 上界那一组的前缀。它**不住在** `KEY_PREFIX` 下面，理由是这一组要拿"这个前缀里到底有几只桶键"
 * 当判据：父进程 SCAN 整段前缀来数。若共用生产默认前缀，另一条会话的 e2e 窗口（也住那里）
 * 会被数进来，`桶键数 === 上界` 那句话就变成在跟别人的键比。
 */
const CAP_PREFIX = 'nexus:ratelimit:capdrill:';
/** 名册住在同一个前缀下，所以它自己也在那段 SCAN 里——数桶键时要把它剔掉。 */
const CAP_INDEX = `${CAP_PREFIX}${BUCKET_INDEX_SUFFIX}`;
/** 紧上界：三只新键只有两个名额，第三只该被拒。 */
const CAP_MAX_KEYS_TIGHT = 2;
/** 松上界：同样的三只键全建得出来。这是④′ 的对照。 */
const CAP_MAX_KEYS_ROOMY = 10;
/** 探测线路用的前缀：必须是 `CAP_PREFIX` 的**同级**而不是子段，否则它的桶会被数进判据里。 */
const CAP_SETTLE_PREFIX = 'nexus:ratelimit:capdrill-settle:';
const KEY_CAP_A = 'two-process-cap/a|ops-cap-a|192.0.2.20';
const KEY_CAP_B = 'two-process-cap/b|ops-cap-b|192.0.2.21';
const KEY_CAP_C = 'two-process-cap/c|ops-cap-c|192.0.2.22';

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
  /** 上界那一组才有：驱动从回执里读到的名册条数（权威的仍由父进程自己数）。 */
  tracked?: number | null;
  /**
   * 上界那一组才有：稳定之后、正式测量之前的 `fallbackCount`。
   * 判据钉的是**增量**而不是绝对 0——机器忙时启动期那笔超时退回是 ADR-0076 后果 3 明码标价过的
   * 有界退化，把它读成"上界没生效"就是让红长得没有道理（同一族道理见测试里 `settle()` 的注释）。
   */
  fallbackBaseline?: number;
  /**
   * 上界那一组才有：正式测量期间**按原因**的退回增量（只留非零的）。
   * `fallbackCount` 只说"退回了"，这一串才说"为什么退"——`over-cap` 与 `command-failed` 在
   * 行为上完全同形（桶没建、本机窗口判），只有这里分得开。
   */
  fallbackByReason?: Record<string, number>;
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

/**
 * 上界那一组的孩子进程。它**绕过门面**直接 `new RedisRateLimiter`，因为只有构造参数能给出
 * 一个小上界（`maxBucketKeys` 不是环境变量，这是刻意的，理由写在 `rateLimitRedis.ts` 那里）。
 * "选到哪个驱动"那句话已经由上面几组证过了，这一组只问"名额是不是跨进程数的"，
 * 所以这里绕开得清楚，并且在判据里写明它用的是直连。
 */
async function roleCap(prefix: string, maxKeys: number, key: string, limit: number, times: number, out: string): Promise<void> {
  const m = await load();
  const url = process.env[REDIS_URL_ENV]?.trim();
  if (!url) throw new Error('cap 这一组必须有 NEXUS_REDIS_URL');
  await waitForLine(m, url);
  const limiter = new m.RedisRateLimiter({ url, keyPrefix: prefix, maxBucketKeys: maxKeys });
  const ready = await limiter.ready;
  // 基线取"这条连接建好之后"的累计退回数，而不是绝对 0：启动期那一笔超时退回是 ADR-0076 后果 3
  // 明码标价过的有界退化，把它读成"上界生效了"才是错的。
  const fallbackBaseline = limiter.fallbackCount;
  const reasonsBefore = fallbackReasons(m);
  const decisions = await sequential(() => limiter.hit(key, limit, WINDOW_MS), times);
  const reasonsAfter = fallbackReasons(m);
  const fallbackByReason: Record<string, number> = {};
  for (const [reason, after] of Object.entries(reasonsAfter)) {
    const delta = after - (reasonsBefore[reason] ?? 0);
    if (delta > 0) fallbackByReason[reason] = delta;
  }
  const report: ProbeReport = {
    phase: 'redis',
    pid: process.pid,
    driver: limiter.constructor.name,
    ready,
    fallbackCount: limiter.fallbackCount,
    lastConnectionError: limiter.lastConnectionError,
    key,
    limit,
    tracked: limiter.bucketKeysTracked,
    fallbackBaseline,
    fallbackByReason,
    // 判定逐条留下：`OVER_CAP_STILL_GATES` 要看的是"被拒新建的那只照样挡不挡"。
    decisions: decisions.map((d): Decision => ({ allowed: d.allowed, count: d.count, retryAfterMs: d.retryAfterMs })),
  };
  write(out, report);
  limiter.dispose();
  process.exit(0);
}

const sleep = (ms: number): Promise<void> => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/**
 * 等到"这台 Redis 此刻能在 250ms 里回话"，再让正式测量开始。
 *
 * 为什么不能直接用被测量的那只 limiter 探测：这一组的判据是父进程 SCAN `CAP_PREFIX` 数出来的
 * **桶键条数**，探测键若住在同一个前缀下就被数进去（名额也被它占掉一格）。这里换一个同级前缀
 * ——名册按前缀各一条，所以既暖了同一条 Redis、同一个 250ms 预算，又不碰判据读的那张表。
 *
 * 为什么不能用 `ready` 代替：那一格只说连接，不说一次 `EVAL` 能不能在 250ms 里回来。
 * 这一组在机器忙的时候会红，而红的形状和"上界没生效"一模一样（`expected 3 to be 2`），
 * 所以先把线路这个变量钉住，剩下的红才只剩"驱动分歧"这一种读法。
 *
 * 探测用的上界是默认值：这一格要的是"命令能按时回来"，不该让名额本身把探测打成退回。
 */
async function waitForLine(m: Awaited<ReturnType<typeof load>>, url: string): Promise<void> {
  const probe = new m.RedisRateLimiter({ url, keyPrefix: CAP_SETTLE_PREFIX });
  try {
    await probe.ready;
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const before = probe.fallbackCount;
      await probe.hit(`capdrill-settle|p-${attempt}|127.0.0.1`, 1_000, WINDOW_MS);
      if (probe.fallbackCount === before) return;
      await sleep(250);
    }
    throw new Error(
      `cap 这一组没等到线路稳定（探测 20 次全退回，lastConnectionError=${probe.lastConnectionError ?? '无'}）。` +
        '这一格要的是"这台 Redis 此刻能在 250ms 里回话"：先去看机器负载与那个容器，别去看驱动。',
    );
  } finally {
    await probe.reset();
    probe.dispose();
  }
}

const ROLE = process.argv[2];
if (ROLE === 'probe') {
  const [, , , phase, key, limit, times, concurrent, out] = process.argv;
  await roleProbe(phase as Phase, key!, Number(limit), Number(times), concurrent === '1', out!);
  process.exit(0);
}
if (ROLE === 'cap') {
  const [, , , prefix, maxKeys, key, limit, times, out] = process.argv;
  await roleCap(prefix!, Number(maxKeys), key!, Number(limit), Number(times), out!);
  process.exit(0);
}

// —— 以下是父进程 ——

mkdirSync(WORK, { recursive: true });
for (const name of ['seq-1.json', 'seq-2.json', 'seq-3.json', 'seq-4.json', 'mem-1.json', 'mem-2.json', 'mem-3.json', 'mem-4.json', 'burst-a.json', 'burst-b.json', 'dead-1.json', 'dead-2.json', 'dead-3.json', 'cap-1.json', 'cap-2.json', 'cap-3.json', 'cap-4.json', 'cap-5.json', 'cap-6.json']) {
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

/**
 * 某个前缀下**真实存在**的桶键，按名字排好。名册那条要剔掉：判据问的是"有几只桶"，
 * 而名册是数桶的那张表，把它算进桶里就是自己数自己。
 *
 * 这一句是父进程自己 SCAN 的读数，不经过驱动、也不是孩子进程的自述——上界这一族判据的权威性
 * 全在这里：如果孩子说"我没建那只桶"而 Redis 里躺着那只桶，要信 Redis。
 */
async function keysUnderPrefix(prefix: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = '0';
  do {
    // SCAN 而不是 KEYS：这台 Redis 和实时总线共用，KEYS 是一次 O(N) 阻塞。
    const reply = (await wire.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)) as unknown;
    if (!Array.isArray(reply) || reply.length < 2) throw new Error(`scan 回执形状不认识：${JSON.stringify(reply)}`);
    const [next, keys] = reply as [string, string[]];
    cursor = next;
    found.push(...keys.filter((k) => !k.endsWith(BUCKET_INDEX_SUFFIX)));
  } while (cursor !== '0');
  return found.sort();
}

/** 清掉整个前缀（桶键 + 名册），并且确认真的清干净——上一轮残留的名册会把这一轮的第三只键挡掉。 */
async function wipePrefix(prefix: string): Promise<void> {
  const all: string[] = [];
  let cursor = '0';
  do {
    const reply = (await wire.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)) as unknown;
    const [next, keys] = reply as [string, string[]];
    cursor = next;
    all.push(...keys);
  } while (cursor !== '0');
  if (all.length > 0) await wire.unlink(...all);
  const left = await keysUnderPrefix(prefix);
  if (left.length > 0) throw new Error(`前缀还没清干净：${prefix} 里还有 ${left.join(' | ')}`);
  if ((await wire.exists(`${prefix}${BUCKET_INDEX_SUFFIX}`)) !== 0) throw new Error(`名册还没清干净：${prefix}${BUCKET_INDEX_SUFFIX}`);
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

/**
 * 上界那一组的孩子进程：一个进程、一只键、`times` 次顺序命中、给定一个 `maxBucketKeys`。
 * 走 `spawnSync` 而不是并发——这一组问的是"名额按什么顺序发给谁"，先后就是它的场景。
 */
function runCap(label: string, maxKeys: number, key: string, limit: number, times: number): ProbeReport {
  const done = spawnSync(
    process.execPath,
    ['--import', 'tsx', import.meta.filename, 'cap', CAP_PREFIX, String(maxKeys), key, String(limit), String(times), label],
    { cwd: resolve(ROOT, 'apps/web'), env: childEnv(REDIS_URL), encoding: 'utf8' },
  );
  const printed = `${done.stdout ?? ''}${done.stderr ?? ''}`;
  writeFileSync(resolve(WORK, `log-${label}`), printed);
  if (done.status !== 0) throw new Error(`${label} 非零退出（status=${done.status}）：\n${printed.slice(-1500)}`);
  const report = read<ProbeReport>(label);
  if (!report) throw new Error(`${label} 零退出却没写出报告`);
  const delta = report.fallbackCount - (report.fallbackBaseline ?? 0);
  console.log(
    `[${label} pid=${report.pid} 上界=${maxKeys} 名册=${report.tracked} 退回+${delta}] ${report.decisions.map((d) => (d.allowed ? '放行' : '挡')).join(' ')}`,
  );
  return report;
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

// ④′ 桶键的上界是跨进程数的（第三十四片）：三个进程各打一只**新**键，前两只建得出桶，
//     第三只该被拒（名额只有 2）。判据读线路：父进程自己 SCAN 那个前缀，看里面真的只有两只键。
//     第三个进程随后连打同一只被拒的键三次（限额 2）⇒ 本机窗口给出「放 放 挡」：
//     被拒新建不等于免检，这一句才是那一格的取向。
//     这一组绕开门面直连构造（只有构造参数给得出小上界），所以"用的是哪台 Redis、
//     有没有真的在往返"由 `ready` 与退回原因那两格钉住，而不是由门面那几组代它签字。
await wipePrefix(CAP_SETTLE_PREFIX);
await wipePrefix(CAP_PREFIX);
const capFull = [
  runCap('cap-1.json', CAP_MAX_KEYS_TIGHT, KEY_CAP_A, 5, 1),
  runCap('cap-2.json', CAP_MAX_KEYS_TIGHT, KEY_CAP_B, 5, 1),
  runCap('cap-3.json', CAP_MAX_KEYS_TIGHT, KEY_CAP_C, 2, 3),
];
const capBuckets = await keysUnderPrefix(CAP_PREFIX);
const capIndexSize = await wire.zcard(CAP_INDEX);
// 被拒的那只键必须**不在** Redis 里（它在的是那台进程的窗口）
const capThirdBuilt = capBuckets.includes(`${CAP_PREFIX}${KEY_CAP_C}`);

// ⑤′ 控制：同一串请求换成宽上界 ⇒ 三只键都建得出来、一次退回都没有。
//     少了这一句，④′ 那句"第三只被拒"就分不清是上界生效，还是"第三个进程天生被拒"。
await wipePrefix(CAP_PREFIX);
const capRoomy = [
  runCap('cap-4.json', CAP_MAX_KEYS_ROOMY, KEY_CAP_A, 5, 1),
  runCap('cap-5.json', CAP_MAX_KEYS_ROOMY, KEY_CAP_B, 5, 1),
  runCap('cap-6.json', CAP_MAX_KEYS_ROOMY, KEY_CAP_C, 5, 1),
];
const capRoomyBuckets = await keysUnderPrefix(CAP_PREFIX);
await wipePrefix(CAP_PREFIX);

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

/** 测量期间的退回增量（绝对数会把启动期那笔有界退化算进来）。 */
const capDelta = (r: ProbeReport): number => r.fallbackCount - (r.fallbackBaseline ?? 0);
const capReasons = (r: ProbeReport): string => JSON.stringify(r.fallbackByReason ?? {});
const capThird = capFull[2]!;
const capFirst = capFull[0]!;
const capSecond = capFull[1]!;
const capAllowedSeq = (r: ProbeReport): string => r.decisions.map((d) => (d.allowed ? '放' : '挡')).join('');

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
  [
    'CEILING_IS_SHARED_ACROSS_PROCESSES',
    capBuckets.length === CAP_MAX_KEYS_TIGHT && capDelta(capFirst) === 0 && capDelta(capSecond) === 0,
    `三个进程各要一只新桶、上界 ${CAP_MAX_KEYS_TIGHT}：Redis 里实际 ${capBuckets.length} 只桶键（${capBuckets.map((k) => k.slice(CAP_PREFIX.length)).join(' | ')}）；前两只的退回增量 +${capDelta(capFirst)} / +${capDelta(capSecond)}（非 0 就是它们没写在 Redis 上，那"只有两只"是线路坏了不是名额满了）`,
  ],
  [
    'OVER_CAP_REFUSAL_IS_A_CEILING_NOT_A_BROKEN_LINE',
    capThird.ready === true && !capThirdBuilt && (capThird.fallbackByReason?.['over-cap'] ?? 0) === capThird.decisions.length && capDelta(capThird) === capThird.decisions.length && !('command-failed' in (capThird.fallbackByReason ?? {})) && !('bad-reply' in (capThird.fallbackByReason ?? {})),
    `第三只键 ${capThird.decisions.length} 次判定：ready=${capThird.ready}、键没建=${!capThirdBuilt}、退回原因 ${capReasons(capThird)}（只有 over-cap 才算数；出现 command-failed 就是线路问题，不是名额）`,
  ],
  [
    'OVER_CAP_STILL_GATES',
    capThird.decisions.filter((d) => d.allowed).length === capThird.limit && capThird.decisions[capThird.decisions.length - 1]?.allowed === false,
    `被拒新建的那只键连打 ${capThird.decisions.length} 次（限额 ${capThird.limit}）给出「${capAllowedSeq(capThird)}」——放行数恰好是它自己的限额，说明本机窗口接住了判定；这句才是"拒绝新建"的取向（不是免检）`,
  ],
  [
    'CEILING_INDEX_MATCHES_BUCKET_KEYS',
    capIndexSize === capBuckets.length && capThird.tracked === capIndexSize,
    `名册 ${capIndexSize} 条、真实桶键 ${capBuckets.length} 只、被拒那台自己读到的名册 ${capThird.tracked} 条——三个数必须是一个数：名额数的是这条驱动真写下的键，不是账面上虚增的条目`,
  ],
  [
    'CEILING_NOT_TRIGGERED_WITH_ROOMY',
    capRoomy.every((r) => r.ready === true && capDelta(r) === 0 && r.decisions[0]?.allowed === true) && capRoomyBuckets.length === capRoomy.length,
    `对照：同一串请求换成上界 ${CAP_MAX_KEYS_ROOMY} ⇒ Redis 里 ${capRoomyBuckets.length} 只桶键、退回 ${capRoomy.map((r) => `+${capDelta(r)}`).join('/')}、判定 ${capRoomy.map(capAllowedSeq).join('')}——少了这句，上面"第三只被拒"分不清是上界生效还是第三个进程天生被拒`,
  ],
];
for (const [name, ok, detail] of verdicts) console.log(`verdict ${name}: ${ok ? 'PASS' : 'FAIL'} — ${detail}`);
const failed = verdicts.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`判据没过：${failed.join(', ')}｜产物在 ${WORK}`);
console.log(
  `跨进程限流通过：${seq.length + mem.length + 2 + deadPair.length + capFull.length + capRoomy.length} 个进程、线路 ${REDIS_URL}。`,
);
