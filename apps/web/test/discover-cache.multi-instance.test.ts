import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedDiscoverCacheForTest,
  discoverCacheKeyForTest,
  discoverCacheStats,
  invalidateDiscoverFor,
  loadDiscoverCached,
  resetDiscoverCacheForTest,
  type IsolatedDiscoverCache,
} from '../src/server/domain/discover-cache';
import {
  MemoryInvalidationBus,
  MemoryInvalidationHub,
  type InvalidationBus,
} from '../src/server/domain/invalidation-bus';
import type { DiscoverResult, DiscoverSort } from '../src/server/domain/social';

/**
 * §SC-42 跨实例失效的**确定性**判据：同进程造两个独立 store 经内存 hub 互通，模拟多进程部署。
 * 不连真 Redis、不 sleep、不 flaky——隐私跨实例语义压在这层，真 Redis 往返只验"线路通不通"。
 *
 * 盯三条：
 * 1. 实例 A 写路径失效 → 实例 B 的 generation bump → B 下次读重新查库（不再吃旧的隐私视图）；
 * 2. fail-open：bus 不在 / 线路丢帧时，本机那半边即时失效照旧（ADR-0113 单机语义不回退）；
 * 3. 净辐射与幂等：匿名不广播、重复 bump 不乱、dispose 后不再互通。
 */

let hub: MemoryInvalidationHub;
const opened: InvalidationBus[] = [];
const stores: IsolatedDiscoverCache[] = [];

function makePair(): [IsolatedDiscoverCache, IsolatedDiscoverCache] {
  const aBus = new MemoryInvalidationBus(hub);
  const bBus = new MemoryInvalidationBus(hub);
  opened.push(aBus, bBus);
  const a = createIsolatedDiscoverCacheForTest({ bus: aBus, ttlMs: 600_000, maxViewers: 64 });
  const b = createIsolatedDiscoverCacheForTest({ bus: bBus, ttlMs: 600_000, maxViewers: 64 });
  stores.push(a, b);
  return [a, b];
}

/** 返回"第 n 次真正加载"的 result，便于认出实例 B 有没有重新查库。 */
function sequentialLoader(label: string): { loader: () => Promise<DiscoverResult>; calls: () => number } {
  let calls = 0;
  return {
    loader: async () => {
      calls += 1;
      return {
        sort: 'new' as DiscoverSort,
        cards: [{ path: `${label}-${calls}` } as DiscoverResult['cards'][number]],
        unavailable: [],
        hiddenAuthors: 0,
        method: null,
      };
    },
    calls: () => calls,
  };
}

beforeEach(() => {
  hub = new MemoryInvalidationHub();
  opened.length = 0;
  stores.length = 0;
  // 全局 store 也强制单机，免得 env 里若设了 NEXUS_REDIS_URL 干扰 fail-open 用例
  resetDiscoverCacheForTest({ bus: null });
});

afterEach(() => {
  for (const s of stores) s.dispose();
  for (const bus of opened) bus.dispose();
  opened.length = 0;
  stores.length = 0;
});

describe('跨实例失效（两个独立 store 经 hub 互通）', () => {
  it('实例 A 写路径失效 → 实例 B 的 generation bump → B 重新查库，不再吃旧隐私视图', async () => {
    const [a, b] = makePair();
    const input = { sort: 'new' as const, viewerId: 'u1', limit: 24 };
    const aLoad = sequentialLoader('A');
    const bLoad = sequentialLoader('B');

    // 两边各自预热，缓存了"拉黑前"的视图（各自独立加载一次）
    const aBefore = await a.load(input, aLoad.loader);
    const bBefore = await b.load(input, bLoad.loader);
    expect(aBefore.cards[0]?.path).toBe('A-1');
    expect(bBefore.cards[0]?.path).toBe('B-1');

    const bGenBefore = b.keyFor(input); // 记下 B 当前 generation 对应的键
    // 实例 A 上发生 setBlock(u1, ...) → 写路径失效并广播
    a.invalidate('u1');

    // 广播是同步 dispatch（内存 hub），B 的 generation 应已 bump：键变了
    expect(b.keyFor(input)).not.toBe(bGenBefore);
    // B 再读：键带新 generation → miss → 重新查库（拿到 B-2），而不是继续吃 B-1 旧视图
    const bAfter = await b.load(input, bLoad.loader);
    expect(bAfter.cards[0]?.path).toBe('B-2');
    expect(bLoad.calls()).toBe(2);
    // A 自己那半边也即时失效（本机先 bump，不靠 B 回帧）
    const aAfter = await a.load(input, aLoad.loader);
    expect(aAfter.cards[0]?.path).toBe('A-2');
  });

  it('实例 A 失效只广播受影响 viewer，不牵连别人的缓存', async () => {
    const [a, b] = makePair();
    const u1 = { sort: 'new' as const, viewerId: 'u1', limit: 24 };
    const u2 = { sort: 'new' as const, viewerId: 'u2', limit: 24 };
    const bLoad = sequentialLoader('B');
    await b.load(u1, bLoad.loader);
    await b.load(u2, bLoad.loader);
    const bU2KeyBefore = b.keyFor(u2);

    a.invalidate('u1'); // 只失效 u1

    expect(b.keyFor(u2)).toBe(bU2KeyBefore); // u2 的键不变
    await b.load(u2, bLoad.loader);
    expect(bLoad.calls()).toBe(2); // u2 仍命中，没被误伤
  });

  it('匿名失效不广播：no viewerId = 不上线路（匿名无私有视图）', () => {
    const [a, b] = makePair();
    const bKeyBefore = b.keyFor({ sort: 'new', viewerId: 'anon-check', limit: 24 });
    const publishedBefore = a.stats().bus?.published ?? 0;
    a.invalidate(null, undefined); // 纯匿名 bump：本机 no-op、不上线路
    expect(a.stats().bus?.published ?? 0).toBe(publishedBefore); // 线路一帧没发
    // 对端没收到任何帧（它自己的键不受影响；这里用别 viewer 的键做对照，证明没被误 bump）
    expect(b.keyFor({ sort: 'new', viewerId: 'anon-check', limit: 24 })).toBe(bKeyBefore);
  });

  it('重复失效同一 viewer 幂等：generation 单调增、不报错、不放大加载', async () => {
    const [a, b] = makePair();
    const input = { sort: 'following' as const, viewerId: 'u1', limit: 24 };
    const bLoad = sequentialLoader('B');
    await b.load(input, bLoad.loader);
    a.invalidate('u1');
    const key1 = b.keyFor(input);
    a.invalidate('u1');
    a.invalidate('u1');
    const key2 = b.keyFor(input);
    // 每次远端帧都 bump，故键单调变化；但缓存不会"放大加载"——B 只在真读时查一次
    expect(key2).not.toBe(key1);
    await b.load(input, bLoad.loader);
    expect(bLoad.calls()).toBe(2);
  });
});

describe('§SC-44 跨实例全局失效（新作品发布对所有实例、所有 viewer 都是新的）', () => {
  it('实例 A 全局失效 → B 的 globalEpoch bump → B 的所有键（含匿名）拼不出来、全部重查', async () => {
    const [a, b] = makePair();
    const bLoad = sequentialLoader('B');
    const anon = { sort: 'new' as const, viewerId: null, limit: 24 };
    const u1 = { sort: 'popular' as const, viewerId: 'u1', limit: 24 };

    // B 预热匿名 + 登录两个键，各自命中
    await b.load(anon, bLoad.loader);
    await b.load(u1, bLoad.loader);
    expect(bLoad.calls()).toBe(2);
    const bAnonKeyBefore = b.keyFor(anon);
    const bU1KeyBefore = b.keyFor(u1);
    const bEpochBefore = b.stats().globalEpoch;

    // A 上发生 public 发布 → 全局失效并广播
    a.invalidateAll();

    // B 经 hub 收到全局帧，epoch +1，且**匿名与登录两个键都变了**（这是与定向失效的区别）
    expect(b.stats().globalEpoch).toBe(bEpochBefore + 1);
    expect(b.keyFor(anon)).not.toBe(bAnonKeyBefore);
    expect(b.keyFor(u1)).not.toBe(bU1KeyBefore);
    // B 再读两个键都 miss、重查库（拿到 B-3、B-4，不继续吃 B-1/B-2 旧视图）
    await b.load(anon, bLoad.loader);
    await b.load(u1, bLoad.loader);
    expect(bLoad.calls()).toBe(4);
    // A 自己那半边也即时 bump（本机先 +1，不靠 B 回帧）
    expect(a.stats().globalEpoch).toBe(1);
  });

  it('定向失效不 broadcast 全局：A bump 单个 viewer 不动 B 的 epoch，也不动 B 的匿名键', async () => {
    const [a, b] = makePair();
    const bAnon = { sort: 'new' as const, viewerId: null, limit: 24 };
    const bKeyBefore = b.keyFor(bAnon);
    const bEpochBefore = b.stats().globalEpoch;

    a.invalidate('u1'); // 只失效 u1（privacy 语义）

    expect(b.stats().globalEpoch).toBe(bEpochBefore); // B 的全局世代没动
    expect(b.keyFor(bAnon)).toBe(bKeyBefore); // 匿名键没被误伤
  });

  it('fail-open：没 bus 的实例发布，本机 epoch 照旧 +1、所有键即时失效，不抛', async () => {
    const solo = createIsolatedDiscoverCacheForTest({ bus: null, ttlMs: 600_000 });
    stores.push(solo);
    const load = sequentialLoader('S');
    const anon = { sort: 'new' as const, viewerId: null, limit: 24 };
    await solo.load(anon, load.loader);
    const keyBefore = solo.keyFor(anon);

    expect(() => solo.invalidateAll()).not.toThrow(); // 没 bus 也不抛
    expect(solo.stats().globalEpoch).toBe(1);
    expect(solo.keyFor(anon)).not.toBe(keyBefore); // 本机匿名键即时失效，单机语义不回退
    await solo.load(anon, load.loader);
    expect(load.calls()).toBe(2);
  });

  it('dispose 后的实例不再被别人的全局帧 bump（旧订阅已退订）', async () => {
    const [a, b] = makePair();
    const keyBefore = b.keyFor({ sort: 'new', viewerId: null, limit: 24 });
    b.dispose(); // B 退订
    a.invalidateAll();
    expect(b.stats().globalEpoch).toBe(0); // B 没收到
    expect(b.keyFor({ sort: 'new', viewerId: null, limit: 24 })).toBe(keyBefore);
  });
});

describe('fail-open（线路不在，单机语义不回退）', () => {
  it('无 bus 的实例：写路径失效本机照旧即时生效，不抛', async () => {
    const solo = createIsolatedDiscoverCacheForTest({ bus: null, ttlMs: 600_000 });
    stores.push(solo);
    const input = { sort: 'new' as const, viewerId: 'u1', limit: 24 };
    const load = sequentialLoader('S');
    const before = await solo.load(input, load.loader);
    expect(before.cards[0]?.path).toBe('S-1');
    const keyBefore = solo.keyFor(input);

    expect(() => solo.invalidate('u1')).not.toThrow(); // 没 bus 也不抛
    expect(solo.keyFor(input)).not.toBe(keyBefore); // 本机 generation 仍 bump
    const after = await solo.load(input, load.loader);
    expect(after.cards[0]?.path).toBe('S-2'); // 重新查库，单机即时失效一字未变
  });

  it('一端 dispose 后不再互通：另一端失效不再 bump 已退订实例', async () => {
    const [a, b] = makePair();
    const input = { sort: 'new' as const, viewerId: 'u1', limit: 24 };
    const bKeyBefore = b.keyFor(input);
    a.dispose(); // A 退订，不再从 hub 收帧（但 A 仍是发布者？dispose 只退订订阅，publish 仍可发——见下）

    // B 也 dispose 后，A 再广播，B 不应再被 bump
    b.dispose();
    a.invalidate('u1');
    expect(b.keyFor(input)).toBe(bKeyBefore); // B 已退订，收不到
  });
});

describe('全局 store 挂 bus 的 fail-open 与生命周期', () => {
  it('注入 bus 的全局 store：invalidateDiscoverFor 本机即时 + 广播到同 hub 另一 store', async () => {
    const busA = new MemoryInvalidationBus(hub);
    const busB = new MemoryInvalidationBus(hub);
    opened.push(busA, busB);
    resetDiscoverCacheForTest({ bus: busA, ttlMs: 600_000 }); // 全局 store 挂 busA
    const b = createIsolatedDiscoverCacheForTest({ bus: busB, ttlMs: 600_000 });
    stores.push(b);

    const input = { sort: 'popular' as const, viewerId: 'u9', limit: 24 };
    const bLoad = sequentialLoader('B');
    await b.load(input, bLoad.loader);
    const bKeyBefore = b.keyFor(input);

    // 走全局生产入口（与 blocks/social 写路径同一句）
    invalidateDiscoverFor('u9');
    expect(b.keyFor(input)).not.toBe(bKeyBefore); // 跨实例生效
    expect(discoverCacheStats().bus?.published).toBe(1); // 广播记数
    await b.load(input, bLoad.loader);
    expect(bLoad.calls()).toBe(2);
  });

  it('reset 会退订旧 bus 的回调：热重载后旧订阅不再 bump 新全局 store', () => {
    const busA = new MemoryInvalidationBus(hub);
    const busOther = new MemoryInvalidationBus(hub); // 扮"另一台实例"往 hub 广播
    opened.push(busA, busOther);
    resetDiscoverCacheForTest({ bus: busA, ttlMs: 600_000 });
    const input = { sort: 'new' as const, viewerId: 'u1', limit: 24 };
    const keyAtReset = discoverCacheKeyForTest(input); // 重建前先钉全局键（分配一次 generation）

    // 重建全局 store（模拟热重载）：新 store 不挂 bus，且旧 busA 的订阅被解绑
    resetDiscoverCacheForTest({ bus: null, ttlMs: 600_000 });
    expect(discoverCacheStats().bus).toBeNull(); // 新 store 没继承旧 bus
    const keyAfterReset = discoverCacheKeyForTest(input); // 新 store 自己的基线

    // 另一实例广播 u1：若旧 busA 的回调没解绑，会误 bump 新 store → 键变；解绑了则不变
    busOther.publish(['u1']);
    expect(discoverCacheKeyForTest(input)).toBe(keyAfterReset);
    // 且新 store 的键是全新单调水位线的一部分，与重建前不相等（没复活旧 generation）
    expect(keyAfterReset).not.toBe(keyAtReset);
  });

  it('loadDiscoverCached 全局入口在注入 bus 后仍保持单机即时语义', async () => {
    const busA = new MemoryInvalidationBus(hub);
    opened.push(busA);
    resetDiscoverCacheForTest({ bus: busA, ttlMs: 600_000 });
    const input = { sort: 'new' as const, viewerId: 'u1', limit: 24 };
    const load = sequentialLoader('G');
    const before = await loadDiscoverCached(input, load.loader);
    expect(before.cards[0]?.path).toBe('G-1');
    invalidateDiscoverFor('u1');
    const after = await loadDiscoverCached(input, load.loader);
    expect(after.cards[0]?.path).toBe('G-2'); // 本机即时失效不因挂了 bus 而退化
  });
});
