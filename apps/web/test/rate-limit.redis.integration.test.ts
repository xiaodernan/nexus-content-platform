import { afterEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { snapshot } from '@/server/observability';
import type { RateLimitDecision, RateLimiter } from '@/server/security/rateLimit';
import { getRateLimiter, setRateLimiter } from '@/server/security/rateLimit';
import { MemoryRateLimiter } from '@/server/security/rateLimitMemory';
import { DEFAULT_KEY_PREFIX, REDIS_URL_ENV, RedisRateLimiter } from '@/server/security/rateLimitRedis';

/**
 * §SEC 第三十二片的收据（`docs/adr/0076-rate-limit-redis-sliding-window.md`）：限流闸换成
 * Redis 驱动之后，文档里那句"6 次/10 分钟/审核员"是不是
 * 还和它写的同一句话。打**真 Redis**（本机 `nexus-redis` 容器，56379），不 mock 线路——
 * 这一格唯一要证的正是"两只桶能不能经由一台共同的 Redis 变成一只"，
 * mock 掉就等于把要测的东西测了个空（与 `realtime.redis.integration.test.ts` 同一条取舍）。
 *
 * 每条用例都在问一个行为问题，并且写成**只有对的那个实现能过**的形状：
 * 一个断言如果同时能被"退回进程内""成员名重复""没有原子性""把陌生回执读成放行"满足，
 * 它就不是门。所以每一组都配一个反证或对照——进程内驱动那份对照尤其要紧，
 * 因为"共享窗口"和"每台各数各的"在单实例测试里长得一模一样。
 *
 * 前缀每次跑换一个（`nexus:ratelimit:test:<pid>:<启动时刻>:`），理由写在驱动 `reset()` 的注释里：
 * 同一台 Redis 上还挂着并行会话的 e2e 窗口，把它们 20 次/小时的额度抹掉，
 * 会让**那一轮**的"闸挡住了"变成"闸没挡"——读数看着一样，原因完全不同。
 */

const REDIS_URL = process.env[REDIS_URL_ENV]?.trim() || 'redis://127.0.0.1:56379';
/** 没人监听的端口：这一格要的正是"连不上"，所以不能借用上面那个真地址。 */
const DEAD_URL = 'redis://127.0.0.1:56399';
const RUN_PREFIX = `nexus:ratelimit:test:${process.pid}:${Date.now().toString(36)}:`;
/** 故意**不是** `RUN_PREFIX` 的子串：这一格要证的正是"我的 SCAN 扫不到别人的命名空间"。 */
const FOREIGN_PREFIX = `nexus:ratelimit:foreign:${process.pid}:`;

/**
 * `retryAfterMs` 的容差。两个驱动各用各的时钟（进程内用主机 `Date.now()`，Redis 用服务端
 * `TIME`），两边的差值只是"两次 await 之间的调度间隙"，不是逻辑分歧。50ms 覆盖本机实测
 * （2026-10-31 那一跑里最大 3ms），又足以挡住"差了整整一个窗口"那种真错——那一档是 1000ms 起。
 */
const RETRY_TOLERANCE_MS = 50;

const opened: RedisRateLimiter[] = [];

function makeLimiter(options: Partial<ConstructorParameters<typeof RedisRateLimiter>[0]> = {}): RedisRateLimiter {
  const limiter = new RedisRateLimiter({ url: REDIS_URL, keyPrefix: RUN_PREFIX, ...options });
  opened.push(limiter);
  return limiter;
}

let raw: Redis | null = null;
/** 不经驱动、直接查那台 Redis：用来回答"集合里到底有几条"这类驱动自己说了不算的问题。 */
function redisRaw(): Redis {
  raw ??= new Redis(REDIS_URL);
  return raw;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 把一条序列喂给某个驱动，逐次记下判定——对照表比一串 `if` 好读，也好逐格比。 */
async function drive(limiter: RateLimiter, key: string, limit: number, windowMs: number, times: number): Promise<RateLimitDecision[]> {
  const log: RateLimitDecision[] = [];
  for (let i = 0; i < times; i += 1) log.push(await limiter.hit(key, limit, windowMs));
  return log;
}

/** 某个前缀下的键名。用来证明"我没清别人的"与"我清的确实只有我的"。 */
async function keysUnder(prefix: string): Promise<string[]> {
  const client = redisRaw();
  const found: string[] = [];
  let cursor = '0';
  do {
    const reply = (await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)) as unknown;
    if (!Array.isArray(reply) || reply.length < 2) throw new Error(`scan 回执形状不认识：${JSON.stringify(reply)}`);
    const [next, keys] = reply as [string, string[]];
    cursor = next;
    found.push(...keys);
  } while (cursor !== '0');
  return found.sort();
}

/**
 * 某个指标在某个标签下的累计值。这一格要的不是"驱动自己说退回了"，而是
 * **运维读得到的那串数真的在动**——`fallbackCount` 与 `nexus_rate_limit_driver_fallbacks_total`
 * 是同一句话的两种写法，只钉前者就等于把"看得见地坏"钉在一个只有测试能读到的字段上。
 */
function counterValue(name: string, labels: Record<string, string>): number {
  const metric = snapshot().find((m) => m.name === name);
  if (!metric || metric.kind !== 'counter') return 0;
  return metric.series
    .filter((series) => Object.entries(labels).every(([key, value]) => series.labels[key] === value))
    .reduce((sum, series) => sum + series.value, 0);
}

const originalLimiter = getRateLimiter();
const originalEnv = process.env[REDIS_URL_ENV];

afterEach(async () => {
  for (const limiter of opened) limiter.dispose();
  opened.length = 0;
  const client = redisRaw();
  for (const prefix of [RUN_PREFIX, FOREIGN_PREFIX]) {
    const keys = await keysUnder(prefix);
    if (keys.length > 0) await client.unlink(...keys);
  }
  client.disconnect();
  raw = null;
  // 单例挂在 globalThis：这一片换过它就得换回来，否则下一个文件拿到的是我造的这一只。
  setRateLimiter(originalLimiter);
  if (originalEnv === undefined) delete process.env[REDIS_URL_ENV];
  else process.env[REDIS_URL_ENV] = originalEnv;
});

describe('两个驱动逐格同答案（parity）', () => {
  it('limit=1/3/5 三档：allowed 与 count 每一格相同，retryAfterMs 在容差内', async () => {
    const cases = [
      { limit: 1, windowMs: 60_000, times: 3 },
      { limit: 3, windowMs: 60_000, times: 5 },
      { limit: 5, windowMs: 60_000, times: 8 },
    ];
    for (const [i, testCase] of cases.entries()) {
      const key = `parity/route|u-${i}|127.0.0.1`;
      const memory = new MemoryRateLimiter();
      const redis = makeLimiter();
      await expect(redis.ready).resolves.toBe(true);
      const fromMemory = await drive(memory, key, testCase.limit, testCase.windowMs, testCase.times);
      const fromRedis = await drive(redis, key, testCase.limit, testCase.windowMs, testCase.times);
      // 整表比对而不是逐条 `expect`：换驱动之后"哪一格不一样"必须一眼读出来
      expect(fromMemory.map((d) => [d.allowed, d.count]), `第 ${i} 档（limit=${testCase.limit}）`).toEqual(
        fromRedis.map((d) => [d.allowed, d.count]),
      );
      fromMemory.forEach((decision, step) => {
        expect(
          Math.abs(decision.retryAfterMs - (fromRedis[step]?.retryAfterMs ?? 0)),
          `第 ${i} 档第 ${step} 步的 retryAfterMs`,
        ).toBeLessThanOrEqual(RETRY_TOLERANCE_MS);
      });
      expect(redis.fallbackCount).toBe(0);
    }
  });

  it('窗口滑过之后两边都重新放行（同一条边界，不是两套边界）', async () => {
    const windowMs = 1_200;
    const key = 'parity/slide|u|127.0.0.1';
    const memory = new MemoryRateLimiter();
    const redis = makeLimiter();
    await expect(redis.ready).resolves.toBe(true);
    expect((await memory.hit(key, 1, windowMs)).allowed).toBe(true);
    expect((await redis.hit(key, 1, windowMs)).allowed).toBe(true);
    expect((await memory.hit(key, 1, windowMs)).allowed).toBe(false);
    expect((await redis.hit(key, 1, windowMs)).allowed).toBe(false);
    await sleep(windowMs + 120);
    expect((await memory.hit(key, 1, windowMs)).allowed).toBe(true);
    expect((await redis.hit(key, 1, windowMs)).allowed).toBe(true);
  });
});

describe('Redis 驱动：多实例一起数同一份窗口', () => {
  it('两个实例合计恰好 limit 次，不是 2×limit', async () => {
    const alpha = makeLimiter({ origin: 'alpha' });
    const beta = makeLimiter({ origin: 'beta' });
    await expect(alpha.ready).resolves.toBe(true);
    await expect(beta.ready).resolves.toBe(true);
    const key = 'admin/guests/reclaim|reviewer-1|10.0.0.1';
    const limit = 3;
    const allowedBefore = counterValue('nexus_rate_limit_decisions_total', { gate: 'admin/guests/reclaim', allowed: 'true' });
    const deniedBefore = counterValue('nexus_rate_limit_decisions_total', { gate: 'admin/guests/reclaim', allowed: 'false' });
    // 一台打 2 次、另一台打 1 次，全放行；第 4 次不管从哪台来都必须被挡。
    expect((await alpha.hit(key, limit, 60_000)).allowed).toBe(true);
    expect((await alpha.hit(key, limit, 60_000)).allowed).toBe(true);
    expect((await beta.hit(key, limit, 60_000)).allowed).toBe(true);
    const fourth = await beta.hit(key, limit, 60_000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.count).toBe(limit);
    // 权威读数是 Redis 里那条集合，不是驱动的自述
    expect(await redisRaw().zcard(`${RUN_PREFIX}${key}`)).toBe(limit);
    expect(alpha.fallbackCount).toBe(0);
    expect(beta.fallbackCount).toBe(0);
    // 换驱动之后那张图还是同一张：标签只有闸名与放行/拒绝，身份与 IP 不许进标签
    expect(counterValue('nexus_rate_limit_decisions_total', { gate: 'admin/guests/reclaim', allowed: 'true' }) - allowedBefore).toBe(3);
    expect(counterValue('nexus_rate_limit_decisions_total', { gate: 'admin/guests/reclaim', allowed: 'false' }) - deniedBefore).toBe(1);
  });

  it('对照：同样两个"实例"换成进程内驱动，拿到的是 2×limit', async () => {
    // 上一条的反证。没有它，上一条在单实例下也能绿：
    // 两只各自数各自的 `Map` 时，同样这六次请求会全部放行。
    const alpha = new MemoryRateLimiter();
    const beta = new MemoryRateLimiter();
    const key = 'admin/guests/reclaim|reviewer-1|10.0.0.1';
    const limit = 3;
    const allowed: boolean[] = [];
    for (let i = 0; i < limit; i += 1) allowed.push((await alpha.hit(key, limit, 60_000)).allowed);
    for (let i = 0; i < limit; i += 1) allowed.push((await beta.hit(key, limit, 60_000)).allowed);
    expect(allowed.filter((ok) => ok)).toHaveLength(limit * 2);
  });

  it('同毫秒并发突发：恰好放行 limit 条（原子性那一格）', async () => {
    const limiter = makeLimiter();
    await expect(limiter.ready).resolves.toBe(true);
    const key = 'auth/login|someone|127.0.0.1';
    const limit = 4;
    // 一次把 10 条发出去：`ZCARD` 与 `ZADD` 之间只要有空隙，两个并发就能同时读到"还差一名"。
    const burst = await Promise.all(Array.from({ length: 10 }, () => limiter.hit(key, limit, 60_000)));
    expect(burst.filter((d) => d.allowed)).toHaveLength(limit);
    expect(await redisRaw().zcard(`${RUN_PREFIX}${key}`)).toBe(limit);
    expect(limiter.fallbackCount).toBe(0);
  });

  it('成员名每条都不同：同毫秒两次命中在集合里占两格', async () => {
    const limiter = makeLimiter({ origin: 'same-origin' });
    await expect(limiter.ready).resolves.toBe(true);
    const key = 'projects/create|u|127.0.0.1';
    expect((await limiter.hit(key, 10, 60_000)).count).toBe(1);
    expect((await limiter.hit(key, 10, 60_000)).count).toBe(2);
    // 反证写在这里：成员名若取 `Date.now()`，同一毫秒里的两条会被 ZADD 合成一格，
    // 于是 count 恒为 1、集合里只有一条。探针实测过那个形状（五条全放行，`[1,1,1,1,1]`）。
    // 另一路会话的在飞文件：ioredis 的 zrange 重载里 stop 只接受 string|Buffer，
    // 传 -1 过不了 typecheck（发给 Redis 的字节不变）。运行时形状由下面三条断言守着。
    const members = await redisRaw().zrange(`${RUN_PREFIX}${key}`, 0, '-1');
    expect(members).toHaveLength(2);
    expect(new Set(members).size).toBe(2);
    for (const member of members) expect(member.startsWith('same-origin:')).toBe(true);
  });

  it('被挡下的那一次不进窗口（否则限流成了加速自锁）', async () => {
    const limiter = makeLimiter();
    await expect(limiter.ready).resolves.toBe(true);
    const key = 'interact|u|127.0.0.1';
    expect((await limiter.hit(key, 1, 1_200)).allowed).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.hit(key, 1, 1_200)).allowed).toBe(false);
      await sleep(100);
    }
    // 直接数集合：撞上限的那三次不该留下成员。
    expect(await redisRaw().zcard(`${RUN_PREFIX}${key}`)).toBe(1);
    // 再等一等，第一条到期，名额就该腾出来——被挡的那次若进了窗口，这里还会是挡。
    await sleep(1_000);
    expect((await limiter.hit(key, 1, 1_200)).allowed).toBe(true);
  });

  it('按 retryAfterMs 等完之后真的能过（那句话不是摆设）', async () => {
    const limiter = makeLimiter();
    await expect(limiter.ready).resolves.toBe(true);
    const key = 'auth/register|anon|127.0.0.1';
    await drive(limiter, key, 2, 1_000, 2);
    const blocked = await limiter.hit(key, 2, 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(1_000);
    await sleep(blocked.retryAfterMs + 30);
    expect((await limiter.hit(key, 2, 1_000)).allowed).toBe(true);
  });
});

describe('退回（Redis 那半边不行时闸还在挡）', () => {
  it('键上挂着错误类型 ⇒ 当场退回、不抛、限额仍然生效', async () => {
    const limiter = makeLimiter();
    await expect(limiter.ready).resolves.toBe(true);
    const key = 'wrong/type|u|127.0.0.1';
    // 在真 Redis 上把桶键占成字符串：`ZREMRANGEBYSCORE` 报 WRONGTYPE，脚本当场失败。
    // 挑这个造法而不是 mock，是因为它给的是**真实的报错回执**，不是我编的一个形状。
    await redisRaw().set(`${RUN_PREFIX}${key}`, 'not-a-zset');
    const fallbacksBefore = counterValue('nexus_rate_limit_driver_fallbacks_total', { reason: 'command-failed' });
    const log = await drive(limiter, key, 2, 60_000, 4);
    expect(log.map((d) => d.allowed)).toEqual([true, true, false, false]);
    // 退回期间额度是这台各算各的：4 次判定 = 4 次记账，一次不落
    expect(limiter.fallbackCount).toBe(4);
    // 同一句话必须落在运维读得到的那串数上，而不只在这个字段里
    expect(counterValue('nexus_rate_limit_driver_fallbacks_total', { reason: 'command-failed' }) - fallbacksBefore).toBe(4);
  });

  it('连不上的 Redis ⇒ ready=false、hit 不抛、仍挡住、计数在涨', async () => {
    const limiter = makeLimiter({ url: DEAD_URL, keyPrefix: `${RUN_PREFIX}dead:` });
    await expect(limiter.ready).resolves.toBe(false);
    expect(typeof limiter.lastConnectionError).toBe('string');
    const log = await drive(limiter, 'dead/url|u|127.0.0.1', 3, 60_000, 5);
    // 这一条是这一版最要紧的取向：闸不能因为后端没了就变成没闸，也不能把业务拖死。
    expect(log.map((d) => d.allowed)).toEqual([true, true, true, false, false]);
    expect(limiter.fallbackCount).toBe(5);
  });

  it('正常路径下 fallbackCount 一直是 0（陌生回执不许被读成放行）', async () => {
    // 这一格是 `bad-reply` 那条分支的门：把 Lua 的回执改成不是 `[0|1, n, n]` 那个形状
    // （臂 A-D：`return 'nope'`），上面那几条共享窗口的用例立刻红——退回之后 alpha/beta
    // 各数各的，而这里会看见 fallbackCount 涨起来。分支本身没有专门的假服务器，如实记在这里。
    const limiter = makeLimiter();
    await expect(limiter.ready).resolves.toBe(true);
    await drive(limiter, 'healthy/path|u|127.0.0.1', 2, 60_000, 3);
    expect(limiter.fallbackCount).toBe(0);
    expect(limiter.lastConnectionError).toBeNull();
  });
});

describe('门面按环境变量选驱动', () => {
  it('设了 NEXUS_REDIS_URL 用 Redis 那份，没设用进程内那份', async () => {
    setRateLimiter(undefined);
    process.env[REDIS_URL_ENV] = REDIS_URL;
    const redisDriven = getRateLimiter();
    expect(redisDriven).toBeInstanceOf(RedisRateLimiter);
    if (redisDriven instanceof RedisRateLimiter) {
      expect(redisDriven.keyPrefix).toBe(DEFAULT_KEY_PREFIX);
      redisDriven.dispose();
    }
    setRateLimiter(undefined);
    delete process.env[REDIS_URL_ENV];
    expect(getRateLimiter()).toBeInstanceOf(MemoryRateLimiter);
  });
});

describe('reset 的爆炸半径', () => {
  it('reset(key) 只清那一只桶', async () => {
    const limiter = makeLimiter();
    await expect(limiter.ready).resolves.toBe(true);
    const kept = 'reset/kept|u|127.0.0.1';
    const wiped = 'reset/wiped|u|127.0.0.1';
    await limiter.hit(kept, 5, 60_000);
    await limiter.hit(wiped, 5, 60_000);
    await limiter.reset(wiped);
    expect(await redisRaw().exists(`${RUN_PREFIX}${kept}`)).toBe(1);
    expect(await redisRaw().exists(`${RUN_PREFIX}${wiped}`)).toBe(0);
    expect(limiter.fallbackCount).toBe(0);
  });

  it('reset() 只清自己的前缀，别人前缀下的键一条不少', async () => {
    // 生产里 `reset()` 是"跨实例一起归零"，爆炸半径等于所有实例的额度。
    // 这一格保证它至少不越出前缀：并行会话的 e2e 就住在另一个前缀下面。
    const mine = makeLimiter();
    const theirs = makeLimiter({ keyPrefix: FOREIGN_PREFIX });
    await expect(mine.ready).resolves.toBe(true);
    await mine.hit('reset/mine|u|127.0.0.1', 5, 60_000);
    await theirs.hit('reset/theirs|u|127.0.0.1', 5, 60_000);
    const otherKeys = await keysUnder(FOREIGN_PREFIX);
    expect(otherKeys).toEqual([`${FOREIGN_PREFIX}reset/theirs|u|127.0.0.1`]);
    await mine.reset();
    expect(await keysUnder(RUN_PREFIX)).toEqual([]);
    expect(await keysUnder(FOREIGN_PREFIX)).toEqual(otherKeys);
    expect(mine.fallbackCount).toBe(0);
  });

  it('Redis 断线时 reset 不抛，而进程内那一份照样被清', async () => {
    const limiter = makeLimiter({ url: DEAD_URL, keyPrefix: `${RUN_PREFIX}dead-reset:` });
    const key = 'reset/dead|u|127.0.0.1';
    // 连不上时判定走进程内那一份，于是"清桶"至少得把那一清干净——否则上一轮的窗口会挡下一轮。
    await drive(limiter, key, 1, 60_000, 2);
    expect(limiter.fallbackCount).toBe(2);
    await expect(limiter.reset(key)).resolves.toBeUndefined();
    const afterReset = await limiter.hit(key, 1, 60_000);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.count).toBe(1);
  });
});

describe('键的寿命', () => {
  it('PEXPIRE 让长时间没人打的键自己消失（不赖在库里）', async () => {
    const limiter = makeLimiter();
    await expect(limiter.ready).resolves.toBe(true);
    const key = 'ttl/check|u|127.0.0.1';
    await limiter.hit(key, 5, 900);
    const ttl = await redisRaw().pttl(`${RUN_PREFIX}${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(900);
    await sleep(1_100);
    expect(await redisRaw().exists(`${RUN_PREFIX}${key}`)).toBe(0);
  });
});
