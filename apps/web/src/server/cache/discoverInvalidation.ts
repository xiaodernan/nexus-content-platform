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
 * - **线路字节不可信**：收到的帧先过 `classifyInvalidationFrame`（版本化 + 形状校验，见 v674），
 *   畸形帧记账丢掉、绝不小心误读。更高版本的合法帧单列为 `future`，不与坏帧混淆（详见下节）。
 * - **每个 error 都要有监听者**：Node 里无监听的 `error` 事件是 uncaught exception，一个连不上的
 *   Redis 会把进程带走。
 *
 * ## v674 / ADR 0107：滚动升级期间的版本缝 + 稳定实例身份（默认行为不变）
 * v670 只把帧当 v1 一种：收到 v2 帧一律 `parseInvalidationFrame` 判 null → 当坏帧记账丢弃。滚动
 * 升级时这没问题（v1 靠 TTL 收敛），但它把两件**语义不同**的事混成了一笔"错误"账：
 *   - 真畸形 / 恶意字节（JSON 坏、origin 空）——该拒绝、该记账；
 *   - **更高版本的合法失效意图**——v2 实例在告诉我"窗口失效了"，只是我读不懂新字段。
 * v674 把它们分层（`classifyInvalidationFrame`：current / future / rejected），future 单列计数、
 * 不再污染 errorCount，并给出一个**默认关闭**的保守策略 `fail-safe-invalidate`：滚动升级窗口里
 * 可显式打开，让 v1 实例收到 v2 帧也保守失效一次（代价是一次多余重算，换"新发布立即可见"）。
 * **默认 `degrade-to-ttl` 与 v670 一字不差**（守 ADR 0094 X4：门不许惩罚正当改动；默认生产行为
 * 不因加了旋钮而改变）。future 帧的日志**按版本去重**，避免滚动升级期 v2 帧 flood 把每台 v1
 * 实例的日志打爆——"总线不能比它服务的业务更脆弱"这条纪律在版本缝里同样成立。
 * 另加 `NEXUS_DISCOVER_INSTANCE_ID` 稳定身份旋钮：它只做 origin 的**稳定可读前缀**，唯一性仍由
 * pid/seq 兜底，故两台实例即使误配同一个 id 也不会互相把对方的帧当回环丢掉（那会静默破正确性）。
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

/**
 * v674 / ADR 0107：稳定实例 id 旋钮。设了就作为每次 `publish` 帧 `origin` 的**可读前缀**，
 * 但回环过滤用的完整 origin 仍带 pid + 进程内 seq —— 于是两台实例即使误配同一个 id，
 * 完整 origin 仍不同，不会互相把对方的帧当自己回环丢掉。未设时行为与 v670 完全一致。
 */
export const DISCOVER_INSTANCE_ID_ENV = 'NEXUS_DISCOVER_INSTANCE_ID';

/** 帧：只有 origin 参与正确性（回环过滤），其余字段用于诊断与将来排障。 */
export interface DiscoverInvalidationFrame {
  v: number;
  origin: string;
  at: number;
  nonce: number;
}

/**
 * v674 / ADR 0107：一条线路帧的三种语义分类。关键是把"更高版本的合法失效意图"(`future`)
 * 从"畸形 / 不可信字节"(`rejected`) 里**分出来**——v670 把两者都当坏帧计进 errorCount，
 * 滚动升级期这会把"兄弟实例在帮我失效"误报成"线路被攻击"，也会让运维看不见真正的坏帧比例。
 */
export type InvalidationFrameClass =
  | { kind: 'current'; frame: DiscoverInvalidationFrame }
  | { kind: 'future'; version: number; origin: string }
  | { kind: 'rejected'; reason: string };

/**
 * v674：收到 `future` 帧时怎么办。
 * - `degrade-to-ttl`（**默认，等于 v670 行为**）：记账 + 丢弃，v1 窗口靠 15s TTL 收敛；
 * - `fail-safe-invalidate`：读不懂新字段，但"窗口失效了"这个意图是明确的 —— 保守地触发一次
 *   本地失效（bump generation + 清 inFlight + 清驱动），代价是一次多余重算，换滚动升级期
 *   "新发布立即可见"不因版本差而退化到 TTL 窗口。
 * 两种策略都**不把 future 帧计为 error**——它是合法帧，不是线路噪声。
 */
export type FutureFramePolicy = 'degrade-to-ttl' | 'fail-safe-invalidate';
export const DEFAULT_FUTURE_FRAME_POLICY: FutureFramePolicy = 'degrade-to-ttl';

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

/**
 * v674 / ADR 0107：把一条线路帧分成 current / future / rejected，**只读公共头部**。
 *
 * 公共头部契约（本 ADR 新增，跨版本稳定）：`v` 是整数、`origin` 是非空字符串。v2 及以后可以
 * 增删诊断字段（at / nonce 之类），但这两格不能变——否则滚动升级时 v1 连"这是不是我自己的帧"
 * 都判不出来。这是 v674 唯一要求未来版本守的约定，其余一概不碰。
 *
 * 判别顺序很重要：先走**一字未改**的 `parseInvalidationFrame`（合法 v1 → current），失败的才看
 * 是不是更高版本的合法意图帧。于是 v670 的九类畸形帧门继续全绿，零回归。
 */
export function classifyInvalidationFrame(payload: string): InvalidationFrameClass {
  const current = parseInvalidationFrame(payload);
  if (current !== null) return { kind: 'current', frame: current };

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { kind: 'rejected', reason: 'JSON 不可解析' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { kind: 'rejected', reason: '非对象' };
  const obj = parsed as Record<string, unknown>;
  // v 必须是**大于**当前版本的整数：等于当前却字段不全的坏 v1 帧仍 rejected，不许冒充 future。
  if (typeof obj.v !== 'number' || !Number.isInteger(obj.v)) return { kind: 'rejected', reason: 'v 非整数' };
  if (obj.v <= DISCOVER_INVALIDATION_FRAME_VERSION) return { kind: 'rejected', reason: 'v 不高于当前版本' };
  if (typeof obj.origin !== 'string' || obj.origin.length === 0) {
    return { kind: 'rejected', reason: 'future 帧缺公共头部 origin' };
  }
  // at / nonce 是 v1 的诊断字段，未来版本可能改名/取消 —— 对 future 帧刻意**不校验**，
  // 否则等于要求 v2 还得背着 v1 的字段走，"版本化频道 + 帧内 v"就失去意义了。
  // origin 在分类时一并带出，避免 receive 为回环过滤再 JSON.parse 一次（判据同源）。
  return { kind: 'future', version: obj.v, origin: obj.origin };
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
  /** v674：解析成分辨率的三种帧计数——合法 v1 / 更高版本意图 / 坏帧。前两者不算 error。 */
  currentFrames: number;
  futureFrames: number;
  rejectedFrames: number;
  /** v674：见过的 future 版本号（去重、升序），诊断滚动升级对端在跑哪一版。 */
  seenFutureVersions: number[];
  /** v674：本实例生效的 future 策略（只读回显，防"设了旋钮却没接上"）。 */
  futurePolicy: FutureFramePolicy;
}

/**
 * v674 / ADR 0107：把稳定 id 与进程内唯一性拼成 origin 的**纯函数**（门可直接钉死契约）。
 *
 * 关键契约：`instanceId` 只作**可读前缀**，唯一性始终由 `pid:tsBase36:seq` 兜底。于是两台实例
 * 即使误配同一个 id，完整 origin 仍不同，不会互相把对方的帧当回环过滤掉——旋钮提升可诊断性，
 * 绝不削弱正确性（那会让对方那台永远收不到失效，是静默的正确性事故）。
 */
export function composeInvalidationOrigin(
  instanceId: string | undefined,
  pid: number,
  tsBase36: string,
  seq: number,
): string {
  const stable = instanceId?.trim();
  const prefix = stable ? `${stable}:` : '';
  return `${prefix}${pid}:${tsBase36}:${seq}`;
}

let originSeq = 0;
/** 同进程造多份（测试就是这么干的）也不撞：稳定 id（可选）+ pid + 启动时刻 + 序号。 */
function defaultOrigin(instanceId?: string): string {
  originSeq += 1;
  return composeInvalidationOrigin(instanceId, process.pid, Date.now().toString(36), originSeq);
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
    // memory 驱动没有线路字节，future 分类不适用；保留旋钮只为 stats 形状与 Redis 驱动一致。
    private readonly futurePolicy: FutureFramePolicy = DEFAULT_FUTURE_FRAME_POLICY,
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
      // 内存线路不承载字节帧，三种计数恒 0 / 空；futurePolicy 仅为接口形状一致而回显。
      currentFrames: 0,
      futureFrames: 0,
      rejectedFrames: 0,
      seenFutureVersions: [],
      futurePolicy: this.futurePolicy,
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
  /**
   * v674 / ADR 0107：稳定实例 id，作为 origin 的可读前缀（唯一性仍由 pid/seq 兜底）。
   * 不传时生产从 `NEXUS_DISCOVER_INSTANCE_ID` 读；测试显式传可绕开环境。
   */
  instanceId?: string;
  /**
   * v674：收到更高版本合法帧时的策略。不传用 `DEFAULT_FUTURE_FRAME_POLICY`（= v670 行为）。
   * 滚动升级窗口里 v1 实例可显式传 `fail-safe-invalidate` 换取"新发布立即可见"。
   */
  futurePolicy?: FutureFramePolicy;
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
  /** v674：三类帧各自的计数 + 见过的 future 版本（去重、升序）。 */
  private currentFrames = 0;
  private futureFrames = 0;
  private rejectedFrames = 0;
  private readonly seenFutureVersions = new Set<number>();
  /** v674：已就某个 future 版本发过"降级"日志——按版本去重，防滚动升级期 flood 打爆日志。 */
  private readonly warnedFutureVersions = new Set<number>();
  private readonly futurePolicy: FutureFramePolicy;
  /** `SUBSCRIBE` 首次登记的落定值；永不 reject（连不上是明确接受的状态，15s TTL 兜底）。 */
  readonly ready: Promise<boolean>;

  constructor(options: RedisInvalidationBusOptions) {
    this.origin = options.origin ?? defaultOrigin(options.instanceId);
    this.futurePolicy = options.futurePolicy ?? DEFAULT_FUTURE_FRAME_POLICY;
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

    // v674：三层分流。current 走 v670 原路径一字不改；future 按策略；rejected 才计 error。
    const classified = classifyInvalidationFrame(payload);

    if (classified.kind === 'rejected') {
      // 真畸形 / 不可信字节：与 v670 同款记账丢弃，绝不触达本地失效逻辑。
      this.rejectedFrames += 1;
      this.countError('失效帧不合契约', new Error(`收到不可解析 / 版本不符的帧：${payload.slice(0, 200)}`));
      return;
    }

    if (classified.kind === 'future') {
      this.futureFrames += 1;
      this.seenFutureVersions.add(classified.version);
      // 公共头部 origin 参与回环过滤：自己不会发 future 帧（本实例只发 v1），但同一进程若真有
      // 别的 bus 版本在发，仍按 origin 摘掉，避免重复失效。
      if (classified.origin === this.origin) return;

      // 按版本去重日志：滚动升级期对端每秒可能广播几百条，逐条 console.error 会把 v1 实例的
      // 日志与 CPU 打爆——正是"总线不能比它服务的业务更脆弱"在版本缝里的体现。
      if (!this.warnedFutureVersions.has(classified.version)) {
        this.warnedFutureVersions.add(classified.version);
        console.warn(
          `[discover-invalidation] 收到更高版本 v${classified.version} 失效帧（本实例 v${DISCOVER_INVALIDATION_FRAME_VERSION}）；` +
            `策略=${this.futurePolicy}，每条线路日志按版本去重。`,
        );
      }
      // future 帧是**合法意图**，不是线路错误 → 不计 errorCount（与 rejected 分开）。
      if (this.futurePolicy === 'fail-safe-invalidate') {
        this.fireLocalInvalidation();
      }
      // degrade-to-ttl（默认，= v670）：记账 + 丢弃，窗口靠 15s TTL 收敛。
      return;
    }

    // current：以下与 v670 完全同路径。
    this.currentFrames += 1;
    const frame = classified.frame;
    // 自己发的帧会回环到自己（订的是同一条频道）；本地失效写路径已经同步做过了，跳过。
    if (frame.origin === this.origin) return;
    this.fireLocalInvalidation();
  }

  /** 触发一次本地失效（bump generation + 清 inFlight + 清驱动由 runtime 的订阅回调完成）。 */
  private fireLocalInvalidation(): void {
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
      currentFrames: this.currentFrames,
      futureFrames: this.futureFrames,
      rejectedFrames: this.rejectedFrames,
      seenFutureVersions: [...this.seenFutureVersions].sort((a, b) => a - b),
      futurePolicy: this.futurePolicy,
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
  const instanceId = process.env[DISCOVER_INSTANCE_ID_ENV]?.trim();
  lazyBus = url
    ? new RedisInvalidationBus({ url, instanceId })
    : new MemoryInvalidationBus(getDefaultMemoryHub());
  return lazyBus;
}

/** Test-only seam：释放单例（含真连接），让下一轮按当前 env 重新选择驱动。 */
export function __resetDiscoverInvalidationBusForTests(): void {
  lazyBus?.dispose();
  lazyBus = null;
  lazyHub = null;
}
