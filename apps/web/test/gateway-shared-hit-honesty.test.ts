import { describe, expect, it } from 'vitest';
import { createGatewayClient, type GatewayFetch, type SharedCache } from '../src/server/gateway/client';

/**
 * §SHARED-1：共享缓存命中的读数账本必须诚实（ADR-0156）。
 *
 * 契约（gateway/types.ts:21）：`ReadoutState='cached'` = "命中进程内/共享缓存，带 measuredAt 的旧事实"；
 * `'fresh'` = "这次真的问到了上游"。
 *
 * 缺口（先量再治）：`client.ts` 的 `load()` 里 `readShared()` 命中就直接 return，**根本没调 fetchOnce**，
 * 却把 `cache.getOrLoad` 的返回一律标 `state:'fresh'` + note "这次从上游读到的快照"。于是
 * "另一实例几秒前写入的旧事实"被记成"这次真的问到了上游"——账本说谎，运维会以为面板在实时测量。
 *
 * 判据哲学：纯内存假件、零网络、零时钟、零 sleep。钉的是"来源分类"这条不变量：
 * 真问了上游才 fresh，命中共享（不管本进程还是别的实例的）一律 cached；失败 fail-open 回退真问仍 fresh。
 */

const ROUTES = { measuredAt: 't0', total: 1, routes: [{ id: 'r', uri: 'lb://nexus-api', order: 0 }], note: 'n' };
const SERVICES = {
  measuredAt: 't0',
  source: 's',
  total: 1,
  services: [{ id: 'nexus-api', instances: 1, addresses: ['http://a:1'] }],
  note: 'n',
};
const HEALTH = {
  measuredAt: 't0',
  timeoutMs: 1500,
  source: 's',
  allUp: true,
  instances: 1,
  services: [{ id: 'nexus-api', up: true, instances: [{ uri: 'http://a:1', status: 'UP', httpStatus: 200, detail: null }] }],
  note: 'n',
};
const BODY = (url: string): unknown =>
  url.includes('/routes') ? ROUTES : url.includes('/services') ? SERVICES : HEALTH;

function countingFetch(): { fetch: GatewayFetch; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => BODY(url) };
    },
  };
}

function base(over: Partial<Parameters<typeof createGatewayClient>[0]> = {}) {
  return {
    baseUrl: 'http://gw:8080/',
    sleep: async () => {},
    now: () => 1000,
    clock: () => 'T',
    rng: () => 0.5,
    ...over,
  };
}

/**
 * "另一实例早先写入"的共享快照：measuredAt 明显旧（shared-t），storedAt 是别的实例写的时刻。
 * 按 key 返回**对应列形状**的值——否则 services/health 列拿到 ROUTES 形状会过不了各自的 normalize
 * 而回退真问网关（那正是"读不出不等于有"的正确行为，但不是本判据要测的共享命中路径）。
 */
function sharedHit(measuredAt = 'shared-t'): SharedCache {
  return {
    async get(key) {
      // load() 传的是裸键名 'routes' / 'services' / 'health'（见 client.ts:258-260）
      const value = key === 'routes' ? ROUTES : key === 'services' ? SERVICES : HEALTH;
      return { value: JSON.stringify({ value, measuredAt }), storedAtMs: 1, storedAt: 'OTHER-INSTANCE-S' };
    },
    async set() {},
  };
}

describe('§SHARED-1 共享缓存命中读数账本诚实（ADR-0156）', () => {
  it('命中共享缓存 → state=cached、没打网关、note 不说"这次从上游读到"、旧 measuredAt 如实透传', async () => {
    const f = countingFetch();
    const client = createGatewayClient(base({ fetchImpl: f.fetch, shared: sharedHit() }));
    const { routes } = await client.loadAll();

    expect(routes.state, '命中共享缓存却标 fresh —— 把别的实例的旧事实说成这次测量，账本说谎').toBe('cached');
    expect(f.calls.length, '共享命中不该打网关').toBe(0);
    expect(routes.measuredAt, '上游当初的测量时刻必须透传，不能换成"现在"').toBe('shared-t');
    expect(routes.value?.total).toBe(1); // 值本身没变、没被画成 0 或空表
    // note 要能自证"不是这次测的"：点名共享/缓存/别的实例/否定本次，且绝不声称这次问了上游
    expect(routes.note, 'note 没说清这份值是旧事实').toMatch(/共享|缓存|别的实例|不是这次|不是此刻|并非本次|不是本次/);
    // 反向门只禁"肯定式声称本次问了上游"：用 (?:^|[^并是不非]) 排除"并非本次/不是本次"等否定前缀，
    // 避免把正确的否定句误伤（CRIT-1「锚语义不锚词」纪律）。
    expect(routes.note, 'note 在肯定地声称本次问了上游，与"没打网关"直接矛盾').not.toMatch(
      /(?:^|[^并不非是])(?:这次|本次)(?:从上游|真的问到|向网关请求所得)/,
    );
  });

  it('共享未命中 → 真问上游 → state=fresh + 原 note（零回归）', async () => {
    const f = countingFetch();
    const shared: SharedCache = {
      async get() {
        return null; // 没命中
      },
      async set() {},
    };
    const client = createGatewayClient(base({ fetchImpl: f.fetch, shared }));
    const { routes } = await client.loadAll();

    expect(routes.state, '真问了上游却是 cached').toBe('fresh');
    expect(f.calls.length, '没命中共享就该打网关').toBeGreaterThan(0);
    expect(routes.measuredAt).toBe('T'); // fetchOnce 用注入的 clock() 当本次测量时刻
  });

  it('singleflight 并发同键：共享命中时所有 follower 也如实拿 cached（source 随同一 promise 传播）', async () => {
    const f = countingFetch();
    const client = createGatewayClient(base({ fetchImpl: f.fetch, shared: sharedHit() }));
    const snaps = await Promise.all(Array.from({ length: 5 }, () => client.loadAll()));

    for (const snap of snaps) {
      expect(snap.routes.state, '并发 follower 把共享命中标成了 fresh').toBe('cached');
      expect(snap.routes.measuredAt).toBe('shared-t');
    }
    expect(f.calls.length, '并发同键不该各自打网关').toBe(0);
  });

  it('fail-open：共享线路抛错 → 回退真问上游 → state=fresh（零回归，不把降级误标 cached）', async () => {
    const f = countingFetch();
    const client = createGatewayClient(
      base({
        fetchImpl: f.fetch,
        shared: {
          async get() {
            throw new Error('ECONNREFUSED');
          },
          async set() {},
        },
      }),
    );
    const { routes } = await client.loadAll();

    expect(routes.state, '共享坏掉后真问了上游，该 fresh 而非 cached').toBe('fresh');
    expect(f.calls.length, 'fail-open 后必须真打网关').toBeGreaterThan(0);
    expect(routes.value?.total).toBe(1);
  });

  it('共享坏形状 → 当没命中、回退真问上游 → fresh（零回归）', async () => {
    const f = countingFetch();
    const shared: SharedCache = {
      async get() {
        return { value: 'null', storedAtMs: 1, storedAt: 'S' }; // JSON.parse → null，形状不认识
      },
      async set() {},
    };
    const client = createGatewayClient(base({ fetchImpl: f.fetch, shared }));
    const { routes } = await client.loadAll();

    expect(routes.state, '坏形状回退真问上游，该 fresh').toBe('fresh');
    expect(f.calls.length, '坏形状必须回退打网关').toBeGreaterThan(0);
  });
});
