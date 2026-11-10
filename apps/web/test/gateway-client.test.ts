import { describe, expect, it } from 'vitest';
import {
  createGatewayClient,
  normalizeBaseUrl,
  type GatewayFetch,
  type SharedCache,
} from '../src/server/gateway/client';

/**
 * I/O 层判据：全部喂假 fetch + sleep(0)，零网络、零真实等待。
 * 钉的是计网与降级的**分类正确性**，不是某个具体延迟数——延迟由 backoff 那一片单独钉死。
 */

const ROUTES = { measuredAt: 't0', total: 1, routes: [{ id: 'r', uri: 'lb://nexus-api', order: 0 }], note: 'n' };
const SERVICES = { measuredAt: 't0', source: 's', total: 1, services: [{ id: 'nexus-api', instances: 1, addresses: ['http://a:1'] }], note: 'n' };
const HEALTH = {
  measuredAt: 't0',
  timeoutMs: 1500,
  source: 's',
  allUp: true,
  instances: 1,
  services: [{ id: 'nexus-api', up: true, instances: [{ uri: 'http://a:1', status: 'UP', httpStatus: 200, detail: null }] }],
  note: 'n',
};

/** 按路径回不同 JSON；任何一次调用都记下 url 与信号，供断言重试/扇出。 */
function fakeFetch(handler: (url: string, call: number) => { ok: boolean; status: number; body: unknown }): {
  fetch: GatewayFetch;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url) => {
      const n = calls.filter((c) => c === url).length + 1; // 这个 url 的第几次
      calls.push(url);
      const r = handler(url, n);
      return { ok: r.ok, status: r.status, json: async () => r.body };
    },
  };
}

const okFetch = fakeFetch((url) => {
  const body = url.includes('/routes') ? ROUTES : url.includes('/services') ? SERVICES : HEALTH;
  return { ok: true, status: 200, body };
});

function base(over: Partial<Parameters<typeof createGatewayClient>[0]> = {}) {
  return {
    baseUrl: 'http://gw:8080/',
    fetchImpl: okFetch.fetch,
    sleep: async () => {},
    now: () => 1000,
    clock: () => 'T',
    rng: () => 0.5,
    ...over,
  };
}

describe('取数客户端 · 计网分类', () => {
  it('baseUrl 去尾斜杠，不拼出 //platform/routes', () => {
    expect(normalizeBaseUrl('http://gw:8080/')).toBe('http://gw:8080');
    expect(normalizeBaseUrl('http://gw:8080///')).toBe('http://gw:8080');
    const f = fakeFetch(() => ({ ok: true, status: 200, body: ROUTES }));
    void createGatewayClient(base({ fetchImpl: f.fetch })).loadAll();
    expect(f.calls.every((u) => !u.includes('//platform'))).toBe(true);
  });

  it('三列并发扇出，各自命中自己的归一化（routes 不会被 health 的形状顶掉）', async () => {
    const client = createGatewayClient(base());
    const { routes, services, health } = await client.loadAll();
    expect(routes.state).toBe('fresh');
    expect(routes.value?.total).toBe(1);
    expect(services.value?.source).toBe('s');
    expect(health.value?.allUp).toBe(true);
  });

  it('5xx 退避重试到上限，全失败 → unavailable（value=null，不是空表）', async () => {
    let n = 0;
    const f = fakeFetch(() => {
      n += 1;
      return { ok: false, status: 503, body: null };
    });
    const client = createGatewayClient(base({ fetchImpl: f.fetch, maxAttempts: 3 }));
    const { routes } = await client.loadAll();
    expect(routes.state).toBe('unavailable');
    expect(routes.value).toBeNull();
    expect(routes.note).toContain('HTTP 503');
    // 只有 routes 列走了 3 次；services/health 也各 3 次（同款 503），合计 9
    expect(f.calls.length).toBe(9);
  });

  it('401 不重试：错钥匙开一百次门还是关的', async () => {
    let n = 0;
    const f = fakeFetch(() => {
      n += 1;
      return { ok: false, status: 401, body: null };
    });
    const client = createGatewayClient(base({ fetchImpl: f.fetch, maxAttempts: 5 }));
    await client.loadAll();
    expect(n).toBe(3); // 三列各打 1 次，绝不重试
  });

  it('坏形状不重试：同一份坏 JSON 再问多少次仍是坏的', async () => {
    let n = 0;
    const f = fakeFetch(() => {
      n += 1;
      return { ok: true, status: 200, body: { nonsense: true } };
    });
    const client = createGatewayClient(base({ fetchImpl: f.fetch, maxAttempts: 5 }));
    const { routes } = await client.loadAll();
    expect(n).toBe(3);
    expect(routes.state).toBe('unavailable');
    expect(routes.value).toBeNull();
  });

  it('部分失败隔离：health 挂了，routes/services 照样 fresh 并各自有值', async () => {
    const f = fakeFetch((url) =>
      url.includes('/health')
        ? { ok: false, status: 500, body: null }
        : { ok: true, status: 200, body: url.includes('/routes') ? ROUTES : SERVICES },
    );
    const client = createGatewayClient(base({ fetchImpl: f.fetch }));
    const snap = await client.loadAll();
    expect(snap.routes.state).toBe('fresh');
    expect(snap.services.state).toBe('fresh');
    expect(snap.health.state).toBe('unavailable');
    expect(snap.health.value).toBeNull();
  });

  it('网络错/超时也走重试且最终 unavailable', async () => {
    const f: GatewayFetch = async () => {
      throw new Error('boom');
    };
    const client = createGatewayClient(base({ fetchImpl: f, maxAttempts: 2 }));
    const { routes } = await client.loadAll();
    expect(routes.state).toBe('unavailable');
    expect(routes.note).toContain('网络错误或超时');
  });
});

describe('取数客户端 · 缓存与降级', () => {
  it('TTL 内第二次读同一列命中进程内缓存，不打网络（singleflight 之外的降载）', async () => {
    // 三列各回自己的形状：若都回 ROUTES，services/health 列归一化失败就不会写缓存，
    // 第二次自然会重打——那是读数的诚实行为（形状不对不缓存、不画 0），不是本用例要测的降载。
    const f = fakeFetch((url) => ({
      ok: true,
      status: 200,
      body: url.includes('/routes') ? ROUTES : url.includes('/services') ? SERVICES : HEALTH,
    }));
    const client = createGatewayClient(base({ fetchImpl: f.fetch, cacheTtlMs: 4000 }));
    await client.loadAll();
    const first = f.calls.length;
    await client.loadAll();
    expect(f.calls.length).toBe(first); // 第二次一发网络都没打：三列全命中缓存
  });

  it('上一轮成功、这一轮上游挂了 → 端出旧值并标 stale，不画 0', async () => {
    // 第一轮全成功（写缓存），TTL 过期后第二次让 routes 列变 500。
    // 时间由注入的 now 驱动，不 sleep——判据要的是确定，不是等真实时钟。
    let t = 0;
    let routesDown = false;
    const switchFetch: GatewayFetch = async (url) => {
      if (url.includes('/routes') && routesDown) return { ok: false, status: 500, json: async () => null };
      const body = url.includes('/routes') ? ROUTES : url.includes('/services') ? SERVICES : HEALTH;
      return { ok: true, status: 200, json: async () => body };
    };
    const client = createGatewayClient(base({ fetchImpl: switchFetch, now: () => t, cacheTtlMs: 1000, maxAttempts: 1 }));
    const first = await client.loadAll();
    expect(first.routes.state).toBe('fresh');
    t = 2000; // TTL 过期
    routesDown = true;
    const second = await client.loadAll();
    expect(second.routes.state).toBe('stale');
    expect(second.routes.value?.total).toBe(1); // 旧值还在，不是 0、不是 null
    expect(second.routes.note).toContain('旧快照');
  });

  it('首次就挂、没有任何旧值 → unavailable（不是 stale，因为没有旧事实可端）', async () => {
    const f = fakeFetch((url) =>
      url.includes('/routes') ? { ok: false, status: 500, body: null } : { ok: true, status: 200, body: url.includes('/services') ? SERVICES : HEALTH },
    );
    const client = createGatewayClient(base({ fetchImpl: f.fetch, maxAttempts: 1 }));
    const { routes } = await client.loadAll();
    expect(routes.state).toBe('unavailable');
    expect(routes.value).toBeNull();
  });
});

describe('共享缓存 · opt-in 与 fail-open（Redis）', () => {
  it('共享缓存命中且形状对 → fresh，不打网络', async () => {
    const f = fakeFetch(() => ({ ok: true, status: 200, body: ROUTES }));
    const shared: SharedCache = {
      async get(key) {
        return { value: JSON.stringify({ value: ROUTES, measuredAt: 'shared-t' }), storedAtMs: 1, storedAt: 'S' };
      },
      async set() {},
    };
    const client = createGatewayClient(base({ fetchImpl: f.fetch, shared }));
    const { routes } = await client.loadAll();
    expect(routes.state).toBe('fresh');
    expect(routes.measuredAt).toBe('shared-t');
  });

  it('共享缓存里是坏形状 → 当没命中，回退到直接问网关', async () => {
    const f = fakeFetch(() => ({ ok: true, status: 200, body: ROUTES }));
    const shared: SharedCache = {
      async get() {
        return { value: 'null', storedAtMs: 1, storedAt: 'S' }; // JSON.parse → null
      },
      async set() {},
    };
    const client = createGatewayClient(base({ fetchImpl: f.fetch, shared }));
    const { routes } = await client.loadAll();
    expect(routes.state).toBe('fresh');
    expect(f.calls.length).toBeGreaterThan(0); // 确实回退打了网关
  });

  it('Redis 线路断了：get/set 抛错被吞，读数照样 fresh，describe 记下 fallback', async () => {
    const client = createGatewayClient(
      base({
        shared: {
          async get() {
            throw new Error('ECONNREFUSED');
          },
          async set() {
            throw new Error('ECONNREFUSED');
          },
        },
      }),
    );
    const { routes } = await client.loadAll();
    expect(routes.state).toBe('fresh'); // fail-open：没被 Redis 拖垮
    expect(routes.value?.total).toBe(1);
    const d = client.describe();
    expect(d.shared.driver).toBe('redis');
    expect(d.shared.fallbacks).toBeGreaterThan(0);
    expect(d.shared.lastError).toContain('ECONNREFUSED');
  });

  it('没设共享缓存时 driver=in-process，lastError 恒 null', () => {
    const d = createGatewayClient(base()).describe();
    expect(d.shared.driver).toBe('in-process');
    expect(d.shared.lastError).toBeNull();
    expect(d.baseUrl).toBe('http://gw:8080');
  });
});
