import { describe, expect, it, vi } from 'vitest';
import {
  DISCOVER_INVALIDATE_CHANNEL,
  MAX_VIEWERS_PER_FRAME,
  MAX_VIEWER_ID_LENGTH,
  MemoryInvalidationBus,
  MemoryInvalidationHub,
  RedisInvalidationBus,
  parseInvalidationFrame,
  type InvalidationBus,
  type RedisLike,
} from '../src/server/domain/invalidation-bus';

/**
 * §SC-42 失效总线的验电夹具：不连真 Redis（Redis 驱动用假连接注入），不 sleep。
 *
 * 盯的是线路不可信与进程生命周期两类真实坏法：
 * 1. 坏帧/回环绝不落到 generation 变更；
 * 2. 写路径 publish 绝不阻塞、绝不抛；两条连接 dispose 幂等（否则 vitest 退出 hang）。
 */

describe('线路帧校验（线路字节不可信）', () => {
  it('合法帧解析成功；版本不对 / 形状不对直接丢（返回 null，不伪装成有类型）', () => {
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: ['u1', 'u2'] }))).toEqual({
      v: 1,
      origin: 'a',
      viewerIds: ['u1', 'u2'],
    });
    expect(parseInvalidationFrame('not-json')).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ v: 2, origin: 'a', viewerIds: ['u1'] }))).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, viewerIds: ['u1'] }))).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: 'u1' }))).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: [] }))).toBeNull();
  });

  it('§SC-44 全局帧（global:true + 空 viewerIds）解析成功；带人 / 空数组无 global 都挡掉', () => {
    const global = parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: [], global: true }));
    expect(global).toEqual({ v: 1, origin: 'a', viewerIds: [], global: true });
    // 全局帧却塞了 viewerIds：形状矛盾，丢（防一条帧既清全局又 bump 特定人）
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: ['u1'], global: true }))).toBeNull();
    // 空数组但不带 global：这正是**旧实例**解析 SC-44 全局帧时的路径 → fail-safe 丢弃，
    // 绝不把空集误当"要 bump 的 viewer"（单向兼容的关键）。
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: [] }))).toBeNull();
    // global 必须是字面 true，别的类型不认（线路字节不可信）
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: [], global: 1 }))).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: [], global: 'yes' }))).toBeNull();
  });

  it('viewerIds 条数/长度护栏挡住恶意大帧（防一条帧让所有实例抖动）', () => {
    const tooMany = Array.from({ length: MAX_VIEWERS_PER_FRAME + 1 }, (_, i) => `u${i}`);
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: tooMany }))).toBeNull();
    const tooLong = 'x'.repeat(MAX_VIEWER_ID_LENGTH + 1);
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: [tooLong] }))).toBeNull();
    // 恰好在上限内则通过
    const atLimit = Array.from({ length: MAX_VIEWERS_PER_FRAME }, (_, i) => `u${i}`);
    expect(parseInvalidationFrame(JSON.stringify({ v: 1, origin: 'a', viewerIds: atLimit }))?.viewerIds).toHaveLength(
      MAX_VIEWERS_PER_FRAME,
    );
  });
});

describe('内存 bus（同进程双实例互通，判据确定性主路径）', () => {
  it('实例 A 广播 → 实例 B 收到；A 自己不回环收第二遍（origin 去重）', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    const seenA: string[][] = [];
    const seenB: string[][] = [];
    a.subscribe((ids) => seenA.push(ids));
    b.subscribe((ids) => seenB.push(ids));

    a.publish(['u1']);
    expect(seenA).toEqual([]); // 自己那帧被 origin 去重摘掉
    expect(seenB).toEqual([['u1']]); // 对端收到
    expect(a.stats().published).toBe(1);
    expect(b.stats().received).toBe(1);
    a.dispose();
    b.dispose();
    expect(hub.size).toBe(0); // dispose 从 hub 摘干净
  });

  it('多对多广播、重复订阅、退订幂等', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    const c = new MemoryInvalidationBus(hub);
    const seen: string[] = [];
    const off = b.subscribe((ids) => seen.push(...ids));
    b.subscribe((ids) => seen.push(...ids)); // 第二个订阅者
    a.publish(['u1', 'u2']);

    // 同一帧 b 的两个订阅者各收一遍 → 4 条；c 没订阅 → 0；a 回环去重 → 0
    expect(seen).toEqual(['u1', 'u2', 'u1', 'u2']);
    off();
    off(); // 重复退订幂等
    c.dispose();
    b.dispose();
    a.dispose();
  });

  it('§SC-44 全局帧：A publishGlobal → B 收到 (ids=[], global=true)；回环去重照旧', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    const seenA: Array<[string[], boolean | undefined]> = [];
    const seenB: Array<[string[], boolean | undefined]> = [];
    a.subscribe((ids, global) => seenA.push([ids, global]));
    b.subscribe((ids, global) => seenB.push([ids, global]));

    a.publish([], true);
    expect(seenA).toEqual([]); // origin 回环去重照旧
    expect(seenB).toEqual([[[], true]]); // 对端收到"全局"标志，viewerIds 为空
    // 全局帧的 applied 记 1 次处置，不是 0 个 viewer（否则四账会显示"收到却没做事"）
    expect(a.stats().published).toBe(1);
    expect(b.stats().received).toBe(1);
    expect(b.stats().applied).toBe(1);
    a.dispose();
    b.dispose();
  });

  it('dispose 后不再收发（幂等，防热重载后旧 bus 还活）', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    const seen: string[][] = [];
    b.subscribe((ids) => seen.push(ids));
    a.dispose();
    a.publish(['u1']); // 已 dispose，发出去是 no-op
    expect(seen).toEqual([]);
    expect(a.stats().published).toBe(0);
    a.dispose(); // 幂等
    b.dispose();
  });
});

/**
 * §MQ-1 / ADR-0126：订阅者异常隔离。与 `realtime/localBus.ts` 同一纪律——
 * 一个坏回调不能吞掉同一帧的其余订阅者。全部纯内存 hub / 假连接，零真 Redis、零真库、零 sleep。
 *
 * 这里同时验四账诚实：applied 记"帧是否被处置"（至少一个 listener 成功才算），
 * errors 记"坏回调数"；隔离绝不能做成把失败藏起来的 swallowing。
 */
describe('订阅者异常隔离（§MQ-1：内存与 Redis 双驱动共用同一 dispatch）', () => {
  it('第一个 listener 抛错，同帧后续 listener 照常收到（修复前必红：后续全丢）', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    const seen: string[][] = [];
    b.subscribe(() => {
      throw new Error('坏订阅者');
    });
    b.subscribe((ids) => seen.push(ids));

    expect(() => a.publish(['u1'])).not.toThrow(); // 写路径不因坏回调带崩
    expect(seen).toEqual([['u1']]); // 核心：修复前这里是 []
    expect(b.stats()).toMatchObject({ received: 1, applied: 1, errors: 1 });
    a.dispose();
    b.dispose();
  });

  it('中间 listener 抛错，前后两个都照常收到', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    const first: string[][] = [];
    const third: string[][] = [];
    b.subscribe((ids) => first.push(ids));
    b.subscribe(() => {
      throw new Error('中间的坏订阅者');
    });
    b.subscribe((ids) => third.push(ids));

    a.publish(['u1', 'u2']);
    expect(first).toEqual([['u1', 'u2']]);
    expect(third).toEqual([['u1', 'u2']]);
    expect(b.stats()).toMatchObject({ errors: 1, applied: 2 });
    a.dispose();
    b.dispose();
  });

  it('诚实读数：全部 listener 都抛错 → applied 不虚增、errors 记满坏回调数', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    b.subscribe(() => {
      throw new Error('坏 1');
    });
    b.subscribe(() => {
      throw new Error('坏 2');
    });

    a.publish(['u1', 'u2']);
    // 没有任何订阅者处置这一帧：applied 必须是 0，不能因为"帧解析成功"就虚记 2。
    expect(b.stats().applied).toBe(0);
    // 两个坏回调各记一笔 error，不是笼统 1 笔。
    expect(b.stats().errors).toBe(2);
    expect(b.stats().received).toBe(1);
    a.dispose();
    b.dispose();
  });

  it('诚实读数：零 listener 时帧到达但无人处置，applied 不虚增', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub); // 挂在 hub 上会收到帧，但没人 subscribe

    a.publish(['u1']);
    expect(b.stats().received).toBe(1); // 帧确实到了
    expect(b.stats().applied).toBe(0); // 但没人处置——收紧"注释说回调数、实现却虚记"的分叉
    expect(b.stats().errors).toBe(0); // 没坏回调，不该记 error
    a.dispose();
    b.dispose();
  });

  it('零回归：两个正常 listener 各收一遍，applied 按帧处置量记一次、不因 listener 数翻倍', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    const seen: string[][] = [];
    b.subscribe((ids) => seen.push(ids));
    b.subscribe((ids) => seen.push(ids));

    a.publish(['u1', 'u2']);
    expect(seen).toEqual([
      ['u1', 'u2'],
      ['u1', 'u2'],
    ]); // 各收一遍
    // applied 是"这一帧造成几次本地失效"（幂等 bump），不是回调次数：记 2 = viewerIds.length，不是 4。
    expect(b.stats().applied).toBe(2);
    expect(b.stats().errors).toBe(0);
    a.dispose();
    b.dispose();
  });

  it('坏 listener 退订后不再拖累账本', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    const seen: string[][] = [];
    const offBad = b.subscribe(() => {
      throw new Error('已退订的坏订阅者');
    });
    b.subscribe((ids) => seen.push(ids));
    offBad();

    a.publish(['u1']);
    expect(seen).toEqual([['u1']]);
    expect(b.stats().errors).toBe(0); // 坏回调已退订，这一帧没有失败
    expect(b.stats().applied).toBe(1);
    a.dispose();
    b.dispose();
  });

  it('§MQ-1 生产 Redis 驱动同样隔离：一个 listener 抛错不影响同帧其余订阅者', () => {
    const sub = fakeRedis();
    const bus = new RedisInvalidationBus(fakeRedis(), sub, { url: 'redis://fake' });
    const seen: string[][] = [];
    bus.subscribe(() => {
      throw new Error('坏订阅者');
    });
    bus.subscribe((ids) => seen.push(ids));

    // 走真实 message handler（生产路径），不是内存 hub：证明两种驱动共用的 dispatch 都修好了。
    const message = sub.handlers.get('message') as (channel: string, payload: string) => void;
    expect(() =>
      message(DISCOVER_INVALIDATE_CHANNEL, JSON.stringify({ v: 1, origin: 'other', viewerIds: ['u1'] })),
    ).not.toThrow();
    expect(seen).toEqual([['u1']]);
    expect(bus.stats()).toMatchObject({ received: 1, applied: 1, errors: 1 });
    bus.dispose();
  });
});

/** 线路回调签名（`RedisLike.on` 存进来的 error / message handler）。 */
type WireHandler = (...args: any[]) => void;

/** 假 ioredis 连接：记录命令、可注入 subscribe/publish 失败，验证驱动不抛、不 hang。 */
function fakeRedis(
  overrides: { subscribeFail?: boolean; publishFail?: boolean } = {},
): RedisLike & {
  published: Array<[string, string]>;
  subscribed: string[];
  disconnected: number;
  handlers: Map<string, WireHandler>;
} {
  const handlers = new Map<string, WireHandler>();
  const published: Array<[string, string]> = [];
  const subscribed: string[] = [];
  let disconnected = 0;
  return {
    handlers,
    published,
    subscribed,
    get disconnected() {
      return disconnected;
    },
    on(event, listener) {
      handlers.set(event, listener);
      return this;
    },
    async subscribe(channel) {
      if (overrides.subscribeFail) throw new Error('subscribe failed');
      subscribed.push(channel);
      return 1; // ioredis 6 实测：返回当前订阅频道数
    },
    async publish(channel, payload) {
      if (overrides.publishFail) throw new Error('publish failed');
      published.push([channel, payload]);
      return 1;
    },
    disconnect() {
      disconnected += 1;
    },
  } as RedisLike & {
    published: Array<[string, string]>;
    subscribed: string[];
    disconnected: number;
    handlers: Map<string, WireHandler>;
  };
}

describe('Redis 驱动（假连接，验证不抛 / 不 hang / 生命周期）', () => {
  function makeBus(pub: RedisLike, sub: RedisLike, onError = vi.fn()): InvalidationBus {
    return new RedisInvalidationBus(pub, sub, { url: 'redis://fake', onError });
  }

  it('构造即订频道、带上版本名；publish 发到同一频道', async () => {
    const pub = fakeRedis();
    const sub = fakeRedis();
    const bus = makeBus(pub, sub);
    await Promise.resolve(); // 让 subscribe 的微任务落定
    expect(sub.subscribed).toEqual([DISCOVER_INVALIDATE_CHANNEL]); // 构造那一刻就订上，不等第一个订阅者
    bus.publish(['u1']);
    expect(pub.published).toEqual([[DISCOVER_INVALIDATE_CHANNEL, expect.any(String)]]);
    expect(bus.stats().published).toBe(1);
    bus.dispose();
  });

  it('§SC-44 Redis 驱动发全局帧：空 viewerIds 不再被早退挡掉，线上带 global 标志', async () => {
    const pub = fakeRedis();
    const sub = fakeRedis();
    const bus = makeBus(pub, sub);
    // 与另一实例对称：用另一个 sub handler 收这一帧，验线上 payload 形状
    bus.publish([], true);
    expect(pub.published).toHaveLength(1); // 发出去了（旧实现会因空数组早退，这里会红）
    const wire = JSON.parse(pub.published[0]![1]) as { viewerIds: string[]; global?: boolean; origin: string };
    expect(wire.viewerIds).toEqual([]);
    expect(wire.global).toBe(true);
    expect(bus.stats().published).toBe(1);
    bus.dispose();
  });

  it('publish 线路失败：吞错、计数、绝不抛（写路径不能被网络带崩）', async () => {
    const onError = vi.fn();
    const bus = makeBus(fakeRedis({ publishFail: true }), fakeRedis(), onError);
    expect(() => bus.publish(['u1'])).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(bus.stats().errors).toBeGreaterThanOrEqual(1);
    bus.dispose();
  });

  it('订阅频道失败只记账不抛；收到坏帧不计 received、不落订阅者', async () => {
    const onError = vi.fn();
    const sub = fakeRedis({ subscribeFail: true });
    const bus = makeBus(fakeRedis(), sub, onError);
    const seen: string[][] = [];
    bus.subscribe((ids) => seen.push(ids));
    await Promise.resolve();
    await Promise.resolve();
    expect(bus.stats().errors).toBeGreaterThanOrEqual(1); // subscribe 失败记账

    // 手工投递两帧：一坏一好，走真实 message handler
    const message = sub.handlers.get('message') as (channel: string, payload: string) => void;
    message(DISCOVER_INVALIDATE_CHANNEL, 'bad-json');
    message(DISCOVER_INVALIDATE_CHANNEL, JSON.stringify({ v: 1, origin: 'other', viewerIds: ['u1'] }));
    expect(seen).toEqual([['u1']]); // 坏帧被丢，好帧到达
    expect(bus.stats().received).toBe(1);
    bus.dispose();
  });

  it('线路名不认识的帧记账丢弃；origin 回环帧不落订阅者', () => {
    const pub = fakeRedis();
    const sub = fakeRedis();
    const onError = vi.fn();
    const bus = makeBus(pub, sub, onError);
    const seen: string[][] = [];
    bus.subscribe((ids) => seen.push(ids));
    const message = sub.handlers.get('message') as (channel: string, payload: string) => void;

    // 1. 频道名被动过：记账、丢弃，绝不落订阅者
    message('nexus:someone-else:v1', JSON.stringify({ v: 1, origin: 'x', viewerIds: ['u1'] }));
    expect(onError).toHaveBeenCalled();
    expect(seen).toEqual([]);

    // 2. 自己 publish 的帧经 Redis 回环投回来：origin 去重摘掉，不重复通知本地
    bus.publish(['u2']);
    const ownPayload = pub.published[0]![1];
    message(DISCOVER_INVALIDATE_CHANNEL, ownPayload);
    expect(seen).toEqual([]); // 回环帧没落到自己头上
    expect(bus.stats().published).toBe(1);
    bus.dispose();
  });

  it('dispose 幂等：两条连接各 disconnect 一次，不多不少', () => {
    const pub = fakeRedis();
    const sub = fakeRedis();
    const bus = makeBus(pub, sub);
    bus.dispose();
    bus.dispose();
    expect(pub.disconnected).toBe(1);
    expect(sub.disconnected).toBe(1);
  });
});
