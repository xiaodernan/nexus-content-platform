import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverResult, DiscoverSort } from '@/server/domain/social';
import { __resetDiscoverCacheDriverForTests, DISCOVER_REDIS_URL_ENV } from '@/server/cache/discoverRedis';

/**
 * § discover anon 缓存的 **single-flight / 惊群防护** 与 **invalidate 竞态** 门。
 *
 * 缺口是真的、可测的：15s 窗口过期的那一瞬，N 个并发 anon 请求会同时 `cache.get` miss，
 * 随后**各自**跑一遍 `discover()`——而 discover 每行要算三条 count(*) 子查询。发现页是全站最热
 * 只读路径，窗口边界 × 并发 = 必然的 cache stampede（数据库尖峰）。single-flight 把同一 sort 的
 * 并发 compute 压成一次，众人共享那一个 promise；跨进程的重复由 Redis 共享窗口挡（两层不重叠）。
 *
 * 第二个缺口更隐蔽：`invalidateDiscoverRoute()`（publish / moderation 的写路径）如果在某个 compute
 * 飞行期间被执行，那个**在失效前就开算、在失效后才落地**的旧结果若照常写回，就等于把刚清掉的窗口
 * 重新填上旧内容——"新发布 15s 内可见"的承诺被绕过。修法是给窗口一个 generation：失效时 bump，
 * 飞行任务落地时若 generation 已变就**不写回**（但该请求仍拿到自己那一份结果，不凭空失败）。
 *
 * 这一片用可控的 deferred（`pending()`）而非真实计时器制造并发窗口：compute 何时 settle 由测试说了算，
 * 于是"N 个请求是否真的合并成一次"是**确定性可观察**的，不靠 sleep、不连库、不起 Redis、不改源码，
 * 低内存共享宿主也跑得动。用内存驱动（不设 NEXUS_REDIS_URL）。
 */

const sample = (tag: string, sort: DiscoverSort = 'new'): DiscoverResult => ({
  sort,
  cards: [
    {
      publicationId: `pub-${tag}`,
      path: `/n/owner/${tag}`,
      name: `Pub ${tag}`,
      owner: 'Owner',
      handle: 'owner',
      publishedAt: new Date(0).toISOString(),
      views: 0,
      likes: 0,
      comments: 0,
      remixes: 0,
      kind: 'website',
      coverAssetId: null,
      ownerHandle: 'owner',
    },
  ],
  hiddenAuthors: 0,
  method: null,
  unavailable: [],
});

/** 一个不会被计时器碰、只由测试显式 settle 的 promise。 */
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 让出若干 microtask，使几个 `await` 链走到同一个同步检查点。 */
const flush = () => vi.waitFor(() => Promise.resolve());

beforeEach(() => {
  vi.stubEnv(DISCOVER_REDIS_URL_ENV, ''); // 内存驱动
  __resetDiscoverCacheDriverForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  __resetDiscoverCacheDriverForTests();
});

describe('cachedDiscoverAnonymous — single-flight：同 sort 并发合并为一次 compute', () => {
  it('窗口 miss 时 N 个并发请求只触发一次 compute，众人拿到同一份结果', async () => {
    const { cachedDiscoverAnonymous } = await import('@/server/cache/discoverRouteCache');
    let calls = 0;
    const gate = pending<DiscoverResult>();
    const compute = async () => {
      calls += 1;
      return gate.promise;
    };

    const a = cachedDiscoverAnonymous('new', compute);
    const b = cachedDiscoverAnonymous('new', compute);
    const c = cachedDiscoverAnonymous('new', compute);
    await flush();

    expect(calls, '窗口边界的并发必须合并成一次 Discover 计算，否则是 N 倍 count(*) 子查询的数据库尖峰').toBe(1);

    const answer = sample('single');
    gate.resolve(answer);
    const [ra, rb, rc] = await Promise.all([a, b, c]);

    expect(ra).toBe(answer);
    expect(rb).toBe(answer);
    expect(rc).toBe(answer);
    expect(calls, '三路共享那一次飞行，落地后不许再各自算').toBe(1);
  });

  it('compute 抛错时并发共享同一个 rejection，且失败不被记住（下一次真重算）', async () => {
    const { cachedDiscoverAnonymous } = await import('@/server/cache/discoverRouteCache');
    let calls = 0;
    const gate = pending<DiscoverResult>();
    const compute = async () => {
      calls += 1;
      return gate.promise;
    };

    const a = cachedDiscoverAnonymous('new', compute);
    const b = cachedDiscoverAnonymous('new', compute);
    await flush();
    expect(calls).toBe(1);

    const boom = new Error('discover upstream blew up');
    gate.reject(boom);
    await expect(a, '第一路拿到原始 rejection').rejects.toBe(boom);
    await expect(b, '并发第二路共享同一 rejection，不许各自再抛一个').rejects.toBe(boom);

    // 飞行结束后 in-flight 表必须清空：否则下一次会 join 一个已 rejected 的旧 promise。
    const recovered = await cachedDiscoverAnonymous('new', async () => sample('recovered'));
    expect(recovered.cards[0]!.publicationId).toBe('pub-recovered');
    expect(calls, '失败没有被缓存，也没有被 in-flight 表记住').toBe(1);
  });

  it('不同 sort 各飞各的：new 的飞行不会被 popular 误合并', async () => {
    const { cachedDiscoverAnonymous } = await import('@/server/cache/discoverRouteCache');
    const newGate = pending<DiscoverResult>();
    const popGate = pending<DiscoverResult>();
    let newCalls = 0;
    let popCalls = 0;

    const n = cachedDiscoverAnonymous('new', async () => {
      newCalls += 1;
      return newGate.promise;
    });
    const p = cachedDiscoverAnonymous('popular', async () => {
      popCalls += 1;
      return popGate.promise;
    });
    await flush();

    expect(newCalls, 'new 与 popular 是两把不同的键，必须各算一次').toBe(1);
    expect(popCalls, 'single-flight 不许跨排序合并，否则 popular 会拿到 new 的答案').toBe(1);

    const newAnswer = sample('n', 'new');
    const popAnswer = sample('p', 'popular');
    newGate.resolve(newAnswer);
    popGate.resolve(popAnswer);
    expect(await n).toBe(newAnswer);
    expect(await p).toBe(popAnswer);
  });

  it('窗口命中后再来并发不重算：single-flight 不绕过那层 15s 缓存', async () => {
    const { cachedDiscoverAnonymous } = await import('@/server/cache/discoverRouteCache');
    let calls = 0;
    const first = await cachedDiscoverAnonymous('new', async () => {
      calls += 1;
      return sample('cached');
    });
    expect(first.cards[0]!.publicationId).toBe('pub-cached');

    const [a, b, c] = await Promise.all([
      cachedDiscoverAnonymous('new', async () => {
        calls += 1;
        return sample('should-not-run');
      }),
      cachedDiscoverAnonymous('new', async () => {
        calls += 1;
        return sample('should-not-run');
      }),
      cachedDiscoverAnonymous('new', async () => {
        calls += 1;
        return sample('should-not-run');
      }),
    ]);

    expect(calls, '有缓存时连一次都不该算——single-flight 只管 miss 那一瞬').toBe(1);
    expect(a.cards[0]!.publicationId).toBe('pub-cached');
    expect(b.cards[0]!.publicationId).toBe('pub-cached');
    expect(c.cards[0]!.publicationId).toBe('pub-cached');
  });
});

describe('invalidateDiscoverRoute — 失效与 in-flight 的竞态不许填回旧内容', () => {
  it('失效前开算、失效后落地的旧结果不写回缓存，下一次请求重算', async () => {
    const { cachedDiscoverAnonymous, invalidateDiscoverRoute } = await import('@/server/cache/discoverRouteCache');
    let calls = 0;
    const stale = pending<DiscoverResult>();
    const compute = async () => {
      calls += 1;
      return stale.promise;
    };

    // 请求在失效前开算（模拟 publish 刚好撞上窗口刷新）。
    const inFlight = cachedDiscoverAnonymous('new', compute);
    await flush();
    expect(calls).toBe(1);

    await invalidateDiscoverRoute();

    // 旧计算落地：它自己的请求仍该拿到结果，不凭空失败。
    const staleAnswer = sample('stale');
    stale.resolve(staleAnswer);
    expect(await inFlight).toBe(staleAnswer);

    // 关键判别：失效之后的窗口不该被那份迟到旧结果填上。
    let freshCalls = 0;
    const freshAnswer = sample('fresh');
    const next = await cachedDiscoverAnonymous('new', async () => {
      freshCalls += 1;
      return freshAnswer;
    });
    expect(next, '若迟到写回填了旧内容，这里会拿到 stale 而不是 fresh——承诺被绕过').toBe(freshAnswer);
    expect(freshCalls, '失效后必须真的重算一次，而不是命中一份被迟到写回填进来的旧快照').toBe(1);
    expect(calls, '旧那一程只算过一次，失效不该让旧 compute 再跑').toBe(1);
  });

  it('失效期间的新请求不与旧飞行合并：它开算自己的新结果', async () => {
    const { cachedDiscoverAnonymous, invalidateDiscoverRoute } = await import('@/server/cache/discoverRouteCache');
    const stale = pending<DiscoverResult>();
    const fresh = pending<DiscoverResult>();
    let staleCalls = 0;
    let freshCalls = 0;

    const oldRequest = cachedDiscoverAnonymous('new', async () => {
      staleCalls += 1;
      return stale.promise;
    });
    await flush();
    expect(staleCalls).toBe(1);

    await invalidateDiscoverRoute();

    // 失效之后进来的请求：即便旧飞行还没落地，也不许 join 它（那会给它一份失效前的旧快照）。
    const newRequest = cachedDiscoverAnonymous('new', async () => {
      freshCalls += 1;
      return fresh.promise;
    });
    await flush();
    expect(freshCalls, '失效后的新请求必须另起一次 compute，不能搭旧飞行的车').toBe(1);

    const freshAnswer = sample('fresh2');
    fresh.resolve(freshAnswer);
    stale.resolve(sample('stale2'));
    expect(await newRequest).toBe(freshAnswer);
    expect((await oldRequest).cards[0]!.publicationId).toBe('pub-stale2');
  });
});
