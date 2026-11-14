import { afterEach, describe, expect, it } from 'vitest';
import { createRedisInvalidationBus, type InvalidationBus } from '../src/server/domain/invalidation-bus';
// 注：fail-open（连不上的 Redis）不依赖真线路，已由 invalidation-bus.test.ts 用假连接确定性覆盖；
// 本文件只放"必须真 Redis 才能证"的端到端往返，避免把纯单测塞进 opt-in 层。
import {
  createIsolatedDiscoverCacheForTest,
  resetDiscoverCacheForTest,
  type IsolatedDiscoverCache,
} from '../src/server/domain/discover-cache';
import type { DiscoverResult, DiscoverSort } from '../src/server/domain/social';

/**
 * §SC-42 的**真 Redis 往返**层：跨实例失效在线路上的端到端证明。打真 Redis 容器（默认 56379），
 * 不 mock 线路——这一格唯一要证的就是"两条独立 bus 各自的订阅能不能经真 Redis 连起来"。
 *
 * **opt-in**：默认不跑。设 `NEXUS_DISCOVER_BUS_LIVE=1` 才启用。理由（不粉饰）：
 * - 隐私正确性已由 `discover-cache.multi-instance.test.ts`（内存 hub、确定性）与
 *   `discover-cache.integration.test.ts`（真 Postgres、三条写路径）守住，不把隐私压在一条
 *   会丢帧、会重连、Docker 死了端口仍 LISTENING 假绿的网络上；
 * - 这一层只验"线路通不通"，且真 Redis 驱动有 vitest 退出 hang 的历史，故显式 opt-in、
 *   严格 disconnect 收摊，绝不让它悄悄拖慢/拖挂日常全仓测试。
 *
 * 取舍与边界见 `docs/adr/0114`（跨实例是最终一致，不是隐私强一致）。
 */
const LIVE_ENV = 'NEXUS_DISCOVER_BUS_LIVE';
const REDIS_URL = process.env['NEXUS_REDIS_URL']?.trim() || 'redis://127.0.0.1:56379';
const describeLive = process.env[LIVE_ENV] === '1' ? describe : describe.skip;

const openedBuses: InvalidationBus[] = [];
const openedStores: IsolatedDiscoverCache[] = [];

async function makeStore(): Promise<IsolatedDiscoverCache> {
  const bus = await createRedisInvalidationBus({ url: REDIS_URL });
  openedBuses.push(bus);
  const store = createIsolatedDiscoverCacheForTest({ bus, ttlMs: 600_000 });
  openedStores.push(store);
  return store;
}

function loader(label: string): () => Promise<DiscoverResult> {
  let calls = 0;
  return async () => {
    calls += 1;
    return {
      sort: 'new' as DiscoverSort,
      cards: [{ path: `${label}-${calls}` } as DiscoverResult['cards'][number]],
      unavailable: [],
      hiddenAuthors: 0,
      method: null,
    };
  };
}

afterEach(() => {
  // 三道保险：退订 + dispose 两条连接（disconnect 不用 quit）+ 复位全局 store，防 hang 住 vitest 退出。
  for (const store of openedStores) store.dispose();
  openedStores.length = 0;
  for (const bus of openedBuses) bus.dispose();
  openedBuses.length = 0;
  resetDiscoverCacheForTest({ bus: null });
});

describeLive('跨实例失效 · 真 Redis 往返（opt-in，设 NEXUS_DISCOVER_BUS_LIVE=1 启用）', () => {
  it(
    '实例 A 失效 → 经真 Redis → 实例 B 的 generation bump，B 下次读重新查库',
    async () => {
      const a = await makeStore();
      const b = await makeStore();
      const input = { sort: 'new' as const, viewerId: `live-${Date.now()}`, limit: 24 };
      const bLoad = loader('B');
      await b.load(input, bLoad);

      const bKeyBefore = b.keyFor(input);
      // 订阅登记有竞态：先给线路一点时间把 SUBSCRIBE 落定，再发帧。用有界 poll 而不是裸 sleep。
      // 若第一帧在 B 订上之前发出会丢（pub/sub 不补发，这一格明确接受），故重试发帧直到 bump。
      const deadline = Date.now() + 10_000;
      while (b.keyFor(input) === bKeyBefore && Date.now() < deadline) {
        a.invalidate(input.viewerId!);
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(b.keyFor(input)).not.toBe(bKeyBefore); // 最终一致性：帧终会到达
      await b.load(input, bLoad);
      // B 重新查库（loads 增加），不再吃失效前的旧视图
      expect(b.stats().loads).toBeGreaterThanOrEqual(2);
      // 线路读数证明帧真的走了 Redis（发布 >0，接收 >0，回环未误记）
      expect(a.stats().bus?.published).toBeGreaterThanOrEqual(1);
      expect(b.stats().bus?.received).toBeGreaterThanOrEqual(1);
    },
    30_000,
  );
});
