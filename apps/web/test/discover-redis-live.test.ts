import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { Redis } from 'ioredis';
import {
  RedisInvalidationBus,
  DISCOVER_INVALIDATION_CHANNEL,
  type DiscoverInvalidationStats,
} from '@/server/cache/discoverInvalidation';

/**
 * v674 / ADR 0107 — **真 Redis 端到端门**（opt-in，`NEXUS_REDIS_URL` 设了才跑）。
 *
 * fake-connection 门钉的是协议路径（PUBLISH/SUBSCRIBE 的 Lua 形状、回环过滤、三层分流）；
 * 它们永远看不见的东西正是它们钉不了的原因：ioredis 连接串解析、真频道扇出、真 "READY" 时序、
 * RESP 帧负载边界。这一族测试只在 `NEXUS_REDIS_URL` 显式设了时才活——CI 里没有 Redis，
 * 这文件里每个用例会以 skipped 上报；本机（nexus-redis on 56379）跑它来兑现 ADR 0107 的
 * "真 Redis 端到端路径 UNPROVEN" 欠账。
 *
 * 安全约束：频道名带 :v1 版本段，订阅的是唯一失效频道；测试从不读写任何别的键；
 * 用完 dispose 双向连接，不留悬挂 ioredis socket。
 */

const LIVE_URL = (process.env.NEXUS_REDIS_URL ?? '').trim();
const describeLive = describe.skipIf(LIVE_URL.length === 0);

// 单条 helper：轮询直到期望发生或逾期（pub/sub 扇出没有同步点，只能等）。
async function waitFor(
  predicate: () => boolean,
  deadlineMs = 3_000,
  stepMs = 15,
): Promise<boolean> {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return predicate();
}

describeLive('discover invalidation × 真 Redis（opt-in：NEXUS_REDIS_URL）', () => {
  const buses: RedisInvalidationBus[] = [];
  let publisher: Redis;

  const mkBus = (origin: string, futurePolicy?: 'degrade-to-ttl' | 'fail-safe-invalidate') => {
    const bus = new RedisInvalidationBus({
      url: LIVE_URL,
      origin,
      ...(futurePolicy !== undefined ? { futurePolicy } : {}),
    });
    buses.push(bus);
    return bus;
  };

  beforeAll(async () => {
    publisher = new Redis(LIVE_URL, { lazyConnect: true, connectTimeout: 2_000 });
    await publisher.connect();
    const pong = await publisher.ping();
    expect(pong, 'CI 外显式打开 NEXUS_REDIS_URL 却连不上——这不是跳过，是误点化；关掉环境或修 Redis').toBe('PONG');
  });

  afterAll(async () => {
    for (const bus of buses.splice(0)) bus.dispose();
    if (publisher) await publisher.quit();
  });

  it('真频道扇出：A 发布 → B 收到；A 本轮不触发自己（回环过滤对真线路成立）', async () => {
    const busA = mkBus('live-A');
    const busB = mkBus('live-B');
    await Promise.all([busA.ready, busB.ready]);

    let aCount = 0;
    let bCount = 0;
    busA.subscribe(() => { aCount += 1; });
    busB.subscribe(() => { bCount += 1; });

    busA.publish();

    expect(await waitFor(() => bCount === 1), 'B 应在 3s 内收到 A 的真失效帧').toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(aCount, 'A 不该被自己的帧触发（回环过滤对真线路成立）').toBe(0);
    expect(busA.stats().wireReady).toBe(true);
    expect(busB.stats().currentFrames).toBe(1);
  });

  it('真 fail-safe-invalidate：v2 合法意图帧（原始字节）→ 保守实例失效一次；degrade 实例不动', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const safeBus = mkBus('live-safe', 'fail-safe-invalidate');
    const stayBus = mkBus('live-stay', 'degrade-to-ttl');
    await Promise.all([safeBus.ready, stayBus.ready]);

    let safeCount = 0;
    let stayCount = 0;
    safeBus.subscribe(() => { safeCount += 1; });
    stayBus.subscribe(() => { stayCount += 1; });

    const v2 = JSON.stringify({ v: 2, origin: 'v2-peer', schema: 'free-form' });
    await publisher.publish(DISCOVER_INVALIDATION_CHANNEL, v2);

    expect(await waitFor(() => safeCount === 1), 'fail-safe 实例应保守失效一次').toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(stayCount, 'degrade-to-ttl 实例读不懂不失效——默认行为 = v670').toBe(0);

    const safeStats: DiscoverInvalidationStats = safeBus.stats();
    const stayStats: DiscoverInvalidationStats = stayBus.stats();
    expect(safeStats.futureFrames).toBe(1);
    expect(safeStats.errorCount).toBe(0);
    expect(stayStats.futureFrames).toBe(1);
    expect(stayStats.errorCount).toBe(0);
  });

  it('真 rejected：畸形字节进不到本地失效，且该实例 errorCount 如实 +1', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = mkBus('live-bad');
    await bus.ready;

    let got = 0;
    bus.subscribe(() => { got += 1; });
    await publisher.publish(DISCOVER_INVALIDATION_CHANNEL, 'this is not a frame at all');

    expect(await waitFor(() => bus.stats().rejectedFrames === 1), '畸形帧应被 rejected 计数捕获').toBe(true);
    expect(got, '畸形字节不该触达任何本地失效回调').toBe(0);
    expect(bus.stats().errorCount).toBe(1);
  });
});
