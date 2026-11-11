import { describe, expect, it, vi } from 'vitest';
import { makeRedisShared, type RedisCtor } from '../src/server/gateway/index';

/**
 * §SC-50 / ADR-0125：共享缓存 Redis 连接的**契约验电**——注入假构造器，逐支验喂给 ioredis 的
 * 连接策略，全程不连真 Redis、不连真库、不 sleep、不真重连。
 *
 * 诚实界限：这里验的是"喂给 ioredis 的 retryStrategy 形状与边界正确 + 断线期 fail-open 契约不被破坏"，
 * **不宣称**已在真线路上验证"Redis 断后真的自愈"（那需要真 Redis + 网络抖动，本机多 agent 抢库
 * 无干净窗口，见 ADR-0125）。真线路自愈仍是待实测项。
 */

interface Captured {
  url: string;
  options: Record<string, unknown>;
  listeners: Map<string, (...args: any[]) => void>;
}

/** 造一个假 ioredis 构造器：捕获构造参数与事件监听，可注入 get/set 的实现。 */
function fakeCtor(
  captured: Captured,
  impl: {
    get?: (key: string) => Promise<string | null>;
    set?: (key: string, value: string, mode: string, ms: number) => Promise<unknown>;
  } = {},
): RedisCtor {
  class FakeRedis {
    on(event: string, listener: (...args: any[]) => void) {
      captured.listeners.set(event, listener);
      return this;
    }
    get(key: string) {
      return (impl.get ?? (async () => null))(key);
    }
    set(key: string, value: string, mode: string, ms: number) {
      return (impl.set ?? (async () => 'OK'))(key, value, mode, ms);
    }
  }
  return new Proxy(FakeRedis, {
    construct(_target, args: [string, Record<string, unknown>]) {
      captured.url = args[0];
      captured.options = args[1];
      return new FakeRedis();
    },
  }) as unknown as RedisCtor;
}

const fresh = (): Captured => ({ url: '', options: {}, listeners: new Map() });

describe('共享缓存连接策略（§SC-50 / ADR-0125，假构造器零真 Redis）', () => {
  it('retryStrategy 可注入为函数；接真构造缝后 makeRedisShared 正常返回（不再写死不可测）', async () => {
    const cap = fresh();
    const shared = await makeRedisShared('redis://fake', fakeCtor(cap));
    expect(shared).not.toBeNull();
    expect(cap.url).toBe('redis://fake');
    expect(typeof cap.options['retryStrategy']).toBe('function');
    // fail-open 的三条连接纪律仍在：不排队、单次请求重试、延迟连接
    expect(cap.options['enableOfflineQueue']).toBe(false);
    expect(cap.options['maxRetriesPerRequest']).toBe(1);
    expect(cap.options['lazyConnect']).toBe(true);
  });

  it('断后先尝试自愈：第 1 次重连返回正数，不再像旧实现那样恒 null 永久 fail-open', async () => {
    const cap = fresh();
    await makeRedisShared('redis://fake', fakeCtor(cap));
    const strategy = cap.options['retryStrategy'] as (attempt: number) => number | null;
    expect(strategy(1)).toBeGreaterThan(0);
    expect(strategy(2)).toBeGreaterThan(strategy(1)!); // 指数退避，第二次间隔更长
  });

  it('有界重连：每次返回正数或 null，退避随 attempt 单调不减、封顶不越 1000ms', async () => {
    const cap = fresh();
    await makeRedisShared('redis://fake', fakeCtor(cap));
    const strategy = cap.options['retryStrategy'] as (attempt: number) => number | null;
    const values = Array.from({ length: 30 }, (_, i) => strategy(i + 1));
    // 每个 attempt 都有明确定义：正数（重连）或 null（放弃），绝不 NaN / 负数 / undefined
    for (const v of values) {
      expect(v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0)).toBe(true);
    }
    const nums = values.filter((v): v is number => v !== null);
    expect(nums.length).toBeGreaterThan(0); // 至少前几次在重连，不是一开始就没救
    expect(Math.max(...nums)).toBeLessThanOrEqual(1000); // 退避封顶，不无限增长
    for (let i = 1; i < nums.length; i += 1) expect(nums[i]!).toBeGreaterThanOrEqual(nums[i - 1]!);
  });

  it('放弃上限：attempt 超过阈值返回 null，不无限空转打日志/CPU（ADR-0125 明列的风险）', async () => {
    const cap = fresh();
    await makeRedisShared('redis://fake', fakeCtor(cap));
    const strategy = cap.options['retryStrategy'] as (attempt: number) => number | null;
    expect(strategy(1)).not.toBeNull(); // 断后先尝试自愈
    expect(strategy(999)).toBeNull(); // 长期不可达则放弃
    // 放弃后不反弹：再大的 attempt 也不重新铸出重连间隔
    expect(strategy(1000)).toBeNull();
  });

  it('断线期 fail-open 契约：wrapped.get 把线路错误如实抛上，交给 client.readShared 兜底回退', async () => {
    const cap = fresh();
    const shared = await makeRedisShared(
      'redis://fake',
      fakeCtor(cap, {
        get: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    );
    // makeRedisShared 这一层不吞（吞错是 client.readShared 的职责，那里记 fallbacks/lastError）
    await expect(shared!.get('k')).rejects.toThrow('ECONNREFUSED');
  });

  it('get 命中才造 reply，未命中返回 null；set 走 PX 毫秒 TTL 且下界夹紧到 ≥1', async () => {
    const cap = fresh();
    const setSpy = vi.fn(async () => 'OK');
    const shared = await makeRedisShared(
      'redis://fake',
      fakeCtor(cap, { get: async () => 'payload', set: setSpy }),
    );
    expect((await shared!.get('k'))?.value).toBe('payload');
    await shared!.set('k', 'v', 0);
    expect(setSpy).toHaveBeenCalledWith('k', 'v', 'PX', 1);
    await shared!.set('k', 'v', 250);
    expect(setSpy).toHaveBeenLastCalledWith('k', 'v', 'PX', 250);
  });

  it('miss 返回 null（不伪造一个空 reply）；error 监听常驻且 swallow 不抛', async () => {
    const cap = fresh();
    const shared = await makeRedisShared('redis://fake', fakeCtor(cap));
    expect(await shared!.get('absent')).toBeNull();
    const errorListener = cap.listeners.get('error');
    expect(typeof errorListener).toBe('function');
    // Node 里无监听者的 error 事件是 uncaught exception；这里验它接住且不往外抛
    expect(() => errorListener!(new Error('connect ECONNREFUSED'))).not.toThrow();
  });

  it('ctor 构造抛错时返回 null（裁剪部署缺包 / 连接初始化失败 → 退回进程内，不致命）', async () => {
    const throwing = (new Proxy(class {}, {
      construct() {
        throw new Error('no redis');
      },
    }) as unknown) as RedisCtor;
    await expect(makeRedisShared('redis://fake', throwing)).resolves.toBeNull();
  });
});
