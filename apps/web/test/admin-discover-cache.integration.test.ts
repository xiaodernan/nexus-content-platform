import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { GET as getDiscoverCache } from '../src/app/api/admin/discover-cache/route';
import { isKnownReadout } from '../src/app/admin/discover-cache/discover-view';
import {
  describeDiscoverCache,
  discoverCacheStats,
  DISCOVER_INVALIDATION_URL_ENV,
  invalidateDiscoverGlobally,
  loadDiscoverCached,
  resetDiscoverCacheForTest,
} from '../src/server/domain/discover-cache';
import type { InvalidationBus, InvalidationBusStats } from '../src/server/domain/invalidation-bus';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { sessions, users } from '../src/server/db/schema';

/**
 * §SC-43：`GET /api/admin/discover-cache` 的**路由层**门与诚实，门打真库、读数走进程内存。
 *
 * 与 `/admin/gateway` 同口径，这一份钉住路由层自己那几件在纯判据 / 域测里看不见的事：
 *
 * 1. **默认拒绝**：没登录 401、非 role=admin 403，且 403 一格缓存账都不外泄
 *    （内部缓存了多少 viewer 的键、总线收发多少帧，是运维拓扑，不是公开状态页）。
 * 2. **`bus:null` 原样端出**：单机/未接总线在 JSON 里就是 `null` 与 `busAttached=false`，
 *    route 绝不把它二次加工成 published/received/errors/applied 四个 0——那正是整片在防的谎。
 *    反过来，bus 已接时四账也原样端出，形状门 `isKnownReadout` 认得它，前后端闭环。
 * 3. **`no-store`**：读数带 measuredAt，是"此刻这一台"的事实；网络层缓存它等于把旧读数冒充此刻。
 * 4. **读数不打库**：`describeDiscoverCache()` 是进程内同步账，问一次不该触发任何发现页加载
 *    （运维面板不能反过来变成一次发现页查询）。用 `stats.loads` 前后不变见证。
 *
 * 读数本身不碰库，但门要真查 session，故沿用其余 admin route 集成测的真库夹具。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(user: { id: string }): Promise<string> {
  const token = `disco-cache-tok-${user.id}`;
  await getDb()
    .insert(sessions)
    .values({ userId: user.id, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string | null): void {
  jar.clear();
  if (token) jar.set(SESSION_COOKIE, token);
}

/** 临时设/清 Redis 旋钮，finally 还原，不与同仓其它测试抢 process.env。 */
async function withRedisUrl(url: string | undefined, run: () => Promise<void>): Promise<void> {
  const before = process.env[DISCOVER_INVALIDATION_URL_ENV];
  if (url === undefined) delete process.env[DISCOVER_INVALIDATION_URL_ENV];
  else process.env[DISCOVER_INVALIDATION_URL_ENV] = url;
  try {
    await run();
  } finally {
    if (before === undefined) delete process.env[DISCOVER_INVALIDATION_URL_ENV];
    else process.env[DISCOVER_INVALIDATION_URL_ENV] = before;
  }
}

/** 最小假总线替身：只读四账、无连接、dispose 幂等，判定据注入，绝不连真 Redis。 */
function fakeBus(stats: InvalidationBusStats): InvalidationBus {
  return {
    publish: () => {},
    subscribe: () => () => {},
    dispose: () => {},
    stats: () => stats,
  };
}

let regular: { id: string };
let admin: { id: string };
let regularToken: string;
let adminToken: string;

beforeAll(async () => {
  const stamp = Date.now();
  const db = getDb();
  const [u1] = await db
    .insert(users)
    .values({ displayName: '发现缓存门-普通人', email: `disco-cache+plain+${stamp}@nexus.test` })
    .returning({ id: users.id });
  const [u2] = await db
    .insert(users)
    .values({ displayName: '发现缓存门-审核员', email: `disco-cache+admin+${stamp}@nexus.test`, role: 'admin' })
    .returning({ id: users.id });
  regular = u1!;
  admin = u2!;
  regularToken = await identityFor(regular);
  adminToken = await identityFor(admin);
});

afterAll(async () => {
  const db = getDb();
  // users 级联带走 sessions，不留一行测试身份
  await db.delete(users).where(inArray(users.id, [regular.id, admin.id]));
  resetDiscoverCacheForTest({ bus: null }); // 收掉可能挂过的假 bus，免得污染同 worker 后续文件
});

describe('§SC-43 读数入口的门', () => {
  it('没登录 → 401，且不给任何缓存账', async () => {
    asUser(null);
    const res = await getDiscoverCache();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
    expect(body.stats).toBeUndefined();
  });

  it('不是 role=admin → 403，一格内部账都不外泄', async () => {
    asUser(regularToken);
    const res = await getDiscoverCache();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.message).toContain('role=admin');
    expect(body.stats).toBeUndefined();
    expect(body.measuredAt).toBeUndefined();
    expect(body.busAttached).toBeUndefined();
  });
});

describe('§SC-43 读数原样端出与诚实', () => {
  it('admin → 200 + no-store；读数形状过前端形状门，且不触发一次发现页加载', async () => {
    await withRedisUrl(undefined, async () => {
      resetDiscoverCacheForTest({ bus: null });
      asUser(adminToken);
      const loadsBefore = discoverCacheStats().loads;
      const res = await getDiscoverCache();
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.json();
      // 后端原样端出的东西，前端形状门认得——前后端闭环
      expect(isKnownReadout(body)).toBe(true);
      expect(typeof body.measuredAt).toBe('string');
      expect(discoverCacheStats().loads).toBe(loadsBefore); // 读数不是一次发现页查询
    });
  });

  it('单机：bus=null 与 busAttached=false 原样保留，绝不抹成 published/received/errors/applied 四个 0', async () => {
    await withRedisUrl(undefined, async () => {
      resetDiscoverCacheForTest({ bus: null });
      asUser(adminToken);
      const body = await (await getDiscoverCache()).json();
      expect(body.stats.bus).toBeNull();
      expect(body.busAttached).toBe(false);
      expect(body.busUrlConfigured).toBe(false);
      // 真反证：route 若把 null 抹成 { published:0, ... }，这里就变成 0 而红
      expect(body.stats.bus?.published).toBeUndefined();
    });
  });

  it('设了 Redis 地址但总线还没异步接上：busUrlConfigured=true、busAttached=false，两种状态分开报', async () => {
    await withRedisUrl('redis://127.0.0.1:1', async () => {
      resetDiscoverCacheForTest({ bus: null }); // 显式 null：强制单机，绝不真连那条地址
      asUser(adminToken);
      const body = await (await getDiscoverCache()).json();
      expect(body.busUrlConfigured).toBe(true); // 配了旋钮
      expect(body.busAttached).toBe(false); // 但此刻没接上
      expect(body.stats.bus).toBeNull();
    });
  });

  it('bus 已接：四账原样端出、busAttached=true，形状门照样认得（不被 null 分支吞掉）', async () => {
    await withRedisUrl('redis://127.0.0.1:1', async () => {
      const four = { published: 5, received: 3, errors: 1, applied: 3 };
      resetDiscoverCacheForTest({ bus: fakeBus(four) });
      asUser(adminToken);
      const res = await getDiscoverCache();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.busAttached).toBe(true);
      expect(body.stats.bus).toEqual(four); // 原样，不加工、不抹平
      expect(isKnownReadout(body)).toBe(true);
    });
  });

  it('门面与 route 同源：describeDiscoverCache() 的读数就是 200 的 JSON（route 不偷偷改一个字）', async () => {
    await withRedisUrl(undefined, async () => {
      resetDiscoverCacheForTest({ bus: null });
      asUser(adminToken);
      const direct = describeDiscoverCache();
      const body = await (await getDiscoverCache()).json();
      expect(body.stats).toEqual(direct.stats);
      expect(body.busAttached).toBe(direct.busAttached);
      expect(body.busUrlConfigured).toBe(direct.busUrlConfigured);
    });
  });

  it('§SC-45 全局失效后 waves / waveConfig 端到端可见，形状门认得，读数动作本身不打库', async () => {
    await withRedisUrl(undefined, async () => {
      resetDiscoverCacheForTest({ bus: null, waveWindowMs: 15_000, waveCapacity: 12 });
      asUser(adminToken);
      invalidateDiscoverGlobally(); // 制造一个真实全局失效波
      const loadsBefore = discoverCacheStats().loads;
      const res = await getDiscoverCache();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(isKnownReadout(body)).toBe(true); // 前后端形状门闭环，含新字段
      expect(body.stats.waves).toHaveLength(1); // 波原样端出
      expect(body.stats.waves[0].epoch).toBe(body.stats.globalEpoch);
      expect(body.stats.waveConfig).toEqual({ windowMs: 15_000, capacity: 12 });
      expect(discoverCacheStats().loads).toBe(loadsBefore); // 面板读数不是一次发现页查询
    });
  });

  it('§SC-46 上游失败降级后 staleServed 端到端可见，形状门认得，读数动作本身不打库', async () => {
    await withRedisUrl(undefined, async () => {
      let clock = 1_000;
      resetDiscoverCacheForTest({ bus: null, ttlMs: 1_000, staleMaxMs: 5_000, now: () => clock });
      asUser(adminToken);
      const ok = async () => ({ sort: 'new' as const, cards: [{ publicationId: 'p', path: '/p', name: 'n', owner: 'o', handle: null, publishedAt: '2026-01-01T00:00:00.000Z', views: 0, likes: 0, comments: 0, remixes: 0, kind: 'website' as const, coverAssetId: null, ownerHandle: null }], unavailable: [], hiddenAuthors: 0, method: null });
      const fail = async (): Promise<Awaited<ReturnType<typeof ok>>> => { throw new Error('db down'); };
      await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, ok); // 成功填充
      clock += 1_200; // 过 TTL
      await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, fail); // 上游失败 → 端旧页
      expect(discoverCacheStats().staleServed).toBe(1);

      const loadsBefore = discoverCacheStats().loads;
      const res = await getDiscoverCache();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(isKnownReadout(body)).toBe(true); // 前后端形状门闭环，含 staleServed / staleMaxMs
      expect(body.stats.staleServed).toBe(1); // 降级次数原样端出
      expect(body.stats.config.staleMaxMs).toBe(5_000); // 上界秒数的分母
      expect(discoverCacheStats().loads).toBe(loadsBefore); // 面板读数不是一次发现页查询
    });
  });

  it('§SC-47 慢 loader 的墙钟耗时端到端可见，形状门认得，读数动作本身不打库', async () => {
    await withRedisUrl(undefined, async () => {
      let clock = 1_000;
      resetDiscoverCacheForTest({ bus: null, ttlMs: 600_000, slowLoadMs: 50, loadSampleCapacity: 4, now: () => clock });
      asUser(adminToken);
      const slow = async () => {
        clock += 137; // 受控时钟推进 137ms（超 50ms 阈值），不 sleep
        return { sort: 'new' as const, cards: [{ publicationId: 'p', path: '/p', name: 'n', owner: 'o', handle: null, publishedAt: '2026-01-01T00:00:00.000Z', views: 0, likes: 0, comments: 0, remixes: 0, kind: 'website' as const, coverAssetId: null, ownerHandle: null }], unavailable: [], hiddenAuthors: 0, method: null };
      };
      await loadDiscoverCached({ sort: 'new', viewerId: 'A' }, slow);
      expect(discoverCacheStats().maxLoadMs).toBe(137);

      const loadsBefore = discoverCacheStats().loads;
      const res = await getDiscoverCache();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(isKnownReadout(body)).toBe(true); // 前后端形状门闭环，含新计数与 recentLoads
      expect(body.stats.loadsTimed).toBe(1);
      expect(body.stats.maxLoadMs).toBe(137); // 墙钟原样端出
      expect(body.stats.slowLoads).toBe(1);
      expect(body.stats.recentLoads).toHaveLength(1);
      expect(body.stats.recentLoads[0]).toMatchObject({ durationMs: 137, ok: true });
      expect(body.stats.config.slowLoadMs).toBe(50);
      expect(body.stats.config.loadSampleCapacity).toBe(4);
      expect(discoverCacheStats().loads).toBe(loadsBefore); // 面板读数不是一次发现页查询
    });
  });
});
