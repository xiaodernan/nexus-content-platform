import { beforeEach, describe, expect, it } from 'vitest';
import {
  discoverCacheKeyForTest,
  discoverCacheStats,
  invalidateDiscoverFor,
  invalidateDiscoverGlobally,
  loadDiscoverCached,
  resetDiscoverCacheForTest,
  type DiscoverCacheInput,
  type DiscoverLoader,
} from '../src/server/domain/discover-cache';
import type { DiscoverResult, DiscoverSort } from '../src/server/domain/social';

/**
 * §SC-41 发现页缓存的验电夹具：全部注入 fake loader / 受控时钟 / 极小容量，不连库、不 sleep。
 *
 * 判据盯的是三个真实坏法，而不是"缓存能不能存值"：
 * 1. 跨 viewer 串味（键含 viewer、singleflight 不跨 viewer 合并）；
 * 2. 写后即时失效（invalidate 不靠 TTL）；
 * 3. **generation 被 LRU 淘汰后回退 → 旧隐私缓存复活**（最隐蔽，专设一组）。
 */

const SORTS: DiscoverSort[] = ['new', 'popular', 'trending', 'following'];

function card(path: string) {
  return {
    publicationId: path,
    path,
    name: path,
    owner: 'o',
    handle: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    views: 0,
    likes: 0,
    comments: 0,
    remixes: 0,
    kind: 'website',
    coverAssetId: null,
    ownerHandle: null,
  };
}

function resultFor(path: string): DiscoverResult {
  return { sort: 'new', cards: [card(path)], unavailable: [], hiddenAuthors: 0, method: null };
}

/** 计数 loader：每次真正被调用就 +1，返回一份带代次标记的结果，便于认出"复活的是哪一代"。 */
function countingLoader(): { loader: DiscoverLoader; calls: () => number } {
  let calls = 0;
  return {
    loader: async () => {
      calls += 1;
      return resultFor(`gen-${calls}`);
    },
    calls: () => calls,
  };
}

beforeEach(() => {
  // 每个用例独立 store；传极小容量/固定时钟，TTL 判据另行覆盖。
  resetDiscoverCacheForTest({ maxEntries: 64, maxViewers: 8, ttlMs: 10_000, now: () => 1_000 });
});

describe('键构造（隐私第一道闸）', () => {
  it('键含 viewerId / sort / limit，任一维不同就是不同键', () => {
    const a = discoverCacheKeyForTest({ sort: 'new', viewerId: 'viewer-A', limit: 24 });
    const b = discoverCacheKeyForTest({ sort: 'new', viewerId: 'viewer-B', limit: 24 });
    const c = discoverCacheKeyForTest({ sort: 'popular', viewerId: 'viewer-A', limit: 24 });
    const d = discoverCacheKeyForTest({ sort: 'new', viewerId: 'viewer-A', limit: 12 });
    expect(new Set([a, b, c, d]).size).toBe(4);
    // 同一个 (viewer, sort, limit) 反复取，键稳定（generation 未变时）
    expect(discoverCacheKeyForTest({ sort: 'new', viewerId: 'viewer-A', limit: 24 })).toBe(a);
  });

  it('viewerId 含分隔符也不会与别的组合碰撞（JSON 编码，不是字符串拼接）', () => {
    const tricky = discoverCacheKeyForTest({ sort: 'new', viewerId: 'a|b', limit: 24 });
    const normal = discoverCacheKeyForTest({ sort: 'new', viewerId: 'a', limit: 24 });
    expect(tricky).not.toBe(normal);
  });

  it('匿名与登录是不同键；两个匿名共享一份（匿名没有私有视图）', () => {
    const anon = discoverCacheKeyForTest({ sort: 'new', viewerId: null, limit: 24 });
    const user = discoverCacheKeyForTest({ sort: 'new', viewerId: 'viewer-A', limit: 24 });
    expect(anon).not.toBe(user);
    expect(discoverCacheKeyForTest({ sort: 'new', viewerId: undefined, limit: 24 })).toBe(anon);
  });

  it('四种 sort 都进键，不含 trending 遗漏', () => {
    const keys = SORTS.map((sort) => discoverCacheKeyForTest({ sort, viewerId: 'v', limit: 24 }));
    expect(new Set(keys).size).toBe(4);
  });
});

describe('取或加载（降载 + 隔离）', () => {
  it('同 viewer 连读两次只加载一次（命中缓存，不重复打库）', async () => {
    const { loader, calls } = countingLoader();
    const input: DiscoverCacheInput = { sort: 'new', viewerId: 'viewer-A', limit: 24 };
    const first = await loadDiscoverCached(input, loader);
    const second = await loadDiscoverCached(input, loader);
    expect(calls()).toBe(1);
    expect(second.cards[0]?.path).toBe(first.cards[0]?.path);
    expect(discoverCacheStats().hits).toBeGreaterThanOrEqual(1);
  });

  it('不同 viewer 各加载一次，结果互不串味', async () => {
    const { loader, calls } = countingLoader();
    const a = await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, loader);
    const b = await loadDiscoverCached({ sort: 'new', viewerId: 'B' }, loader);
    expect(calls()).toBe(2);
    // 各自拿到自己那一次加载的代次，而不是同一份
    expect(a.cards[0]?.path).not.toBe(b.cards[0]?.path);
  });

  it('singleflight：同 viewer 并发只加载一次；不同 viewer 并发各自加载，不合并', async () => {
    const same = countingLoader();
    await Promise.all([
      loadDiscoverCached({ sort: 'trending', viewerId: 'S' }, same.loader),
      loadDiscoverCached({ sort: 'trending', viewerId: 'S' }, same.loader),
      loadDiscoverCached({ sort: 'trending', viewerId: 'S' }, same.loader),
    ]);
    expect(same.calls()).toBe(1); // 同键合并

    const cross = countingLoader();
    await Promise.all([
      loadDiscoverCached({ sort: 'trending', viewerId: 'X' }, cross.loader),
      loadDiscoverCached({ sort: 'trending', viewerId: 'Y' }, cross.loader),
    ]);
    expect(cross.calls()).toBe(2); // 跨 viewer 绝不合并（否则就是串味）
  });

  it('匿名并发共享一份：N 个匿名只加载一次', async () => {
    const { loader, calls } = countingLoader();
    await Promise.all(
      Array.from({ length: 5 }, () => loadDiscoverCached({ sort: 'popular', viewerId: null }, loader)),
    );
    expect(calls()).toBe(1);
  });
});

describe('写后即时失效（隐私，不靠 TTL）', () => {
  it('invalidate 后同 viewer 立刻重载，不受 TTL 保护', async () => {
    let ttlNow = 1_000;
    resetDiscoverCacheForTest({ maxEntries: 64, maxViewers: 8, ttlMs: 600_000, now: () => ttlNow });
    const { loader, calls } = countingLoader();
    const input: DiscoverCacheInput = { sort: 'new', viewerId: 'A', limit: 24 };
    const before = await loadDiscoverCached(input, loader);
    expect(calls()).toBe(1);

    invalidateDiscoverFor('A'); // 拉黑发生
    ttlNow += 1; // 时钟几乎没走，远未到 TTL
    const after = await loadDiscoverCached(input, loader);
    expect(calls()).toBe(2); // 必须重载，而不是吃 TTL 内的旧隐私视图
    expect(after.cards[0]?.path).not.toBe(before.cards[0]?.path);
  });

  it('invalidate 只作用于指定 viewer，不牵连别人（否则是可用性事故）', async () => {
    const { loader, calls } = countingLoader();
    await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, loader);
    await loadDiscoverCached({ sort: 'new', viewerId: 'B' }, loader);
    expect(calls()).toBe(2);

    invalidateDiscoverFor('A');
    await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, loader); // A 重载
    await loadDiscoverCached({ sort: 'new', viewerId: 'B' }, loader); // B 仍命中
    expect(calls()).toBe(3); // 恰好 +1，B 没被误伤
  });

  it('invalidate(匿名) 是 no-op；登录 viewer 拉黑不影响匿名共享视图', async () => {
    const { loader, calls } = countingLoader();
    await loadDiscoverCached({ sort: 'new', viewerId: null }, loader);
    await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, loader);
    invalidateDiscoverFor('A', null, undefined);
    await loadDiscoverCached({ sort: 'new', viewerId: null }, loader); // 匿名命中
    expect(calls()).toBe(2);
  });
});

describe('单调水位线（本片最隐蔽的一条）', () => {
  it('invalidate 让该 viewer 的 generation 严格增大，旧键永不复现', () => {
    const before = discoverCacheKeyForTest({ sort: 'new', viewerId: 'A' });
    invalidateDiscoverFor('A');
    const after = discoverCacheKeyForTest({ sort: 'new', viewerId: 'A' });
    expect(after).not.toBe(before);
    // 再次取键稳定（新 generation 已生效）
    expect(discoverCacheKeyForTest({ sort: 'new', viewerId: 'A' })).toBe(after);
    expect(discoverCacheStats().globalGen).toBeGreaterThanOrEqual(2);
  });

  it('generation 表被 LRU 淘汰后回退会复活旧隐私缓存——水位线必须挡住这一条', async () => {
    // maxViewers=2：放第三个 viewer 就淘汰最久未用的那个。
    resetDiscoverCacheForTest({ maxEntries: 64, maxViewers: 2, ttlMs: 600_000, now: () => 1_000 });
    const { loader, calls } = countingLoader();
    const input: DiscoverCacheInput = { sort: 'following', viewerId: 'A', limit: 24 };

    // 第 1 代：A 拉黑前的视图（gen-1）
    const gen1 = await loadDiscoverCached(input, loader);
    expect(gen1.cards[0]?.path).toBe('gen-1');

    // A 拉黑 → generation 淘汰 → 第 2 代：拉黑后的视图（gen-2）
    invalidateDiscoverFor('A');
    const gen2 = await loadDiscoverCached(input, loader);
    expect(gen2.cards[0]?.path).toBe('gen-2');

    // 塞两个别的 viewer，把 A 从 generation 表里挤出去（A 的 gen 条目被淘汰）
    await loadDiscoverCached({ sort: 'new', viewerId: 'B' }, loader);
    await loadDiscoverCached({ sort: 'new', viewerId: 'C' }, loader);
    expect(discoverCacheStats().viewerGenerations).toBeLessThanOrEqual(2);

    // A 再来：若 generation 天真地从 0 重新分配，就会命中 gen-1 那份**拉黑前**的隐私缓存。
    // 单调水位线保证重新分配到的是比历史都大的新 generation → 必重新加载，拿到当前视图。
    const gen3 = await loadDiscoverCached(input, loader);
    expect(gen3.cards[0]?.path).not.toBe('gen-1'); // 绝不复活拉黑前那份
    expect(calls()).toBeGreaterThanOrEqual(3);
    expect(discoverCacheStats().globalGen).toBeGreaterThanOrEqual(3);
  });

  it('全局水位线只增不减：连 reset 也不把它归零（否则跨热重载串味）', () => {
    const g1 = discoverCacheStats().globalGen;
    invalidateDiscoverFor('A', 'B', 'C');
    discoverCacheKeyForTest({ sort: 'new', viewerId: 'D' }); // 分配一次
    const g2 = discoverCacheStats().globalGen;
    expect(g2).toBeGreaterThan(g1);
    resetDiscoverCacheForTest({ maxEntries: 64, maxViewers: 8, ttlMs: 10_000, now: () => 1_000 });
    expect(discoverCacheStats().globalGen).toBe(g2); // 重置不清零
  });
});

describe('§SC-44 全局失效（新作品发布/下架——内容新鲜度，与 privacy 失效正交）', () => {
  it('预热匿名 + 多 viewer + 4 sort → 一次全局失效 → 每个键都重新加载（含匿名共享那份）', async () => {
    const { loader, calls } = countingLoader();
    // 匿名共享 1 份 + 两个登录 viewer × 4 sort = 9 个键，全部预热命中
    const inputs: DiscoverCacheInput[] = [
      { sort: 'new', viewerId: null },
      ...['A', 'B'].flatMap((v) => SORTS.map((sort) => ({ sort, viewerId: v }))),
    ];
    for (const input of inputs) await loadDiscoverCached(input, loader);
    expect(calls()).toBe(9); // 9 个键各加载一次
    const epochBefore = discoverCacheStats().globalEpoch;

    invalidateDiscoverGlobally();

    expect(discoverCacheStats().globalEpoch).toBe(epochBefore + 1);
    // 再读一遍：所有键都是新 epoch → 全部 miss、全部重载，没有一个吃旧缓存（尤其匿名）。
    // calls 从 9 变 18 就是"匿名共享那份 + 每个 viewer 每个 sort 全部重载"的精确反证——
    // 若匿名没被全局失效（像 privacy 失效那样 no-op），这里只会是 17。
    for (const input of inputs) await loadDiscoverCached(input, loader);
    expect(calls()).toBe(18);
  });

  it('正交性：定向 invalidate 不动 epoch；全局 invalidate 不动任何 viewer 的 generation', () => {
    const keyA0 = discoverCacheKeyForTest({ sort: 'new', viewerId: 'A' });
    const epoch0 = discoverCacheStats().globalEpoch;
    const genA0 = discoverCacheStats().globalGen;

    invalidateDiscoverFor('A'); // 只删 A 的 generation 条目（此刻尚未重新分配，水位线不动）
    expect(discoverCacheStats().globalEpoch).toBe(epoch0); // epoch 没动
    // generation 是**懒分配**的：invalidate 只淘汰条目，下次取键才 ++globalGen 拿一个更大的值。
    const keyA1 = discoverCacheKeyForTest({ sort: 'new', viewerId: 'A' });
    const genA1 = discoverCacheStats().globalGen;
    expect(genA1).toBeGreaterThan(genA0); // 重新分配到更大的 generation
    expect(keyA1).not.toBe(keyA0);

    invalidateDiscoverGlobally(); // 只改 epoch
    expect(discoverCacheStats().globalEpoch).toBe(epoch0 + 1);
    expect(discoverCacheStats().globalGen).toBe(genA1); // generation 没动
    // 全局失效后 A 的键再变一次，但这次纯粹是 epoch 造成的（generation 已在上面钉住没动）
    const keyA2 = discoverCacheKeyForTest({ sort: 'new', viewerId: 'A' });
    expect(keyA2).not.toBe(keyA1);
    expect(keyA2).not.toBe(keyA0);
  });

  it('全局水位线只增不减：连 reset 也不归零（否则热重载后旧 epoch 的键会复活）', () => {
    const epoch0 = discoverCacheStats().globalEpoch;
    invalidateDiscoverGlobally();
    const e1 = discoverCacheStats().globalEpoch;
    expect(e1).toBe(epoch0 + 1);

    // reset（模拟热重载）：epoch 必须保住，否则新 store 从 0 起会重新拼出上一代全局失效前的键
    resetDiscoverCacheForTest({ maxEntries: 64, maxViewers: 8, ttlMs: 10_000, now: () => 1_000 });
    expect(discoverCacheStats().globalEpoch).toBe(e1); // 重置不清零
    invalidateDiscoverGlobally();
    expect(discoverCacheStats().globalEpoch).toBe(e1 + 1);
  });
});

describe('有界性（数据结构 · 防内存被外部可控键撑爆）', () => {
  it('TTL 到期后重载，且受控时钟让"过期"可钉不靠 sleep', async () => {
    let clock = 0;
    resetDiscoverCacheForTest({ maxEntries: 64, maxViewers: 8, ttlMs: 100, now: () => clock });
    const { loader, calls } = countingLoader();
    await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, loader);
    clock = 50;
    await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, loader); // 未过期
    expect(calls()).toBe(1);
    clock = 200;
    await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, loader); // 过期重载
    expect(calls()).toBe(2);
  });

  it('缓存条目数被 maxEntries 封顶，generation 表被 maxViewers 封顶', async () => {
    resetDiscoverCacheForTest({ maxEntries: 5, maxViewers: 4, ttlMs: 600_000, now: () => 1_000 });
    const { loader } = countingLoader();
    // 4 个 viewer × 4 种 sort = 16 个键，远超 maxEntries=5
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        SORTS.map((sort) => loadDiscoverCached({ sort, viewerId: `v${i}` }, loader)),
      ).flat(),
    );
    const stats = discoverCacheStats();
    expect(stats.size).toBeLessThanOrEqual(5);
    expect(stats.viewerGenerations).toBeLessThanOrEqual(4);
    expect(stats.evictions).toBeGreaterThan(0);
  });
});

/**
 * §SC-45 失效波采集的验电：把 ADR-0116 诚实留下的"预期冷启动尖峰"从猜测变成可钉死的数字。
 * 全程受控时钟 + fake loader，不 sleep、不连库、零生产行为变化——只验证"读数是否与真实发生的事相符"，
 * 以及"观测代码绝不许拖垮失效/读主业"这两件事。守的是几类真实坏法：
 * 1. 环形缓冲漏了界 → 发布越多次读数越涨，最终又是一个内存漏点；
 * 2. `peakInFlight` 采样点放到 `await` 之后 → inflight 已清零、恒 0，把惊群谎报成"没有"；
 * 3. `firstFillMs=null`（窗口内无人读）被画成 0 → 谎称"失效瞬间就有人重填"（同 `hitRate(0,0)` 不说 0%）；
 * 4. 观测抛错 → 反过来破坏 SC-44 的失效承诺或吞掉 loader 的异常；
 * 5. 波跨 reset 保留 → 旧进程带旧 epoch 的波与新 store 撞值，误导运维。
 */
describe('§SC-45 发布冷启动波（只记不拦的可观测快照）', () => {
  /** 可推进的受控时钟 + 可收窄的波窗口/容量；时钟与 BoundedCache、Store 共用同一个 now。 */
  function waveStore(waveWindowMs = 1_000, waveCapacity = 12) {
    let clock = 1_000;
    resetDiscoverCacheForTest({
      maxEntries: 64, maxViewers: 8, ttlMs: 600_000, now: () => clock, waveWindowMs, waveCapacity,
    });
    return { advance: (ms: number): void => { clock += ms; }, now: (): number => clock };
  }

  /** 门控 loader：多个键可同时卡在 gate 上，用来验证 peakInFlight 抓的是"并发在途"的瞬时值。 */
  function gatedLoader(): { loader: DiscoverLoader; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    return {
      loader: async () => { await gate; return resultFor('gated'); },
      release: (): void => release(),
    };
  }

  it('waveConfig 如实回读配置；初始 waves 为空不是"0 波惊群"', () => {
    waveStore(250, 3);
    const stats = discoverCacheStats();
    expect(stats.waveConfig).toEqual({ windowMs: 250, capacity: 3 });
    expect(stats.waves).toEqual([]);
  });

  it('定向 privacy 失效不开波；只有全局失效才开一个仍在采样的 active 波', () => {
    waveStore();
    invalidateDiscoverFor('A');
    expect(discoverCacheStats().waves).toEqual([]); // 隐私失效不是冷启动，不占波
    invalidateDiscoverGlobally();
    const waves = discoverCacheStats().waves;
    expect(waves).toHaveLength(1);
    expect(waves[0]!.settled).toBe(false); // 还在窗口内，读数还会变
    expect(waves[0]!.epoch).toBe(discoverCacheStats().globalEpoch); // 波归属失效后的新世代
  });

  it('受控时钟钉死首击延迟与打库增量：失效后 13ms 首次重填 → firstFillMs=13、loadsDelta=1', async () => {
    const h = waveStore(1_000);
    const { loader } = countingLoader();
    await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, loader); // 预热，loads=1（此时没有 active 波）
    invalidateDiscoverGlobally(); // openWave 记 loadsAtOpen=1、openedAtMs=1000
    const epoch = discoverCacheStats().globalEpoch;
    h.advance(13);
    await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, loader); // 新 epoch → miss → loads=2
    const w = discoverCacheStats().waves[0]!;
    expect(w.epoch).toBe(epoch);
    expect(w.loadsDelta).toBe(1); // 差值精确锚定"这一波真打了几库"
    expect(w.firstFillMs).toBe(13); // 不是估算，是受控时钟的精确毫秒
  });

  it('窗口内无人读：loadsDelta=0、firstFillMs=null（不是 0——0 会谎称"瞬间就有人读"）', () => {
    waveStore(1_000);
    invalidateDiscoverGlobally();
    const w = discoverCacheStats().waves[0]!;
    expect(w.loadsDelta).toBe(0);
    expect(w.firstFillMs).toBeNull();
    expect(w.peakInFlight).toBe(0);
  });

  it('惰性定格：窗口未过仍在采样，读 stats 推过窗口后才归档，且不重复定格', () => {
    const h = waveStore(100);
    invalidateDiscoverGlobally();
    h.advance(50);
    expect(discoverCacheStats().waves[0]!.settled).toBe(false); // 50 < 100，仍在采样
    h.advance(51); // 累计 101 > 100
    const after = discoverCacheStats().waves;
    expect(after).toHaveLength(1);
    expect(after[0]!.settled).toBe(true); // 读 stats 这一下惰性归档，无定时器
    expect(discoverCacheStats().waves).toHaveLength(1); // 再读不重复 push
  });

  it('环形缓冲有界：连续 5 次失效只留最近 2 波，新的在前、最旧的被丢', () => {
    const h = waveStore(10, 2);
    const e0 = discoverCacheStats().globalEpoch;
    for (let i = 0; i < 5; i += 1) {
      invalidateDiscoverGlobally();
      h.advance(100); // 每次推过窗口，逼上一波归档
    }
    h.advance(100); // 让最后一波（active）也定格
    const waves = discoverCacheStats().waves;
    expect(waves).toHaveLength(2); // 恰好容量，不是 5——读数不随发布次数增长
    expect(waves[0]!.epoch).toBe(e0 + 5); // 最新在前
    expect(waves[1]!.epoch).toBe(e0 + 4);
    expect(waves.every((w) => w.settled)).toBe(true);
  });

  it('peakInFlight 抓到并发在途峰值（≥2）：专钉"采样点放到 await 之后就恒 0"的回归', async () => {
    waveStore(1_000);
    const gated = gatedLoader();
    invalidateDiscoverGlobally();
    // 两个不同键并发卡在 gate 上：getOrLoad 同步登记 inFlight 后，loadFromStore 立刻采样。
    const pA = loadDiscoverCached({ sort: 'new', viewerId: 'A' }, gated.loader);
    const pB = loadDiscoverCached({ sort: 'popular', viewerId: 'B' }, gated.loader);
    gated.release();
    await Promise.all([pA, pB]);
    const w = discoverCacheStats().waves[0]!;
    expect(w.peakInFlight).toBeGreaterThanOrEqual(2); // 若只在 await 后采样，inflight 已清零 → 这里红
    expect(w.loadsDelta).toBe(2); // 两个键各发一次 loader（singleflight 不跨键合并）
  });

  it('loader 失败不崩、异常不吞，波仍如实记下"打过一次库"', async () => {
    waveStore(1_000);
    invalidateDiscoverGlobally();
    const boom: DiscoverLoader = async () => { throw new Error('db down'); };
    await expect(loadDiscoverCached({ sort: 'new', viewerId: 'A' }, boom)).rejects.toThrow('db down');
    const w = discoverCacheStats().waves[0]!;
    expect(w.loadsDelta).toBe(1); // getOrLoad 在发起 loader 前就 loads++，失败也算真打过库
    expect(w.firstFillMs).toBe(0); // 失效当刻就有人读，0ms 是诚实的
  });

  it('观测不跨 reset：波清零（旧进程带旧 epoch 会误导），但 globalEpoch 必须保留', () => {
    waveStore(1_000);
    invalidateDiscoverGlobally();
    expect(discoverCacheStats().waves.length).toBeGreaterThanOrEqual(1);
    const epoch = discoverCacheStats().globalEpoch;
    resetDiscoverCacheForTest({ maxEntries: 64, maxViewers: 8, ttlMs: 10_000, now: () => 1_000 });
    const stats = discoverCacheStats();
    expect(stats.waves).toEqual([]); // 观测从零重计
    expect(stats.globalEpoch).toBe(epoch); // 但内容世代不能丢（否则旧键复活）——两者故意相反
  });

  it('waves / waveConfig 可安全 JSON 往返（admin route 原样端出，null 不丢成 undefined）', () => {
    waveStore(1_000, 12);
    invalidateDiscoverGlobally();
    const json = JSON.parse(JSON.stringify(discoverCacheStats()));
    expect(json.waves).toHaveLength(1);
    expect(json.waves[0].firstFillMs).toBeNull(); // null 是"无人读"，不能往返成 undefined
    expect(json.waveConfig).toEqual({ windowMs: 1_000, capacity: 12 });
  });
});
