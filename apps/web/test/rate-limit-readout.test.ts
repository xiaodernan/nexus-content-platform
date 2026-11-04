import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MAX_BUCKETS, MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { DEFAULT_KEY_PREFIX, DEFAULT_MAX_BUCKET_KEYS, REDIS_URL_ENV, RedisRateLimiter } from '../src/server/security/rateLimitRedis';
import { getRateLimiter, setRateLimiter, type RateLimiter, type RateLimiterReadout } from '../src/server/security/rateLimit';

/**
 * §SEC 第三十五片：驱动自报现场（`/admin/rate-limit` 端的那一份）的形状与来源。
 *
 * 这一片新增的功能很少，新增的**口径**很多，所以用例逐条钉那些能被读反的地方：
 * - 三个"不适用"必须是 `null` / `'na'`，不能被抹成 0 或 `'up'`——那三种读法分别是
 *   "没退过"、"前缀是空的 Redis"、"线路断了"，每一句都是假的；
 * - `windowScope` 与 `driver` 成对：把进程内说成 shared 就是那句"每台各数各的"被抹掉的方式；
 * - `bucketsTracked` 两个驱动同一名字但**不同来源**：进程内是那张表自己（权威），
 *   Redis 是这台最近一次判定带回的名册条数（会旧，权威是那台的 `ZCARD`）。
 *
 * 这里的 Redis 驱动**不打网络**：构造一条连不上的线路是可以的（`hit` 从不等它），
 * 而 `describe()` 也是同步的——所以这一族是纯单测，线路真的接上时的读数在
 * `rate-limit.redis.integration.test.ts` 那一族里钉。
 */

function urlOfNonexistentRedis(): string {
  // 端口 1 且不可路由：构造立刻返回，`status` 停在 pending 一族，不占线程。
  return 'redis://127.0.0.1:1';
}

describe('进程内驱动的自报', () => {
  it('每一格都是"这台进程的内存"那一侧的说法，三个不适用不被抹平', () => {
    const limiter = new MemoryRateLimiter({ maxBuckets: 7 });
    const readout = limiter.describe();
    expect(readout).toEqual({
      driver: 'in-process',
      windowScope: 'this-process',
      bucketCeiling: 7,
      bucketsTracked: 0,
      keyPrefix: null,
      wire: 'na',
      fallbackCount: null,
      lastConnectionError: null,
    } satisfies RateLimiterReadout);
  });

  it('默认上界报的是这个驱动自己的那个数，不是另一个驱动的', () => {
    expect(new MemoryRateLimiter().describe().bucketCeiling).toBe(DEFAULT_MAX_BUCKETS);
    // 这一句看着像废话，但它钉的是"门面那两行日志里的数字与界面里的数字来自同一个常量"：
    // 两个驱动各有一个 50 000，抄错来源时界面会说出没装的那个上界。
    expect(DEFAULT_MAX_BUCKETS).toBe(DEFAULT_MAX_BUCKET_KEYS);
  });

  it('bucketsTracked 跟着这张表走：建一只桶它就 +1，reset 之后回 0', async () => {
    const limiter = new MemoryRateLimiter();
    expect(limiter.describe().bucketsTracked).toBe(0);
    await limiter.hit('readout/a|u|10.0.0.1', 5, 60_000);
    await limiter.hit('readout/b|u|10.0.0.2', 5, 60_000);
    expect(limiter.describe().bucketsTracked).toBe(2);
    // 与那个诊断 getter 同一个来源——两处报不一样的数就是有一处不是表自己
    expect(limiter.describe().bucketsTracked).toBe(limiter.bucketCount);
    await limiter.reset('readout/a|u|10.0.0.1');
    expect(limiter.describe().bucketsTracked).toBe(1);
    await limiter.reset();
    expect(limiter.describe().bucketsTracked).toBe(0);
  });

  it('洪水把表压到上界时，报的是上界而不是表长的某种近似', async () => {
    const limiter = new MemoryRateLimiter({ maxBuckets: 3, sweepEveryHits: 1 });
    for (let i = 0; i < 20; i += 1) await limiter.hit(`readout-flood/k${i}|u|10.0.0.1`, 2, 60_000);
    const readout = limiter.describe();
    expect(readout.bucketsTracked).toBeLessThanOrEqual(readout.bucketCeiling);
    expect(readout.bucketsTracked).toBe(3);
  });
});

describe('Redis 驱动的自报（不依赖线路）', () => {
  let limiter: RedisRateLimiter | undefined;

  afterEach(() => {
    limiter?.dispose();
    limiter = undefined;
  });

  it('共享窗口那句、键前缀与上界都来自构造参数，而不是常量猜测', () => {
    limiter = new RedisRateLimiter({ url: urlOfNonexistentRedis(), keyPrefix: 'readout:v1:', maxBucketKeys: 11 });
    const readout = limiter.describe();
    expect(readout.driver).toBe('redis');
    expect(readout.windowScope).toBe('shared-across-instances');
    expect(readout.keyPrefix).toBe('readout:v1:');
    expect(readout.bucketCeiling).toBe(11);
    expect(readout.bucketsTracked).toBe(0);
    // 断线时 `fallbackCount` 是 0 而不是 null：这一格报的是"这台退过几次"，
    // 而"这台根本不该退"（进程内）与"还没退过"（Redis 刚起来）是两句话，不能共用一个 null。
    expect(readout.fallbackCount).toBe(0);
  });

  it('线路没接上时报 down/pending，绝不报 up', () => {
    limiter = new RedisRateLimiter({ url: urlOfNonexistentRedis() });
    expect(['down', 'pending']).toContain(limiter.describe().wire);
    // 上限的那一句：这一族里 wire 永远不该是 'up'（线路是端口 1）。
    expect(limiter.describe().wire).not.toBe('up');
  });

  it('退回计数涨之后，自报的那个数跟着涨（诊断不是某个静态属性）', async () => {
    limiter = new RedisRateLimiter({ url: urlOfNonexistentRedis() });
    const before = limiter.describe().fallbackCount;
    await limiter.hit('readout-fallback/a|u|10.0.0.1', 2, 60_000);
    await limiter.hit('readout-fallback/a|u|10.0.0.1', 2, 60_000);
    const after = limiter.describe().fallbackCount;
    expect(after).not.toBeNull();
    expect((after ?? 0) - (before ?? 0)).toBeGreaterThan(0);
    expect(after).toBe(limiter.fallbackCount);
  });

  it('dispose 之后绝不谎报 up：断线的落定是异步的，这一格钉的是方向不是快慢', () => {
    limiter = new RedisRateLimiter({ url: urlOfNonexistentRedis() });
    limiter.dispose();
    // 不在这里断言 `'down'`：ioredis 的 `disconnect()` 对一条**从没连上过**的线路不会同步把
    // `status` 推到 `end`（它还在重试那一族里），而 `'down'` 那一档真出现的形状是
    // "连上过、再断开"——那一条要真线路才造得出来，见证在集成用例那一族（`线路断掉之后` 那条）。
    expect(limiter.describe().wire).not.toBe('up');
    expect(['pending', 'down']).toContain(limiter.describe().wire);
  });

  it('默认装上的那一份报的是两个默认常量', () => {
    limiter = new RedisRateLimiter({ url: urlOfNonexistentRedis() });
    const readout = limiter.describe();
    expect(readout.keyPrefix).toBe(DEFAULT_KEY_PREFIX);
    expect(readout.bucketCeiling).toBe(DEFAULT_MAX_BUCKET_KEYS);
  });
});

describe('门面端出的就是单例那份现场', () => {
  afterEach(() => setRateLimiter(undefined));

  it('换掉单例，回执跟着换（诊断页读的不是某个类的静态属性）', () => {
    const fake: RateLimiter = {
      hit: async () => ({ allowed: true, count: 1, retryAfterMs: 0 }),
      reset: async () => undefined,
      describe: () => ({
        driver: 'redis',
        windowScope: 'shared-across-instances',
        bucketCeiling: 3,
        bucketsTracked: 2,
        keyPrefix: '被换上的那台:',
        wire: 'down',
        fallbackCount: 9,
        lastConnectionError: '故意留给用例的那一句',
      }),
    };
    setRateLimiter(fake);
    expect(getRateLimiter()).toBe(fake);
    const readout = getRateLimiter().describe();
    expect(readout.keyPrefix).toBe('被换上的那台:');
    expect(readout.wire).toBe('down');
    expect(readout.fallbackCount).toBe(9);
  });

  it('不设变量时门面装的是进程内那一份，而部署那句读的也是同一个环境变量', () => {
    const previous = process.env[REDIS_URL_ENV];
    delete process.env[REDIS_URL_ENV];
    setRateLimiter(undefined);
    try {
      expect(getRateLimiter().describe().driver).toBe('in-process');
      // 这一句是 route 里 `deployment.redisUrlConfigured` 的算法本体：读的是 `.trim()` 后的值，
      // 空格串算"没设"，与选驱动那一步同一句（否则界面会说"已设"而装的是进程内）。
      const configured = (process.env[REDIS_URL_ENV]?.trim() ?? '') !== '';
      expect(configured).toBe(false);
      process.env[REDIS_URL_ENV] = '   ';
      expect((process.env[REDIS_URL_ENV]?.trim() ?? '') !== '').toBe(false);
    } finally {
      if (previous === undefined) delete process.env[REDIS_URL_ENV];
      else process.env[REDIS_URL_ENV] = previous;
      setRateLimiter(undefined);
    }
  });
});

/**
 * 变异臂常驻门（R 系列，见 ADR-0082 的臂表）：
 * 下面这一条不是功能用例，是"这份读数的来源必须与界面声称的一致"的守门。
 */
describe('读数的来源钉死', () => {
  it('线路不通时 bucketsTracked 停在 0：它是"最近一次判定带回的数"，不是主动去查的数', async () => {
    const a = new RedisRateLimiter({ url: urlOfNonexistentRedis(), keyPrefix: 'readout-src-a:' });
    const b = new RedisRateLimiter({ url: urlOfNonexistentRedis(), keyPrefix: 'readout-src-b:' });
    try {
      await a.hit('readout-src/k|u|10.0.0.1', 2, 60_000);
      // 这一条退回了本机，所以那台的名册从没被读过——`describe()` 也绝不为了读数打一次网络。
      expect(a.describe().bucketsTracked).toBe(0);
      expect((a.describe().fallbackCount ?? 0)).toBeGreaterThan(0);
      // 两兄弟各报各的：键前缀与退回账都不串门（否则界面会在"哪一台"这一格说谎）。
      expect(a.describe().keyPrefix).toBe('readout-src-a:');
      expect(b.describe().keyPrefix).toBe('readout-src-b:');
      expect(b.describe().fallbackCount).toBe(0);
    } finally {
      a.dispose();
      b.dispose();
    }
  });
});
