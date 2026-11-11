/**
 * `/api/discover` anon 缓存的**跨实例失效广播**（Redis pub/sub）。
 *
 * ## 缺口（为什么需要这一层）
 * `discoverRedis.ts` 让三个 sort 键在实例之间共享（Redis 驱动），但 `discoverRouteCache.ts`
 * 的 `generation` 与 `inFlight` 是 **process-local**。于是有一个所有单进程测试都看不见的真竞态：
 *
 *   1. 实例 B 在本地 generation=G 开算一次 discover，compute 在途（flightB 登记进 B 的 inFlight）。
 *   2. 实例 A 上有人 publish / 过审，A bump **自己的** generation、清 **自己的** inFlight、
 *      `DEL` 共享 Redis 键。
 *   3. B 的旧 compute 落地——B 的本地 generation 仍是 G，于是照常把 **stale** 结果 `SET` 回共享键。
 *   4. A 刚删掉的旧内容在 15s 窗口里"复活"，"新发布 15s 内可见"的承诺被绕过。
 *
 * 关键：B 自己那道 generation guard **挡不住这件事**——它只比较 B 自己的代号，而失效发生在 A。
 * Redis 键共享、失效状态不共享，就是隐蔽之处。
 *
 * ## 修法：把"窗口失效"这件事实广播给每个实例
 * 写路径除了本地 bump/clear，再 `PUBLISH` 一条失效帧到一个**专用版本化频道**；每个进程订阅它，
 * 收到就执行**同一套**本地失效（bump generation + 清 inFlight + 清 cache 驱动）。于是两道防线合起来
 * 才闭合：
 *   - 本实例 generation guard：挡住"失效前开算、失效后才落地"的**自己**的旧 flight；
 *   - 别机失效广播：让 B 的代号也 bump，从而挡住 B 的旧 flight 写回**共享**键。
 *
 * ## 设计纪律（与 `realtime/redisBus.ts` 同源）
 * - **两条连接**：订阅连接进入 subscriber 模式后不能再发普通命令，故 `publish` 另起一条。
 * - **不对称参数**：发布侧不排队、不重试（发失效的是一条写业务请求，不该等线路）；订阅侧允许
 *   排队、`maxRetriesPerRequest: null`（Redis 晚起来也要自动订上，否则"重启窗口里没赶上趟的实例
 *   永远收不到别机失效"）。
 * - **publish 永不抛**：连不上只让 `errorCount` 动一下 + 记日志，把正在写库的请求放过去。总线
 *   不能比它服务的业务更脆弱。一致性由 15s TTL 兜底（见下）。
 * - **线路字节不可信**：收到的帧先过 `parseInvalidationFrame`（版本化 + 形状校验），不合法就记账
 *   丢掉。将来换帧格式时 v1 实例会把 v2 帧记为错误，而不是误读。
 * - **每个 error 都要有监听者**：Node 里无监听的 `error` 事件是 uncaught exception，一个连不上的
 *   Redis 会把进程带走。
 *
 * ## 取舍：这是"尽快失效"，不是强一致
 * pub/sub 是 fire-and-forget：断线窗口里漏掉一条失效的实例，最坏 15s 后由 TTL 自然收敛，不会
 * 永久陈旧。选的是 CAP 里可用性那一半——写请求不等线路、总线坏了业务照常。要"绝不陈旧"得上
 * 分布式锁 / 版本号写回，那是另一个量级的复杂度，且 discover 是幂等只读、没有那个必要。
 * 另：收到别机失效后清本地 Redis 驱动会 `DEL` 共享键，可能顺手删掉别的实例刚算出的新值——
 * 代价是一次**多余重算**（single-flight + TTL 很快收敛），不损正确性。这两条如实记在 ADR。
 *
 * ## 为什么不用 Redis keyspace notification
 * 那要 `CONFIG SET notify-keyspace-events`，托管 Redis 常禁用、也不该由应用改服务器配置；它报的是
 * "键变了"而非"业务窗口失效了"的意图，且不带 origin 无法过滤回环。pub/sub 显式、可控、带 origin，
 * 且项目已有 `realtime/redisBus.ts` 的同形先例可循。
 */
import { Redis } from 'ioredis';
import { DISCOVER_REDIS_URL_ENV } from './discoverRedis';

/** 专用版本化频道。版本段写在名字里：换帧格式时新旧实例不会互相误读（配合帧内 v 字段双保险）。 */
export const DISCOVER_INVALIDATION_CHANNEL = 'nexus:discover-invalidate:v1';
/** 帧格式版本。收到不等于本版本的帧一律记账丢弃。 */
export const DISCOVER_INVALIDATION_FRAME_VERSION = 1;

/** 帧：只有 origin 参与正确性（回环过滤），其余字段用于诊断与将来排障。 */
export interface DiscoverInvalidationFrame {
  v: number;
  origin: string;
  at: number;
  nonce: number;
}

/**
 * 线路字节 → 帧。纯函数，无副作用，便于把"不可信输入"这条纪律用纯数据门钉死。
 * 校验从宽到严：不是对象 → 否；版本不符 → 否；origin 非空字符串、at/nonce 有限数 → 才收。
 * 缺任一格都返回 `null`，调用方记账丢弃，绝不让畸形帧触达本地失效逻辑。
 */
export function parseInvalidationFrame(payload: string): DiscoverInvalidationFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const frame = parsed as Record<string, unknown>;
  if (frame.v !== DISCOVER_INVALIDATION_FRAME_VERSION) return null;
  if (typeof frame.origin !== 'string' || frame.origin.length === 0) return null;
  if (typeof frame.at !== 'number' || !Number.isFinite(frame.at)) return null;
  if (typeof frame.nonce !== 'number' || !Number.isFinite(frame.nonce)) return null;
  return { v: frame.v, origin: frame.origin, at: frame.at, nonce: frame.nonce };
}

/** 失效总线。形状刻意小：发布一条、订阅一条、报驱动、收摊。 */
export interface DiscoverInvalidationBus {
  /** 这台实例的身份；自己发出的帧会被自己过滤（回环）。 */
  readonly origin: string;
  /** 广播一次窗口失效。永不 reject、永不抛。 */
  publish(): void;
  /** 订阅别机的失效；返回退订函数。自己发的帧不会回调。 */
  subscribe(onInvalidation: () => void): () => void;
  driver(): 'memory' | 'redis';
  /** 诊断读数：发布/成功收帧/失败计数 + 订阅是否落定（不 await）。 */
  stats(): DiscoverInvalidationStats;
  /** 释放连接 / 退订。幂等。 */
  dispose(): void;
}

export interface DiscoverInvalidationStats {
  driver: 'memory' | 'redis';
  origin: string;
  published: number;
  received: number;
  errorCount: number;
  /** Redis 驱动：`SUBSCRIBE` 首次登记的落定值；null = 还没落定。memory 驱动恒 true。 */
  wireReady: boolean | null;
}

let originSeq = 0;
/** 同进程造多份（测试就是这么干的）也不撞：pid + 启动时刻 + 序号。 */
function defaultOrigin(): string {
  originSeq += 1;
  return `${process.pid}:${Date.now().toString(36)}:${originSeq}`;
}

/**
 * 进程内 hub：让**同一进程里的多个 bus 实例**共享一条"虚拟线路"，用于两实例行为门。
 * 生产单进程只有一个 bus，hub 里只有它自己，广播会被回环过滤掉——正确：本地失效由
 * `invalidateDiscoverRoute()` 自己同步做，bus 只负责**别机**那半边。
 */
export class MemoryInvalidationHub {
  private readonly listeners = new Map<string, () => void>();

  register(origin: string, cb: () => void): () => void {
    this.listeners.set(origin, cb);
    return () => {
      if (this.listeners.get(origin) === cb) this.listeners.delete(origin);
    };
  }

  /** 扇出给除 from 之外的所有监听者，回传送达数（行为门据此证明"真的发出去了"）。 */
  broadcast(from: string): number {
    let delivered = 0;
    for (const [origin, cb] of [...this.listeners]) {
      if (origin === from) continue;
      delivered += 1;
      cb();
    }
    return delivered;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** 进程内驱动。单进程开发/测试零依赖；两实例行为门靠它 + 共享 hub 复现跨进程扇出。 */
export class MemoryInvalidationBus implements DiscoverInvalidationBus {
  private published = 0;
  private received = 0;

  constructor(
    private readonly hub: MemoryInvalidationHub,
    readonly origin: string = defaultOrigin(),
  ) {}

  publish(): void {
    this.published += 1;
    const delivered = this.hub.broadcast(this.origin);
    if (delivered > 0) this.received += delivered; // memory 侧"收到"= 扇出成功，纯诊断
  }

  subscribe(onInvalidation: () => void): () => void {
    return this.hub.register(this.origin, onInvalidation);
  }

  driver(): 'memory' {
    return 'memory';
  }

  stats(): DiscoverInvalidationStats {
    return {
      driver: 'memory',
      origin: this.origin,
      published: this.published,
      received: this.received,
      errorCount: 0,
      wireReady: true,
    };
  }

  dispose(): void {
    // 订阅由 subscribe() 返回的闭包按各自归属退订；hub 无连接可断。
  }
}

/**
 * 最小连接形状——真实 `ioredis.Redis` 经 `fromIoredis` 适配，测试用 fake 实现同一形状。
 * 目的：把 Redis 收发的**编排**（双连接、订阅回执、帧校验、回环过滤、publish 不抛）变成
 * 在没有真 Redis 的宿主上也能被行为门覆盖的部分，而不是只剩静态文本门。
 */
export interface InvalidationRedisConnection {
  readonly status: string;
  onMessage(cb: (channel: string, payload: string) => void): void;
  onError(cb: (error: Error) => void): void;
  subscribe(channel: string): Promise<unknown>;
  publish(channel: string, payload: string): Promise<unknown>;
  disconnect(): void;
}

/** 两条连接的参数形状。刻意导出，让行为门能断言"发布侧不排队 / 订阅侧排队自愈"的不对称。 */
export interface InvalidationConnectionOptions {
  readonly enableOfflineQueue: boolean;
  readonly maxRetriesPerRequest: number | null;
  readonly lazyConnect: boolean;
}

/** 连接工厂。生产用真 ioredis；测试注入共享 channel registry 的 fake 来模拟两台机器。 */
export type InvalidationConnect = (
  url: string,
  role: 'pub' | 'sub',
  options: InvalidationConnectionOptions,
) => InvalidationRedisConnection;

/** 发布侧绝不排队、不重试；订阅侧允许排队并无限重试自愈。与 realtime/redisBus 完全同参。 */
export const PUBLISH_OPTIONS: InvalidationConnectionOptions = {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  lazyConnect: false,
};
export const SUBSCRIBE_OPTIONS: InvalidationConnectionOptions = {
  enableOfflineQueue: true,
  maxRetriesPerRequest: null,
  lazyConnect: false,
};

/** 把真 ioredis 收窄到 `InvalidationRedisConnection`，所有 `on` 的类型噪音只在这一处。 */
export function fromIoredis(redis: Redis): InvalidationRedisConnection {
  return {
    get status() {
      return redis.status;
    },
    onMessage: (cb) => {
      redis.on('message', (channel: string, payload: string) => cb(channel, payload));
    },
    onError: (cb) => {
      redis.on('error', (error: Error) => cb(error));
    },
    subscribe: (channel) => redis.subscribe(channel),
    publish: (channel, payload) => redis.publish(channel, payload),
    disconnect: () => {
      redis.disconnect();
    },
  };
}

const DEFAULT_CONNECT: InvalidationConnect = (url, role, options) =>
  fromIoredis(new Redis(url, options));

export interface RedisInvalidationBusOptions {
  url: string;
  origin?: string;
  /** 测试缝：注入 fake 连接；生产不传，用真 ioredis。 */
  connect?: InvalidationConnect;
}

export class RedisInvalidationBus implements DiscoverInvalidationBus {
  readonly origin: string;
  private readonly local = new Set<() => void>();
  private readonly pub: InvalidationRedisConnection;
  private readonly sub: InvalidationRedisConnection;
  private nonce = 0;
  private published = 0;
  private received = 0;
  private errorCount = 0;
  private wireReadyValue: boolean | null = null;
  private disposed = false;
  /** `SUBSCRIBE` 首次登记的落定值；永不 reject（连不上是明确接受的状态，15s TTL 兜底）。 */
  readonly ready: Promise<boolean>;

  constructor(options: RedisInvalidationBusOptions) {
    this.origin = options.origin ?? defaultOrigin();
    const connect = options.connect ?? DEFAULT_CONNECT;
    this.pub = connect(options.url, 'pub', PUBLISH_OPTIONS);
    this.sub = connect(options.url, 'sub', SUBSCRIBE_OPTIONS);
    // error 监听必须挂上：无监听的 error 事件在 Node 里是 uncaught exception。
    this.pub.onError((error) => this.countError('发布连接', error));
    this.sub.onError((error) => this.countError('订阅连接', error));
    this.sub.onMessage((channel, payload) => this.receive(channel, payload));
    // 构造即订阅：总线是进程级单例，晚订的代价是这段时间里所有别机失效都收不到。
    this.ready = this.subscribeWire();
    void this.ready.then((value) => {
      this.wireReadyValue = value;
    });
  }

  private async subscribeWire(): Promise<boolean> {
    try {
      // 实测（ioredis 6.0.0，见 realtime/redisBus.ts）：回执是"该连接当前订了的频道数"（数字）。
      // 按形状判而不是读成 boolean，认不出的回执算没订上并说出去，不把陌生形状当成功。
      const count = await this.sub.subscribe(DISCOVER_INVALIDATION_CHANNEL);
      if (typeof count === 'number') return count > 0;
      this.countError('订阅回执形状不认识', new Error(`subscribe() 回的是 ${typeof count}: ${JSON.stringify(count)}`));
      return false;
    } catch (error) {
      this.countError('订阅线路', error);
      return false;
    }
  }

  private receive(channel: string, payload: string): void {
    if (channel !== DISCOVER_INVALIDATION_CHANNEL) {
      this.countError('线路名不认识', new Error(`只该订 ${DISCOVER_INVALIDATION_CHANNEL}，却收到 ${channel}`));
      return;
    }
    const frame = parseInvalidationFrame(payload);
    if (frame === null) {
      this.countError('失效帧不合契约', new Error(`收到不可解析 / 版本不符的帧：${payload.slice(0, 200)}`));
      return;
    }
    // 自己发的帧会回环到自己（订的是同一条频道）；本地失效写路径已经同步做过了，跳过。
    if (frame.origin === this.origin) return;
    this.received += 1;
    for (const listener of [...this.local]) {
      try {
        listener();
      } catch (error) {
        // 一个订阅者抛错不该挡住其它订阅者，更不该把 Redis 的 message 回调带崩。
        this.countError('订阅者回调', error);
      }
    }
  }

  publish(): void {
    if (this.disposed) return;
    this.published += 1;
    let payload: string;
    try {
      // 帧是内部 PlainObject，序列化不会失败；真失败了也不能把正在写库的请求带崩。
      payload = JSON.stringify({
        v: DISCOVER_INVALIDATION_FRAME_VERSION,
        origin: this.origin,
        at: Date.now(),
        nonce: (this.nonce += 1),
      } satisfies DiscoverInvalidationFrame);
    } catch (error) {
      this.countError('帧序列化', error);
      return;
    }
    // publish 契约返回 Promise；没人接的 rejection 会变成 unhandled rejection，必须接住。
    void this.pub.publish(DISCOVER_INVALIDATION_CHANNEL, payload).catch((error: unknown) => this.countError('投递', error));
  }

  subscribe(onInvalidation: () => void): () => void {
    this.local.add(onInvalidation);
    return () => {
      this.local.delete(onInvalidation);
    };
  }

  driver(): 'redis' {
    return 'redis';
  }

  stats(): DiscoverInvalidationStats {
    return {
      driver: 'redis',
      origin: this.origin,
      published: this.published,
      received: this.received,
      errorCount: this.errorCount,
      wireReady: this.wireReadyValue,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.local.clear();
    // disconnect 而非 quit：quit 要和服务器一来一回，连都没连上的那条会吊住收尾（死端点测试）。
    this.sub.disconnect();
    this.pub.disconnect();
  }

  private countError(context: string, error: unknown): void {
    this.errorCount += 1;
    console.error(
      `[discover-invalidation] redis ${context} 失败（第 ${this.errorCount} 次；失效不补发，15s TTL 兜底）：`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

let lazyBus: DiscoverInvalidationBus | null = null;
let lazyHub: MemoryInvalidationHub | null = null;

function getDefaultMemoryHub(): MemoryInvalidationHub {
  if (!lazyHub) lazyHub = new MemoryInvalidationHub();
  return lazyHub;
}

/**
 * 生产驱动选择：设了 `NEXUS_REDIS_URL`（与 discover 缓存同一个旋钮）→ 真 Redis pub/sub；
 * 未设 → 进程内 memory（hub 里只有自己，广播回环过滤，等价于单进程无别机）。
 * 与 `getDiscoverCache()` 共用 env，避免"缓存共享了、失效没共享"这种半截配置。
 */
export function getDiscoverInvalidationBus(): DiscoverInvalidationBus {
  if (lazyBus) return lazyBus;
  const url = process.env[DISCOVER_REDIS_URL_ENV]?.trim();
  lazyBus = url ? new RedisInvalidationBus({ url }) : new MemoryInvalidationBus(getDefaultMemoryHub());
  return lazyBus;
}

/** Test-only seam：释放单例（含真连接），让下一轮按当前 env 重新选择驱动。 */
export function __resetDiscoverInvalidationBusForTests(): void {
  lazyBus?.dispose();
  lazyBus = null;
  lazyHub = null;
}
