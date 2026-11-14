import { describe, expect, it } from 'vitest';
import { backoffCeiling, fullJitter, jitterSchedule } from '../src/server/gateway/backoff';
import { BoundedCache } from '../src/server/gateway/cache';
import { aggregateHealth, joinSnapshot, type JoinInput } from '../src/server/gateway/snapshot';
import {
  normalizeHealth,
  normalizeRoutes,
  normalizeServices,
  serviceIdFromUri,
  type HealthReadout,
  type Readout,
  type RoutesReadout,
  type ServicesReadout,
} from '../src/server/gateway/types';

/** 第 n 列的验电夹具：全部只读、纯函数，不碰网络/时间/环境。 */

describe('全 jitter 退避（计网 · 惊群）', () => {
  it('退避天花板指数增长到 cap 就封顶，不溢出、不越过 cap', () => {
    expect(backoffCeiling(0, 100, 1000)).toBe(100);
    expect(backoffCeiling(1, 100, 1000)).toBe(200);
    expect(backoffCeiling(2, 100, 1000)).toBe(400);
    expect(backoffCeiling(3, 100, 1000)).toBe(800);
    expect(backoffCeiling(4, 100, 1000)).toBe(1000);
    expect(backoffCeiling(20, 100, 1000)).toBe(1000);
  });

  it('全抖动在 [0, ceiling] 内，且注入 rng 让"随机"变成可钉的确定边界', () => {
    expect(fullJitter(2, 100, 1000, () => 0)).toBe(0);
    expect(fullJitter(2, 100, 1000, () => 1)).toBe(400);
    expect(fullJitter(9, 100, 1000, () => 1)).toBe(1000); // cap 封顶
    // 越界 rng 被夹住，不会算出负延迟或超上界
    expect(fullJitter(1, 100, 1000, () => -3)).toBe(0);
    expect(fullJitter(1, 100, 1000, () => 99)).toBe(200);
  });

  it('同一 attempt 两个不同 rng 值得不同延迟——抖动确实在，不是定值伪装', () => {
    const a = jitterSchedule(4, { baseMs: 100, capMs: 1000 }, () => 0.1);
    const b = jitterSchedule(4, { baseMs: 100, capMs: 1000 }, () => 0.9);
    expect(a).toEqual([10, 20, 40, 80]);
    expect(b).toEqual([90, 180, 360, 720]);
    expect(a).not.toEqual(b);
  });
});

describe('有界 TTL + LRU 缓存（数据结构 · 内存/惊群）', () => {
  it('TTL 过期返回 expired，但值还在（供 stale 兜底），并由上层标 stale', () => {
    let t = 1000;
    const cache = new BoundedCache<string>({ maxEntries: 4, ttlMs: 500, now: () => t, clock: () => 'T' });
    cache.set('a', 'v1');
    expect(cache.get('a')?.expired).toBe(false);
    t = 1601; // > 500ms
    const stale = cache.get('a');
    expect(stale?.expired).toBe(true);
    expect(stale?.value).toBe('v1'); // 没删，stale 能端出
    expect(cache.stats().size).toBe(1);
  });

  it('有界：塞进 maxEntries+2 条，最久未用的被淘汰，size 不过上界', () => {
    const cache = new BoundedCache<number>({ maxEntries: 2, ttlMs: 9999, now: () => 0 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a 变最近用，b 成最久未用
    cache.set('c', 3);
    expect(cache.get('b')).toBeNull(); // b 被淘汰
    expect(cache.get('a')?.value).toBe(1);
    expect(cache.get('c')?.value).toBe(3);
    expect(cache.stats().size).toBe(2);
    expect(cache.stats().evictions).toBe(1);
  });

  it('singleflight：同键并发只跑一次 loader，后来者等同一发', async () => {
    const cache = new BoundedCache<number>({ maxEntries: 4, ttlMs: 9999, now: () => 0 });
    let loads = 0;
    const loader = async () => {
      loads += 1;
      await Promise.resolve();
      return 42;
    };
    const [a, b, c] = await Promise.all([cache.getOrLoad('k', loader), cache.getOrLoad('k', loader), cache.getOrLoad('k', loader)]);
    expect(loads).toBe(1);
    expect([a?.value, b?.value, c?.value]).toEqual([42, 42, 42]);
    expect(cache.stats().loads).toBe(1);
  });

  it('loader 抛错不写缓存、清掉在途标记，下一轮能重试', async () => {
    const cache = new BoundedCache<number>({ maxEntries: 4, ttlMs: 9999, now: () => 0 });
    let attempts = 0;
    const failing = async () => {
      attempts += 1;
      throw new Error('upstream down');
    };
    await expect(cache.getOrLoad('k', failing)).rejects.toThrow('upstream down');
    expect(cache.stats().size).toBe(0);
    expect(cache.stats().inFlight).toBe(0);
    const ok = await cache.getOrLoad('k', async () => 7);
    expect(ok.value).toBe(7);
    expect(attempts).toBe(1);
  });

  // §SC-49 clear × singleflight 在途回写泄漏：可控 deferred，精确钉住"清空发生在 loader 在途那一段"。
  /** 手动收放的 promise：resolve/reject 由判据在 clear 之后调用，制造真实的竞态窗口。 */
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  it('§SC-49 leader 在途被 clear：值照常交给调用者，但绝不复活成 size=1/loads=0 的假账', async () => {
    const cache = new BoundedCache<number>({ maxEntries: 4, ttlMs: 9999, now: () => 0 });
    const gate = deferred<number>();
    const pending = cache.getOrLoad('k', () => gate.promise);
    // 此刻 leader 在途：inflight 已登记、loads 已 ++，但 map 还没写
    expect(cache.stats().inFlight).toBe(1);
    expect(cache.stats().size).toBe(0);

    cache.clear(); // 在途期间清空
    expect(cache.stats().size).toBe(0);
    expect(cache.stats().inFlight).toBe(0); // clear 连 inflight 一起清了

    gate.resolve(42);
    const entry = await pending;
    expect(entry.value).toBe(42); // 等这一发的调用者拿到真值，不因 clear 变 undefined
    expect(cache.stats().size).toBe(0); // 旧世界的结果没写回来
    expect(cache.stats().loads).toBe(0); // 计数不复活、不自相矛盾
    expect(cache.stats().inFlight).toBe(0);
  });

  it('§SC-49 follower 与 leader 同属旧世代，一起被挡：两个调用者都拿值，map 仍空', async () => {
    const cache = new BoundedCache<number>({ maxEntries: 4, ttlMs: 9999, now: () => 0 });
    const gate = deferred<number>();
    let loaderCalls = 0;
    const loader = () => { loaderCalls += 1; return gate.promise; };
    const leader = cache.getOrLoad('k', loader);
    const follower = cache.getOrLoad('k', loader); // 复用同一在途 promise
    expect(cache.stats().loads).toBe(1); // singleflight：sync 段只登记一次 load
    await Promise.resolve(); // getOrLoad 把 loader 推到微任务，让出一次它才真正执行
    expect(loaderCalls).toBe(1); // follower 没再调 loader

    cache.clear();
    gate.resolve(7);
    const [a, b] = await Promise.all([leader, follower]);
    expect([a.value, b.value]).toEqual([7, 7]); // 两边都拿到真值
    expect(cache.stats().size).toBe(0); // 但没有任何一条写回（leader 与 follower 都捕获旧 gen）
    expect(cache.stats().loads).toBe(0);
  });

  it('§SC-49 失败 loader 在途被 clear：异常原样传，也不写回、不钉住在途', async () => {
    const cache = new BoundedCache<number>({ maxEntries: 4, ttlMs: 9999, now: () => 0 });
    const gate = deferred<number>();
    const pending = cache.getOrLoad('k', () => gate.promise);
    cache.clear();
    gate.reject(new Error('db down mid-clear'));
    await expect(pending).rejects.toThrow('db down mid-clear'); // 不吞、不变形
    expect(cache.stats().size).toBe(0);
    expect(cache.stats().inFlight).toBe(0);
    // clear 之后的新一发仍能正常加载写入，不被旧失败污染
    const ok = await cache.getOrLoad('k', async () => 9);
    expect(ok.value).toBe(9);
    expect(cache.get('k')?.value).toBe(9);
  });

  it('§SC-49 正常 clear 路径不回归：无在途时清空后重填照常写缓存、计数重来', async () => {
    const cache = new BoundedCache<number>({ maxEntries: 4, ttlMs: 9999, now: () => 0 });
    await cache.getOrLoad('k', async () => 1);
    expect(cache.get('k')?.value).toBe(1);
    expect(cache.stats().loads).toBe(1);
    cache.clear();
    expect(cache.stats().size).toBe(0);
    expect(cache.stats().loads).toBe(0);
    await cache.getOrLoad('k', async () => 2);
    expect(cache.get('k')?.value).toBe(2); // 新世代能正常写入
    expect(cache.stats().loads).toBe(1);
  });

  it('§SC-49 旧 leader 的 finally 不误删 clear 之后同键新发起的那一发', async () => {
    const cache = new BoundedCache<number>({ maxEntries: 4, ttlMs: 9999, now: () => 0 });
    const oldGate = deferred<number>();
    const oldPending = cache.getOrLoad('k', () => oldGate.promise);

    cache.clear(); // 旧一发在途时被清空
    const newGate = deferred<number>();
    const newPending = cache.getOrLoad('k', () => newGate.promise); // 同键、新世代、新在途
    expect(cache.stats().inFlight).toBe(1); // 只有新的那一发在途

    oldGate.resolve(1); // 旧一发姗姗来迟，其 finally 必须不碰新 inflight
    await oldPending;
    expect(cache.stats().inFlight).toBe(1); // 新的还挂着，没被旧的 finally 误删

    newGate.resolve(2);
    const entry = await newPending;
    expect(entry.value).toBe(2); // 新一发正常完成
    expect(cache.get('k')?.value).toBe(2); // 新世代正常写入
    expect(cache.stats().inFlight).toBe(0);
  });
});

describe('手写归一化（形状不认识 → null，不画 0）', () => {
  it('routes 行数与 total 对不上就是快照自相矛盾，读不出', () => {
    expect(normalizeRoutes({ measuredAt: 't', total: 2, routes: [{ id: 'a', uri: 'lb://a', order: 0 }], note: 'n' })).toBeNull();
    expect(normalizeRoutes({ measuredAt: 't', total: 1, routes: [{ id: 'a', uri: 'lb://a', order: 0 }], note: 'n' })).not.toBeNull();
    expect(normalizeRoutes(null)).toBeNull();
    expect(normalizeRoutes({ measuredAt: 't' })).toBeNull();
  });

  it('services 的 addresses 条数与 instances 对不上，读不出', () => {
    expect(normalizeServices({ measuredAt: 't', source: 's', total: 1, services: [{ id: 'a', instances: 2, addresses: ['x'] }], note: 'n' })).toBeNull();
    expect(normalizeServices({ measuredAt: 't', source: 's', total: 1, services: [{ id: 'a', instances: 1, addresses: ['x'] }], note: 'n' })).not.toBeNull();
  });

  it('health 的 status 必须是三种之一，实例总数要对得上', () => {
    const base = { measuredAt: 't', timeoutMs: 100, source: 's', allUp: true, instances: 1, note: 'n' };
    expect(normalizeHealth({ ...base, services: [{ id: 'a', up: true, instances: [{ uri: 'u', status: 'SIDEWAYS', httpStatus: 200, detail: null }] }] })).toBeNull();
    expect(normalizeHealth({ ...base, services: [{ id: 'a', up: true, instances: [{ uri: 'u', status: 'UP', httpStatus: 200, detail: null }] }] })).not.toBeNull();
    expect(normalizeHealth({ ...base, services: [{ id: 'a', up: true, instances: [] }] })).toBeNull();
  });

  it('只有 lb:// uri 抽得出 service id，直连 uri 不算发现语义', () => {
    expect(serviceIdFromUri('lb://nexus-api')).toBe('nexus-api');
    expect(serviceIdFromUri('http://127.0.0.1:8080')).toBeNull();
    expect(serviceIdFromUri(null)).toBeNull();
  });
});

/* ── join 验电夹具 ─────────────────────────────────────────────── */

const routes: RoutesReadout = {
  measuredAt: '2026-11-11T04:00:00Z',
  total: 2,
  routes: [
    { id: 'r-api', uri: 'lb://nexus-api', order: 0 },
    { id: 'r-domain', uri: 'lb://nexus-domain-service', order: 0 },
  ],
  note: 'route note',
};
const services: ServicesReadout = {
  measuredAt: '2026-11-11T04:00:01Z',
  source: 'simple',
  total: 3,
  services: [
    { id: 'nexus-api', instances: 1, addresses: ['http://a:1'] },
    { id: 'nexus-domain-service', instances: 1, addresses: ['http://d:1'] },
    { id: 'rogue-service', instances: 1, addresses: ['http://r:1'] },
  ],
  note: 'service note',
};
const health: HealthReadout = {
  measuredAt: '2026-11-11T04:00:02Z',
  timeoutMs: 1500,
  source: 'simple',
  allUp: false,
  instances: 3,
  services: [
    { id: 'nexus-api', up: true, instances: [{ uri: 'http://a:1', status: 'UP', httpStatus: 200, detail: null }] },
    { id: 'nexus-domain-service', up: false, instances: [{ uri: 'http://d:1', status: 'DOWN', httpStatus: 503, detail: 'answered HTTP 503' }] },
    { id: 'rogue-service', up: true, instances: [{ uri: 'http://r:1', status: 'UNKNOWN', httpStatus: null, detail: 'no answer' }] },
  ],
  note: 'health note',
};
const fresh = <T>(value: T): Readout<T> => ({
  state: 'fresh', value, measuredAt: (value as { measuredAt: string }).measuredAt, fetchedAt: '2026-11-11T04:00:03Z', ageMs: 0, note: '',
});
const input = (over: Partial<JoinInput> = {}): JoinInput => ({
  generatedAt: '2026-11-11T04:00:03Z',
  routes: fresh(routes),
  services: fresh(services),
  health: fresh(health),
  ...over,
});

describe('三表 join（语义核心 · 错处才是价值）', () => {
  it('注册了却没路由 = unrouted；记录了三种错配与各自 id', () => {
    const snap = joinSnapshot(input());
    const rogue = snap.services.find((s) => s.id === 'rogue-service');
    expect(rogue?.classification).toBe('unrouted');
    expect(rogue?.routeIds).toEqual([]);
    expect(rogue?.registeredInstances).toBe(1);
    const gap = snap.gaps.find((g) => g.kind === 'unrouted-service');
    expect(gap?.ids).toContain('rogue-service');
    // 三条 note 原样端出，不稀释
    expect(snap.notes.routes).toBe('route note');
    expect(snap.notes.services).toBe('service note');
    expect(snap.notes.health).toBe('health note');
  });

  it('路由指向却没注册 = dangling，不谎称健康', () => {
    const snap = joinSnapshot(input({
      services: fresh({ ...services, total: 1, services: [services.services[0]!] }),
      health: fresh({ ...health, total: 1, instances: 1, services: [health.services[0]!] }),
    }));
    expect(snap.services.find((s) => s.id === 'nexus-domain-service')?.classification).toBe('dangling');
    expect(snap.totals.danglingRoutes).toBe(1);
  });

  it('没测到的列画 null 不是 0：注册列 unavailable 时 registeredInstances=null', () => {
    const snap = joinSnapshot(input({
      services: { state: 'unavailable', value: null, measuredAt: null, fetchedAt: 't', ageMs: 0, note: '' },
    }));
    expect(snap.totals.services).toBeNull();
    expect(snap.totals.instances).toBeNull();
    for (const s of snap.services) expect(s.registeredInstances).toBeNull();
    expect(snap.gaps.some((g) => g.kind === 'column-unavailable' && g.column === 'services')).toBe(true);
  });

  it('健康列没测到 = NOT_MEASURED；UNKNOWN 绝不当 DOWN', () => {
    const snap = joinSnapshot(input({
      health: { state: 'unavailable', value: null, measuredAt: null, fetchedAt: 't', ageMs: 0, note: '' },
    }));
    expect(snap.services.every((s) => s.health === 'NOT_MEASURED')).toBe(true);
    // 健康在时，UNKNOWN 实例计入 unknownInstances，not downInstances
    const snap2 = joinSnapshot(input());
    expect(snap2.services.find((s) => s.id === 'rogue-service')?.health).toBe('UNKNOWN');
    expect(snap2.totals.unknownInstances).toBe(1);
    expect(snap2.totals.downInstances).toBe(1);
  });

  it('保守聚合：任一 DOWN 即 DOWN，全 UP 才 UP，空是 NOT_PROBED', () => {
    expect(aggregateHealth(['UP', 'UP'])).toBe('UP');
    expect(aggregateHealth(['UP', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(aggregateHealth(['UNKNOWN', 'DOWN'])).toBe('DOWN');
    expect(aggregateHealth([])).toBe('NOT_PROBED');
  });

  it('非原子快照如实登记：三列 measuredAt 各不同，不伪装成同一瞬间', () => {
    const snap = joinSnapshot(input());
    expect(snap.gaps.some((g) => g.kind === 'non-atomic' && g.note.includes(routes.measuredAt) && g.note.includes(health.measuredAt))).toBe(true);
  });

  it('stale 列在 columns 与 gaps 里都标出来，UI 才知道该打「旧」标', () => {
    const snap = joinSnapshot(input({
      routes: { state: 'stale', value: routes, measuredAt: routes.measuredAt, fetchedAt: 't', ageMs: 90_000, note: '' },
    }));
    expect(snap.columns.routes.state).toBe('stale');
    expect(snap.columns.routes.ageMs).toBe(90_000);
    expect(snap.gaps.some((g) => g.kind === 'stale-column' && g.column === 'routes')).toBe(true);
  });
});
