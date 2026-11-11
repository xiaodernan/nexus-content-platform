import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverResult } from '@/server/domain/social';
import type { DiscoverCache, DiscoverCacheDriver } from '@/server/cache/discoverRedis';
import {
  DISCOVER_INVALIDATION_CHANNEL,
  DISCOVER_INVALIDATION_FRAME_VERSION,
  MemoryInvalidationHub,
  MemoryInvalidationBus,
  RedisInvalidationBus,
  PUBLISH_OPTIONS,
  SUBSCRIBE_OPTIONS,
  parseInvalidationFrame,
  type InvalidationConnect,
  type InvalidationRedisConnection,
  type InvalidationConnectionOptions,
} from '@/server/cache/discoverInvalidation';
import { createDiscoverRouteCacheRuntime, type DiscoverRouteCacheRuntime } from '@/server/cache/discoverRouteCache';

/**
 * v670 / ADR 0102：**跨实例** discover anon 缓存失效门。
 *
 * 缺口是真的、此前所有单进程门都看不见：Redis 键跨实例共享，`generation`/`inFlight` 却不共享。
 * 实例 B 在 gen=G 开算，实例 A 上 publish 只 bump A 自己的代号并 DEL 共享键，B 的旧飞行落地时
 * 代号仍是 G，照常把 stale 结果 SET 回**共享**键——旧内容"复活"，"新发布 15s 内可见"被绕过。
 *
 * 这一片用**真的 `RedisInvalidationBus` 类**（只把底层 ioredis 换成共享 channel registry 的 fake
 * 连接）把两台机器跑在同一个 Node 进程里：compute 用可控 deferred、共享缓存用同一个 fake driver、
 * 线路用 fake pub/sub。于是"整条生产编排"——发布帧、订阅、回环过滤、代号 bump、旧飞行自我判定
 * 过期——是确定性可观察的，不连库、不连真 Redis、低内存宿主也跑得动。
 *
 * 最关键的是**反向对照**（`lineOpen=false`：两个实例各连一条互不相同的线路，等价于 pub/sub 断了
 * 或压根没接）：同样的时序下 stale **必然复活**。两条门走的是同一份业务代码、唯一变量是"线路
 * 通不通"——这证明正向门的绿来自真修复，而不是碰巧。
 */
const sample = (tag: string): DiscoverResult => ({
  sort: 'new',
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

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => vi.waitFor(() => Promise.resolve());

/** 一份 fake 共享缓存：两个 runtime 注入同一个实例，模拟 Redis 那把**跨实例共享**的 sort 键。 */
class SharedMemoryCache implements DiscoverCache {
  private readonly store = new Map<string, DiscoverResult>();
  clearCalls = 0;
  driver(): DiscoverCacheDriver {
    return 'memory';
  }
  async get(sort: string): Promise<DiscoverResult | undefined> {
    return this.store.get(sort);
  }
  async set(sort: string, value: DiscoverResult): Promise<void> {
    this.store.set(sort, value);
  }
  async clear(): Promise<void> {
    this.clearCalls += 1;
    this.store.clear();
  }
  async liveSize(): Promise<number> {
    return this.store.size;
  }
}

/** 共享 channel registry 的 fake Redis：把两台"机器"的 pub/sub 接在同一个进程里。 */
class FakeRedisRegistry {
  readonly connections: Array<{ role: string; options: InvalidationConnectionOptions }> = [];
  readonly made: FakeConnection[] = [];
  readonly publishes: Array<{ channel: string; payload: string }> = [];
  /** 让下一次 publish 当场失败，验证"总线坏了写业务请求照常返回"。 */
  failNextPublish = false;
  private readonly subscribers = new Map<string, Set<{ owner: FakeConnection; cb: (ch: string, p: string) => void }>>();

  addSubscriber(channel: string, owner: FakeConnection, cb: (ch: string, p: string) => void): void {
    let set = this.subscribers.get(channel);
    if (!set) {
      set = new Set();
      this.subscribers.set(channel, set);
    }
    set.add({ owner, cb });
  }

  removeSubscribersOf(owner: FakeConnection): void {
    for (const set of this.subscribers.values()) {
      for (const entry of set) if (entry.owner === owner) set.delete(entry);
    }
  }

  /** 同步扇出（真实 pub/sub 是异步，但这里要的是确定性；回环帧也照发，由接收方自己过滤）。 */
  fanout(channel: string, payload: string): number {
    let n = 0;
    for (const entry of this.subscribers.get(channel) ?? []) {
      entry.cb(channel, payload);
      n += 1;
    }
    return n;
  }

  connect: InvalidationConnect = (_url, role, options) => {
    const conn = new FakeConnection(this, role, options);
    this.connections.push({ role, options });
    this.made.push(conn);
    return conn;
  };
}

class FakeConnection implements InvalidationRedisConnection {
  status = 'ready';
  private messageCb?: (channel: string, payload: string) => void;
  private errorCb?: (error: Error) => void;
  private readonly joined = new Set<string>();

  constructor(
    private readonly reg: FakeRedisRegistry,
    readonly role: string,
    readonly options: InvalidationConnectionOptions,
  ) {}

  onMessage(cb: (channel: string, payload: string) => void): void {
    this.messageCb = cb;
  }
  onError(cb: (error: Error) => void): void {
    this.errorCb = cb;
  }
  async subscribe(channel: string): Promise<number> {
    this.reg.addSubscriber(channel, this, (ch, p) => this.messageCb?.(ch, p));
    this.joined.add(channel);
    return this.joined.size; // ioredis 实测回执是"该连接订了的频道数"
  }
  async publish(channel: string, payload: string): Promise<number> {
    if (this.reg.failNextPublish) {
      this.reg.failNextPublish = false;
      throw new Error('simulated redis publish failure');
    }
    this.reg.publishes.push({ channel, payload });
    return this.reg.fanout(channel, payload);
  }
  disconnect(): void {
    this.status = 'end';
    this.reg.removeSubscribersOf(this);
  }
  /** test seam：绕过 registry 直接喂一帧给这条 sub 连接（畸形帧门用）。 */
  deliver(channel: string, payload: string): void {
    this.messageCb?.(channel, payload);
  }
  emitError(error: Error): void {
    this.errorCb?.(error);
  }
}

interface World {
  sharedCache: SharedMemoryCache;
  runtimeA: DiscoverRouteCacheRuntime;
  runtimeB: DiscoverRouteCacheRuntime;
  busA: RedisInvalidationBus;
  busB: RedisInvalidationBus;
  registryA: FakeRedisRegistry;
  registryB: FakeRedisRegistry;
  subB: FakeConnection;
  /** 箭头函数属性而非方法：它会被整个交给 `openHandles.push`，用箭头绑定避免丢失 `this`。 */
  dispose: () => void;
}

/** 取某条 registry 造出的第 n 条 sub 连接（畸形帧门直接往它喂帧）。 */
function subConnectionOf(registry: FakeRedisRegistry, index = 0): FakeConnection {
  return registry.made.filter((c) => c.role === 'sub')[index]!;
}

/**
 * 造两台实例。`sharedLine=true`：两 bus 订同一个 registry（pub/sub 正常）；
 * `sharedLine=false`：各订一条 registry（线路断了 / 没接），共享缓存仍同一把——唯一的变量就是线路。
 */
async function makeWorld(sharedLine: boolean): Promise<World> {
  const registryA = new FakeRedisRegistry();
  const registryB = sharedLine ? registryA : new FakeRedisRegistry();
  const busA = new RedisInvalidationBus({ url: 'redis://fake/a', origin: 'inst-A', connect: registryA.connect });
  const busB = new RedisInvalidationBus({ url: 'redis://fake/b', origin: 'inst-B', connect: registryB.connect });
  // 等两条 sub 的 SUBSCRIBE 真正登记到 registry，再让任何 publish 发生。
  await Promise.all([busA.ready, busB.ready]);

  const sharedCache = new SharedMemoryCache();
  const runtimeA = createDiscoverRouteCacheRuntime({ cache: () => sharedCache, bus: busA });
  const runtimeB = createDiscoverRouteCacheRuntime({ cache: () => sharedCache, bus: busB });

  return {
    sharedCache,
    runtimeA,
    runtimeB,
    busA,
    busB,
    registryA,
    registryB,
    subB: subConnectionOf(registryB),
    dispose: () => {
      runtimeA.dispose();
      runtimeB.dispose();
      busA.dispose();
      busB.dispose();
    },
  };
}

const openHandles: Array<() => void> = [];
afterEach(() => {
  while (openHandles.length) openHandles.pop()?.();
  vi.restoreAllMocks();
});

describe('parseInvalidationFrame — 线路字节不可信（纯数据门）', () => {
  it('合法帧通过，字段原样带上', () => {
    const frame = { v: DISCOVER_INVALIDATION_FRAME_VERSION, origin: 'inst-A', at: 1234, nonce: 7 };
    expect(parseInvalidationFrame(JSON.stringify(frame))).toEqual(frame);
  });

  it('畸形 JSON / 非对象 / 版本不符 / origin 空 / at 或 nonce 非有限数，一律拒绝', () => {
    const good = { v: DISCOVER_INVALIDATION_FRAME_VERSION, origin: 'A', at: 1, nonce: 1 };
    expect(parseInvalidationFrame('{not json')).toBeNull();
    expect(parseInvalidationFrame('null')).toBeNull();
    expect(parseInvalidationFrame('42')).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ ...good, v: good.v + 1 }))).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ ...good, origin: '' }))).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ ...good, origin: 3 }))).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ ...good, at: 'x' }))).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ ...good, nonce: null }))).toBeNull();
    expect(parseInvalidationFrame(JSON.stringify({ v: good.v, origin: 'A', at: 1 }))).toBeNull(); // 缺 nonce
  });
});

describe('MemoryInvalidationHub / Bus — 进程内扇出与回环过滤', () => {
  it('A publish → B 收到一次、A 收不到自己的回环；退订后不再送达', () => {
    const hub = new MemoryInvalidationHub();
    const a = new MemoryInvalidationBus(hub, 'A');
    const b = new MemoryInvalidationBus(hub, 'B');
    let aGot = 0;
    let bGot = 0;
    const offA = a.subscribe(() => (aGot += 1));
    const offB = b.subscribe(() => (bGot += 1));

    a.publish();
    expect(aGot, '自己发的帧会回环，必须被 origin 过滤掉').toBe(0);
    expect(bGot, '别的实例该收到这一帧').toBe(1);
    expect(hub.listenerCount).toBe(2);

    offB();
    a.publish();
    expect(bGot, '退订后不该再收到').toBe(1);
    offA();
    expect(hub.listenerCount).toBe(0);
    a.dispose();
    b.dispose();
  });
});

describe('RedisInvalidationBus（真类 + fake 连接）— 生产编排', () => {
  it('发布/订阅两侧参数不对称：发布不排队不重试，订阅排队且无限自愈', async () => {
    const reg = new FakeRedisRegistry();
    const bus = new RedisInvalidationBus({ url: 'redis://fake/x', connect: reg.connect });
    await bus.ready;
    expect(reg.connections.map((c) => c.role)).toEqual(['pub', 'sub']);
    const pub = reg.connections.find((c) => c.role === 'pub')!.options;
    const sub = reg.connections.find((c) => c.role === 'sub')!.options;
    expect(pub).toEqual(PUBLISH_OPTIONS);
    expect(sub).toEqual(SUBSCRIBE_OPTIONS);
    expect(pub.enableOfflineQueue).toBe(false);
    expect(pub.maxRetriesPerRequest).toBe(1);
    expect(sub.enableOfflineQueue).toBe(true);
    expect(sub.maxRetriesPerRequest).toBeNull();
    bus.dispose();
  });

  it('A 发布的帧只让 B 的订阅者回调，A 自己不回环触发；帧落在专用版本化频道', async () => {
    const reg = new FakeRedisRegistry();
    const a = new RedisInvalidationBus({ url: 'redis://fake/a', origin: 'A', connect: reg.connect });
    const b = new RedisInvalidationBus({ url: 'redis://fake/b', origin: 'B', connect: reg.connect });
    await Promise.all([a.ready, b.ready]);
    let aGot = 0;
    let bGot = 0;
    a.subscribe(() => (aGot += 1));
    b.subscribe(() => (bGot += 1));

    a.publish();
    expect(aGot, '发的人本机已同步失效，不能再被自己的回环帧触发一次').toBe(0);
    expect(bGot).toBe(1);
    expect(reg.publishes).toHaveLength(1);
    expect(reg.publishes[0]!.channel, '必须是 discover 专用频道，不能混进 realtime 线路').toBe(DISCOVER_INVALIDATION_CHANNEL);
    const wire = parseInvalidationFrame(reg.publishes[0]!.payload)!;
    expect(wire.origin).toBe('A');
    expect(wire.v).toBe(DISCOVER_INVALIDATION_FRAME_VERSION);
    expect(wire.nonce).toBe(1);
    expect(b.stats().received).toBe(1);
    a.dispose();
    b.dispose();
  });

  it('畸形帧 / 陌生频道记账丢弃，不触发本地失效回调', async () => {
    const reg = new FakeRedisRegistry();
    const bus = new RedisInvalidationBus({ url: 'redis://fake/b', origin: 'B', connect: reg.connect });
    await bus.ready;
    let got = 0;
    bus.subscribe(() => (got += 1));
    const sub = subConnectionOf(reg);

    sub.deliver(DISCOVER_INVALIDATION_CHANNEL, 'not-json');
    sub.deliver('nexus:some-other-channel', JSON.stringify({ v: 1, origin: 'A', at: 1, nonce: 1 }));
    expect(got, '不可信帧绝不能触达本地失效').toBe(0);
    expect(bus.stats().errorCount, '两条坏帧都要有读数，不能静默').toBe(2);
    bus.dispose();
  });

  it('publish 当场失败也不抛，只记账——写业务请求不该被总线拖垮', async () => {
    const reg = new FakeRedisRegistry();
    const bus = new RedisInvalidationBus({ url: 'redis://fake/a', origin: 'A', connect: reg.connect });
    await bus.ready;
    reg.failNextPublish = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => bus.publish()).not.toThrow();
    await flush(); // 等 catch 里的计数落定
    expect(bus.stats().published).toBe(1);
    expect(bus.stats().errorCount).toBe(1);
    expect(spy).toHaveBeenCalled();
    bus.dispose();
  });

  it('订阅回执形状不认识 → ready=false（不把陌生回执读成成功）', async () => {
    const reg = new FakeRedisRegistry();
    const original = reg.connect;
    reg.connect = (url, role, options) => {
      const conn = original(url, role, options) as FakeConnection;
      if (role === 'sub') {
        const realSubscribe = conn.subscribe.bind(conn);
        conn.subscribe = async () => {
          await realSubscribe(DISCOVER_INVALIDATION_CHANNEL);
          return 'OK' as unknown as number; // ioredis 6 实测是数字，字符串是陌生形状
        };
      }
      return conn;
    };
    const bus = new RedisInvalidationBus({ url: 'redis://fake/x', connect: reg.connect });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await bus.ready;
    expect(bus.stats().wireReady).toBe(false);
    bus.dispose();
  });
});

/** 跨实例核心竞态：B 旧飞行在 A 失效后落地，是否会写回共享键（stale 复活）。 */
async function runStaleRace(sharedLine: boolean) {
  const world = await makeWorld(sharedLine);
  openHandles.push(world.dispose);
  const stale = pending<DiscoverResult>();
  let staleComputeCalls = 0;

  // 1) 实例 B 在 gen=G 开算一次 discover，compute 在途。
  const bFlight = world.runtimeB.cachedDiscoverAnonymous('new', async () => {
    staleComputeCalls += 1;
    return stale.promise;
  });
  await flush();
  expect(staleComputeCalls, 'B 的飞行应已登记开算').toBe(1);
  const genBefore = world.runtimeB.snapshot().generation;

  // 2) 实例 A 上 publish / 过审 → 失效 + 广播（线路通时 B 会收到）。
  await world.runtimeA.invalidateDiscoverRoute();

  return { world, stale, bFlight, genBefore };
}

describe('v670 核心：跨实例 stale-write / cache-resurrection', () => {
  it('线路通：A 失效广播让 B 的代号 bump，B 的旧飞行落地后不写回共享键', async () => {
    const { world, stale, bFlight, genBefore } = await runStaleRace(true);

    expect(world.runtimeB.snapshot().generation, 'B 的代号应被 A 的广播 bump——这是跨实例修复的直接证据')
      .toBe(genBefore + 1);
    expect(world.runtimeB.snapshot().inFlight, '别机失效应清空 B 的飞行表，让失效后的新请求另起一程').toBe(0);

    // 3) 旧计算落地：那份请求仍拿到自己的结果，不凭空失败。
    const staleAnswer = sample('stale');
    stale.resolve(staleAnswer);
    expect(await bFlight).toBe(staleAnswer);

    // 4) 关键：共享键没被迟到旧结果填回。
    expect(await world.sharedCache.get('new'), '共享键不该被 B 的迟到旧结果写回——否则旧内容复活').toBeUndefined();

    // 5) 失效后的新请求必须真的重算、拿到 fresh，而不是命中被回填的 stale。
    let freshCalls = 0;
    const fresh = sample('fresh');
    const next = await world.runtimeB.cachedDiscoverAnonymous('new', async () => {
      freshCalls += 1;
      return fresh;
    });
    expect(next).toBe(fresh);
    expect(freshCalls).toBe(1);
  });

  it('反向对照：线路断（各连各的 registry）时同样的时序 stale 必然复活', async () => {
    const { world, stale, bFlight, genBefore } = await runStaleRace(false);

    expect(world.runtimeB.snapshot().generation, '线路不通，B 的代号不该变——这正是修复前的行为').toBe(genBefore);

    const staleAnswer = sample('stale');
    stale.resolve(staleAnswer);
    expect(await bFlight).toBe(staleAnswer);

    // 因为 B 的代号没 bump，旧飞行照常写回共享键；下一位读者命中 stale。
    expect(await world.sharedCache.get('new'), '反向对照：没有广播，旧内容必然复活（证明正向门有牙）')
      .toEqual(staleAnswer);
    let freshCalls = 0;
    const next = await world.runtimeB.cachedDiscoverAnonymous('new', async () => {
      freshCalls += 1;
      return sample('fresh-should-not-run');
    });
    expect(freshCalls, '命中了被回填的 stale，新请求不再重算').toBe(0);
    expect(next.cards[0]!.publicationId).toBe('pub-stale');
  });

  it('总线 publish 失败：A 本地照样失效，写请求不 reject', async () => {
    const world = await makeWorld(true);
    openHandles.push(world.dispose);
    // 先在 A 缓存一份值
    await world.runtimeA.cachedDiscoverAnonymous('new', async () => sample('v1'));
    expect(await world.sharedCache.get('new')).toBeDefined();

    world.registryA.failNextPublish = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(world.runtimeA.invalidateDiscoverRoute(), '线路坏了也不能让写请求抛').resolves.toBeUndefined();
    expect(await world.sharedCache.get('new'), 'A 本地的 clear 仍执行了').toBeUndefined();
  });

  it('失效后的跨实例新请求不与别机旧飞行合并（各起各的 compute）', async () => {
    const world = await makeWorld(true);
    openHandles.push(world.dispose);
    const oldB = pending<DiscoverResult>();
    const bOld = world.runtimeB.cachedDiscoverAnonymous('new', async () => oldB.promise);
    await flush();

    await world.runtimeA.invalidateDiscoverRoute();

    const fresh = pending<DiscoverResult>();
    let freshCalls = 0;
    const bNew = world.runtimeB.cachedDiscoverAnonymous('new', async () => {
      freshCalls += 1;
      return fresh.promise;
    });
    await flush();
    expect(freshCalls, '别机失效清了 B 的飞行表，新请求必须另起一程而不是搭旧快照').toBe(1);

    const freshAnswer = sample('fresh2');
    fresh.resolve(freshAnswer);
    oldB.resolve(sample('old2'));
    expect(await bNew).toBe(freshAnswer);
    void bOld;
  });
});

describe('静态接线门 — 生产路径真的接了 pub/sub，不是没人用的常量', () => {
  it('invalidateDiscoverRoute 的写路径确实 publish，且是订阅了总线的 runtime 在跑', () => {
    const text = readFileSync(join(process.cwd(), 'apps/web/src/server/cache/discoverRouteCache.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(text, '失效写路径必须广播，否则别机代号不 bump').toMatch(/deps\.bus\.publish\(\)/);
    expect(text, 'runtime 必须构造即订阅别机失效').toMatch(/deps\.bus\.subscribe\(/);
    expect(text, '生产单例必须接 getDiscoverInvalidationBus，不能只接缓存驱动').toMatch(/bus:\s*getDiscoverInvalidationBus\(\)/);
  });

  it('生产驱动选择：设了 NEXUS_REDIS_URL 就构造 RedisInvalidationBus', () => {
    const text = readFileSync(join(process.cwd(), 'apps/web/src/server/cache/discoverInvalidation.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(text).toMatch(/new RedisInvalidationBus\(\{ url \}\)/);
    expect(text, '频道必须带版本段').toMatch(/nexus:discover-invalidate:v\d+/);
    expect(text, '两条连接都要挂 error 监听，否则连不上的 Redis 会带走进程').toMatch(/this\.pub\.onError/);
    expect(text).toMatch(/this\.sub\.onError/);
    expect(text, '订阅在构造即发出，不等第一个订阅者').toMatch(/this\.ready = this\.subscribeWire\(\)/);
  });

  it('两个写路径（publish / moderation）仍调用 invalidateDiscoverRoute', () => {
    for (const file of ['publish.ts', 'moderation.ts']) {
      const text = readFileSync(join(process.cwd(), 'apps/web/src/server/domain', file), 'utf8');
      expect(text, `${file} 的写路径不再失效 discover，新发布 15s 内可能不出现`).toMatch(/invalidateDiscoverRoute\(\)/);
    }
  });
});
