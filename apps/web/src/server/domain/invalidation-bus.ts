/**
 * 发现页缓存的**跨实例失效总线**（§SC-42 / ADR-0114）。
 *
 * 它做两件事：把「某个 viewer 的私有关系变了」广播给别的进程（让对方 bump 本地 generation），
 * 以及 §SC-44 起把「全缓存世代变了」（新作品发布/下架，对所有 viewer 都是新内容）广播成
 * 一帧全局失效（让对方 bump 本地 globalEpoch）。权威状态永远在 Postgres
 * （`user_blocks` / `follows` / `published_projects`），缓存是加速器，广播是**尽力即时的
 * 最终一致**，不是强一致承诺——订阅掉线窗口内丢一帧，对方最坏多用一个 TTL（默认 15s）的
 * 旧视图，随后自愈。绝不拿它当"拉黑/下架全集群瞬时生效"的尺子。
 *
 * 三个机制各自挡一种真实坏法：
 *
 * 1. **双连接 pub/sub**：ioredis 的订阅连接进 subscriber 模式后不能再发普通命令，`publish`
 *    必须走另一条连接。参数不对称（发布侧不排队/单次重试，订阅侧排队/无限重试）是
 *    `realtime/redisBus.ts` 打真 Redis 跑出来的结论，照抄不重新发明。
 * 2. **origin 回环去重**：同一频道的发布者也听得见自己，帧带 `origin`（pid:时间戳:序号），
 *    收到自己那帧就丢掉——否则本地那次失效会被广播再通知一遍（幂等但冗余且难读）。
 * 3. **线路字节不可信**：`viewerIds` 过校验（字符串数组 + 长度/条数上限），坏帧记账丢弃，
 *    绝不把线路上的字节直接当成要 bump 的 viewer 集合。
 *
 * **热读零网络**：本模块只在 `invalidateDiscoverFor`（写路径）与 message handler（后台）运行，
 * `loadDiscoverCached` 一行都不碰。写路径 `publish` 是 fire-and-forget 同步 void，连不上线路
 * 也当场吞错、不阻塞正在写库的那条请求——总线不能比它服务的业务更脆弱。
 *
 * **清理**：`dispose()` 用 `disconnect()`（不是 `quit()`，对从没连上过的死连接 quit 会吊住进程退出），
 * 幂等；两条连接的 `error` 事件都在构造时挂常驻监听（否则 Node 里 uncaught exception 带崩进程）。
 */
/** 频道名带版本段：将来换帧格式，旧实例的帧因版本不符被丢，而不是被误读。 */
export const DISCOVER_INVALIDATE_CHANNEL = 'nexus:discover-invalidate:v1';

/** 单帧最多带多少个 viewerId，防一条恶意大帧让所有实例的 generation 表抖动。 */
export const MAX_VIEWERS_PER_FRAME = 128;
/** 单个 viewerId 的长度上限（users.id 是 UUID，远短于此；只作线路字节的护栏）。 */
export const MAX_VIEWER_ID_LENGTH = 128;

export interface InvalidationFrame {
  readonly v: 1;
  readonly origin: string;
  readonly viewerIds: string[];
  /**
   * §SC-44：全局失效帧（新作品发布 / 下架 / 审核拒绝，对所有 viewer 都是新内容）。
   * 可选字段——旧帧没有它，新帧带 `global:true` 且 `viewerIds:[]`。
   * **单向兼容**：新实例能收旧帧（viewerIds 非空、无 global）；旧实例解析新帧时会因
   * 空 viewerIds 撞护栏而 fail-safe 丢弃（当成坏帧记账），绝不把空集误当"要 bump 的人"。
   */
  readonly global?: true;
}

export interface InvalidationBusStats {
  /** 发出去的帧数（fire-and-forget，不代表对方一定收到） */
  readonly published: number;
  /** 收到的合法远端帧数（已扣掉自己回环那帧） */
  readonly received: number;
  /** 坏帧 / 线路错误数（不落到 generation 变更） */
  readonly errors: number;
  /** 消息处理回调数（每帧对每个合法 viewerId 算一次本地失效） */
  readonly applied: number;
}

/**
 * 跨实例失效总线。生产实现 RedisInvalidationBus、测试实现 MemoryInvalidationBus。
 * `discover-cache` 只认这个接口，不认 Redis——注入替身即可确定性测多实例语义。
 */
export interface InvalidationBus {
  /**
   * 广播「这些 viewer 的私有关系变了」。`global=true` 时广播"全缓存世代变了"
   * （viewerIds 必须为空）——新作品发布/下架对所有 viewer 都是新内容，无法也不该把全站
   * viewerId 塞进一帧。绝不抛、绝不 await 网络、绝不阻塞调用方。
   */
  publish(viewerIds: string[], global?: boolean): void;
  /**
   * 订阅远端失效；第二参 `global` 为 true 表示这一帧是全局失效（viewerIds 为空）。
   * 旧订阅者只接第一参也能照常工作（多余实参被忽略），故签名改动向后兼容。
   * 返回幂等退订函数（dispose 会调）。
   */
  subscribe(onInvalidate: (viewerIds: string[], global?: boolean) => void): () => void;
  /** 主动收摊：断开全部连接、清监听器，幂等。 */
  dispose(): void;
  stats(): InvalidationBusStats;
}

/**
 * 线路字节校验：只认形状对、版本对、条数/长度都在护栏内的帧。
 * 不写 `as InvalidationFrame` 把不可信字节伪装成有类型——校验不过就是 null。
 */
export function parseInvalidationFrame(payload: string): InvalidationFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate['v'] !== 1) return null;
  if (typeof candidate['origin'] !== 'string' || candidate['origin'].length === 0) return null;
  if (!Array.isArray(candidate['viewerIds'])) return null;
  const ids = candidate['viewerIds'];
  // §SC-44 两种帧互斥：全局帧（global===true）必须带空 viewerIds；定向帧必须非空。
  // 用显式 global 字段而非"空数组即全局"消歧，避免把一条被截坏的定向帧误读成全局失效。
  const isGlobal = candidate['global'] === true;
  if (isGlobal) {
    if (ids.length !== 0) return null; // 全局帧带人 = 形状矛盾，丢
    return { v: 1, origin: candidate['origin'], viewerIds: [], global: true };
  }
  // 定向帧：旧实例正是靠"空数组直接丢"把 SC-44 的全局帧 fail-safe 挡掉的，这条护栏不能松。
  if (ids.length === 0 || ids.length > MAX_VIEWERS_PER_FRAME) return null;
  if (ids.some((id) => typeof id !== 'string' || id.length === 0 || id.length > MAX_VIEWER_ID_LENGTH)) return null;
  return { v: 1, origin: candidate['origin'], viewerIds: ids as string[] };
}

/** 帧序列化：包 try，坏数据（不该发生）也只让这一帧不发出去，不带崩写路径。 */
function serializeFrame(frame: InvalidationFrame): string | null {
  try {
    return JSON.stringify(frame);
  } catch {
    return null;
  }
}

let originSeq = 0;
function defaultOrigin(): string {
  originSeq += 1;
  return `${process.pid}:${Date.now().toString(36)}:${originSeq}`;
}

/** 一次派发的结果：成功处置的 listener 数 + 抛错的 listener 数。让 dispatcher 诚实记账。 */
export interface DispatchOutcome {
  readonly applied: number;
  readonly failed: number;
}

/** 订阅端共用的分发器：把一帧拆成 viewerId 交给回调，统一记账，避免两种驱动各写一份漂移。 */
function makeDispatcher(
  origin: string,
  counters: { received: number; errors: number; applied: number },
  onInvalidate: (viewerIds: string[], global?: boolean) => DispatchOutcome,
): (payload: string) => void {
  return (payload: string) => {
    const frame = parseInvalidationFrame(payload);
    if (!frame) {
      counters.errors += 1;
      return;
    }
    if (frame.origin === origin) return; // 自己回环的那一帧，丢掉
    counters.received += 1;
    let outcome: DispatchOutcome;
    try {
      outcome = onInvalidate(frame.viewerIds, frame.global === true);
    } catch {
      // onInvalidate 本身崩了（不该发生：它已逐 listener 隔离）——整帧记一笔 error，不让线路崩。
      counters.errors += 1;
      return;
    }
    // 只有至少一个 listener 成功处置，这一帧才算"被处置"；全抛/零订阅不虚记 applied。
    // 全局帧记 1 次（不是 0 个 viewer，否则四账显示"收到却没做任何事"的谎）；
    // 按「帧 × viewerIds」记一次，与有几个 listener 无关（幂等 bump，多订阅者收同帧也是一次失效）。
    if (outcome.applied > 0) {
      counters.applied += frame.global === true ? 1 : frame.viewerIds.length;
    }
    // 每个抛错的 listener 各记一笔 error——隔离不等于把失败藏起来（§MQ-1 / ADR-0126）。
    counters.errors += outcome.failed;
  };
}

/**
 * 订阅者名册：支持多个订阅者、退订幂等。两种驱动共用，避免各写一份漂移。
 * `dispatch` 把一帧的 viewerIds 交给所有在册回调，**逐个隔离**：某个回调抛错不影响
 * 同一帧的其余订阅者（与 `realtime/localBus.ts` 同一纪律，§MQ-1 / ADR-0126）。
 * 每个回调的成败如实计入 `DispatchOutcome`，由 dispatcher 统一记账，绝不静默吞帧。
 */
export class InvalidationListeners {
  private readonly listeners = new Set<(viewerIds: string[], global?: boolean) => void>();

  subscribe(listener: (viewerIds: string[], global?: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispatch(viewerIds: string[], global?: boolean): DispatchOutcome {
    let applied = 0;
    let failed = 0;
    // 先复制再遍历：回调里可能退订（关页面/热重载），直接遍历原 Set 会漏掉后面的人。
    for (const listener of [...this.listeners]) {
      try {
        listener(viewerIds, global);
        applied += 1;
      } catch {
        // 一个坏订阅者不该让同帧其余订阅者收不到；也不该让正在写库的请求崩掉。
        // 这里只记账、不打日志：线路异常已在 dispatcher 的 counters 与 admin 面板可见，
        // 逐帧 console.error 反而是可被一条坏帧刷屏的日志风暴面。
        failed += 1;
      }
    }
    return { applied, failed };
  }

  get size(): number {
    return this.listeners.size;
  }
}

/**
 * 同进程内存驱动：多份 bus 共享一个"线路中枢" hub，用于把「实例 A 广播 → 实例 B bump」
 * 变成不依赖真 Redis、不 sleep、不 flaky 的确定性单测。生产不会用到它。
 *
 * 发给 hub 的帧所有 bus（含自己）都听得见，靠 dispatcher 的 origin 去重摘掉自己那帧；
 * 这正是真 pub/sub 的语义，让单测与生产走同一套去重/校验路径，而不是给测试开后门。
 */
export class MemoryInvalidationBus implements InvalidationBus {
  readonly origin = defaultOrigin();
  private readonly counters = { published: 0, received: 0, errors: 0, applied: 0 };
  private readonly listeners = new InvalidationListeners();
  private readonly dispatchFrame: (payload: string) => void;
  private readonly wireListener: (payload: string, origin: string) => void;
  private disposed = false;

  constructor(private readonly hub: MemoryInvalidationHub) {
    this.dispatchFrame = makeDispatcher(this.origin, this.counters, (ids, global) => this.listeners.dispatch(ids, global));
    this.wireListener = (payload: string) => {
      if (!this.disposed) this.dispatchFrame(payload);
    };
    this.hub.attach(this.wireListener);
  }

  publish(viewerIds: string[], global?: boolean): void {
    if (this.disposed) return;
    // global 帧必须空 viewerIds；定向帧空集是 no-op（与生产 Redis 驱动同一口径）。
    if (global !== true && viewerIds.length === 0) return;
    const payload = serializeFrame(
      global === true
        ? { v: 1, origin: this.origin, viewerIds: [], global: true }
        : { v: 1, origin: this.origin, viewerIds: [...viewerIds] },
    );
    if (payload === null) {
      this.counters.errors += 1;
      return;
    }
    this.counters.published += 1;
    this.hub.emit(payload, this.origin);
  }

  subscribe(onInvalidate: (viewerIds: string[], global?: boolean) => void): () => void {
    return this.listeners.subscribe(onInvalidate);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hub.detach(this.wireListener);
  }

  stats(): InvalidationBusStats {
    return { ...this.counters };
  }
}

/** 内存 bus 之间共享的线路中枢（测试夹具造多份 bus 时传同一个 hub）。 */
export class MemoryInvalidationHub {
  private readonly listeners = new Set<(payload: string, origin: string) => void>();

  attach(listener: (payload: string, origin: string) => void): void {
    this.listeners.add(listener);
  }

  detach(listener: (payload: string, origin: string) => void): void {
    this.listeners.delete(listener);
  }

  emit(payload: string, origin: string): void {
    for (const listener of [...this.listeners]) listener(payload, origin);
  }

  get size(): number {
    return this.listeners.size;
  }
}

/** 发布连接：不排队、单次重试——发帧的是写库请求，不能等线路。 */
const PUBLISH_OPTIONS = { enableOfflineQueue: false, maxRetriesPerRequest: 1 } as const;
/** 订阅连接：允许排队、无限重试——SUBSCRIBE 在连接建立前发出，队列一关就永远订不上。 */
const SUBSCRIBE_OPTIONS = { enableOfflineQueue: true, maxRetriesPerRequest: null } as const;

export interface RedisInvalidationBusOptions {
  readonly url: string;
  /** 身份，用于回环去重；同进程造多份 bus 时不会撞。 */
  readonly origin?: string;
  /** 错误回调（记账 / 日志），不抛。 */
  readonly onError?: (context: string, error: Error) => void;
  /**
   * 注入 ioredis 构造器（测试用假连接；生产留空走动态 import）。
   * 用工厂签名而非 Redis 类，是为了不把 ioredis 的类型/运行时绑死在模块顶层。
   */
  readonly redisFactory?: (url: string, options: object) => RedisLike;
}

/** 只用得到的最小 ioredis 表面，便于测试注入假连接，也让本模块与 ioredis 版本解耦。 */
export interface RedisLike {
  on(event: 'error' | 'message', listener: (...args: any[]) => void): unknown;
  subscribe(channel: string): Promise<number>;
  publish(channel: string, payload: string): Promise<number>;
  disconnect(): void;
}

/**
 * 生产驱动：双连接 pub/sub。热读不经过这里；写路径 publish 是 fire-and-forget。
 * `redisFactory` 缺省时**同步拿不到** Redis（动态 import 是异步的），故生产入口用一个
 * "首用即建"的惰性代理在 `createRedisInvalidationBus` 里接好两条连接后再构造本类。
 */
export class RedisInvalidationBus implements InvalidationBus {
  readonly origin: string;
  private readonly counters = { published: 0, received: 0, errors: 0, applied: 0 };
  private readonly listeners = new InvalidationListeners();
  private readonly dispatchFrame: (payload: string) => void;
  private disposed = false;

  constructor(
    private readonly pub: RedisLike,
    private readonly sub: RedisLike,
    options: RedisInvalidationBusOptions,
  ) {
    this.origin = options.origin ?? defaultOrigin();
    this.dispatchFrame = makeDispatcher(this.origin, this.counters, (ids, global) => this.listeners.dispatch(ids, global));

    // 两条连接都挂常驻 error 监听：Node 里无监听者的 error 事件是 uncaught exception。
    const onError = options.onError ?? (() => undefined);
    this.pub.on('error', (error: Error) => {
      this.counters.errors += 1;
      onError('发布连接', error);
    });
    this.sub.on('error', (error: Error) => {
      this.counters.errors += 1;
      onError('订阅连接', error);
    });
    this.sub.on('message', (wireChannel: string, payload: string) => {
      if (wireChannel === DISCOVER_INVALIDATE_CHANNEL) {
        this.dispatchFrame(payload);
        return;
      }
      this.counters.errors += 1;
      onError('线路名不认识', new Error(`只该订 ${DISCOVER_INVALIDATE_CHANNEL}，却收到 ${wireChannel}`));
    });

    // 构造即订频道（不等第一个订阅者）：总线是进程级单例，晚订会漏掉窗口内别机的失效。
    // subscribe 返回的是"当前订阅频道数"（ioredis 6 实测），不是 boolean；失败只记账，不抛。
    void this.sub.subscribe(DISCOVER_INVALIDATE_CHANNEL).catch((error: unknown) => {
      this.counters.errors += 1;
      onError('订阅频道失败', error instanceof Error ? error : new Error(String(error)));
    });
  }

  publish(viewerIds: string[], global?: boolean): void {
    if (this.disposed) return;
    // §SC-44：全局帧（viewerIds 空）不再被这条早退挡掉；定向帧空集仍是 no-op。
    if (global !== true && viewerIds.length === 0) return;
    const payload = serializeFrame(
      global === true
        ? { v: 1, origin: this.origin, viewerIds: [], global: true }
        : { v: 1, origin: this.origin, viewerIds: [...viewerIds] },
    );
    if (payload === null) {
      this.counters.errors += 1;
      return;
    }
    this.counters.published += 1;
    // fire-and-forget：接住 Promise，坏线路当场失败、不阻塞写库请求、不制造 unhandled rejection。
    void this.pub.publish(DISCOVER_INVALIDATE_CHANNEL, payload).catch(() => {
      this.counters.errors += 1;
    });
  }

  subscribe(onInvalidate: (viewerIds: string[], global?: boolean) => void): () => void {
    return this.listeners.subscribe(onInvalidate);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // disconnect 不是 quit：对从没连上过的死连接，quit 要和服务器一来一回，会吊住进程退出。
    this.sub.disconnect();
    this.pub.disconnect();
  }

  stats(): InvalidationBusStats {
    return { ...this.counters };
  }
}

/**
 * 生产入口：动态 import ioredis（裁剪部署缺包也不致命）、建双连接、返回 bus。
 * 连接层自愈（ioredis 默认重连 + 自动重订已登记频道），这里不手写重连。
 * 返回的 bus **永不 await**——调用方（discover-cache 的 getStore）同步拿到即可。
 */
export async function createRedisInvalidationBus(options: RedisInvalidationBusOptions): Promise<InvalidationBus> {
  const { Redis } = await import('ioredis');
  const pub = options.redisFactory
    ? options.redisFactory(options.url, PUBLISH_OPTIONS)
    : (new Redis(options.url, PUBLISH_OPTIONS) as unknown as RedisLike);
  const sub = options.redisFactory
    ? options.redisFactory(options.url, SUBSCRIBE_OPTIONS)
    : (new Redis(options.url, SUBSCRIBE_OPTIONS) as unknown as RedisLike);
  return new RedisInvalidationBus(pub, sub, options);
}
