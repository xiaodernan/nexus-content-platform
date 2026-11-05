import { Redis } from 'ioredis';
import { RealtimeWireFrameSchema, type RealtimeEvent, type RealtimeWireFrame } from '@nexus/schemas';
import { MemoryRealtimeBus } from './localBus';
import type { RealtimeBus, RealtimeBusStats } from './bus';

/**
 * 跨实例驱动（§163 欠的那一格）。取舍见 `docs/adr/0028-realtime-redis-fanout.md`。
 *
 * 形状没变（还是 `RealtimeBus` 那四个方法），变的是"事件怎么到达订阅者"：
 * 本机那一半仍旧交给 `MemoryRealtimeBus`（所以生产者发一条事件，同进程的订阅者**不必**
 * 等一趟 Redis 往返），跨进程那一半走一条 pub/sub 线路 `WIRE_CHANNEL`，
 * 帧由 `packages/schemas` 的 `RealtimeWireFrameSchema` 定义——线路上的字节和浏览器
 * 发来的一样不可信，收到先 `safeParse`，不合法就记账丢掉，绝不落到本机订阅者那里。
 *
 * 两条连接而不是一条：Redis 的订阅连接进入 subscriber 模式后不能再发普通命令，
 * 而 `publish` / `closeChannel` 正是要发命令的那一侧。分开发才不必在两件事之间排队。
 *
 * `publish` 依旧**不抛异常**（`bus.ts` 抄过来的那条纪律）：连不上线路只让日志和
 * `wireErrorCount` 动一下，把正在写库的那个请求放过去。这一条是这个驱动能否
 * 被默认打开的前提——总线不能比它服务的业务更脆弱。
 */

/** 打开这个驱动的环境变量名。空/未设 = 继续用进程内驱动（见 `bus.ts` 的选择） */
export const REDIS_URL_ENV = 'NEXUS_REDIS_URL';
/** 线路名。版本段写在里面：将来换帧格式时旧实例发来的帧会因 parse 失败被记下来，而不是被误读 */
export const WIRE_CHANNEL = 'nexus:realtime:v1';

export interface RedisRealtimeBusOptions {
  url: string;
  /**
   * 这台总线的身份，用于把自己回环的那一帧摘掉（同一条线路所有人都听得见，包括发的人）。
   * 默认 `pid:启动时刻:序号`——同进程里造多份（测试就这么干）也不会撞。
   */
  origin?: string;
}

let originSeq = 0;

function defaultOrigin(): string {
  originSeq += 1;
  return `${process.pid}:${Date.now().toString(36)}:${originSeq}`;
}

/**
 * 两条连接的参数**不一样**，这个不对称是 2026-10-04 打真 Redis 跑出来的：
 *
 * - 发布侧 `enableOfflineQueue:false`、`maxRetriesPerRequest:1`：断开时命令不进队列等着
 *   （那会无上限地堆内存，并在重连后把积压的旧事件突然灌出去），也不做漫长的重试马拉松——
 *   **发事件的是一条业务请求，它不该等线路**。
 * - 订阅侧反过来：允许排队，并且 `maxRetriesPerRequest:null`（不限次数）。
 *   `SUBSCRIBE` 是在连接建立之前发出去的，队列一关它就当场失败，于是这台总线永远订不上线路，
 *   跨实例那半边静默地一条都不送——第一次跑这套测试时四条投递用例全红就是这个原因，
 *   而它不会在任何单元测试里露出来（本机那一半边一直是好的）。
 *   不限次数重试是因为这里等的不是某个请求，是这条总线自己的初始化：Redis 要是十分钟
 *   后才起来，订上才是对的行为；默认那 20 次用完就永久不再重订（命令被丢弃，不在自动
 *   重订的名册里），等于"重启窗口里没赶上趟的实例永远收不到别机的事件"。
 *
 * 重连策略用 ioredis 的默认值：线路恢复后已登记的订阅会自动重建，自愈在连接层，不在这里。
 */
const PUBLISH_OPTIONS = { enableOfflineQueue: false, maxRetriesPerRequest: 1 } as const;
const SUBSCRIBE_OPTIONS = { enableOfflineQueue: true, maxRetriesPerRequest: null } as const;

/**
 * 两条连接的 `status` 换成 `stats().wire` 那一格的那条规则（`liveWire()` 只是拿现值调它）。
 *
 * 单列成函数是为了能逐对判：**`pub` ready 而 `sub` 还在重连**这种半开状态，
 * 打真 Redis 造不出来（两侧连的是同一个端点，要么一起要么不一起），
 * 而"两个都要 ready 才算 up"恰恰是这条规则里唯一有内容的一句——不拆出来它就没牙。
 * 导出只为测试，生产路径上没人绕过 `liveWire()`。
 */
export function wireFromStatuses(pubStatus: string, subStatus: string): 'up' | 'pending' | 'down' {
  // end / close 是终局：这台现在收不到别机的事件，直到有人重新建连接。
  // 把它算进 pending 会让一个已经关掉的驱动说"还在路上"——那是另一种谎
  if (pubStatus === 'end' || pubStatus === 'close' || subStatus === 'end' || subStatus === 'close') return 'down';
  // 认识与不认识的一律先落在"还在路上"：wait / preparing / connecting / reconnecting
  // 都是自愈中，把它们读成 down 就是把一次正常重连报成故障
  return pubStatus === 'ready' && subStatus === 'ready' ? 'up' : 'pending';
}

/** ioredis 没有公开的 `ready()`，只有 `status` 和 `ready` 事件；就绪信号自己搭（见 `ready` 字段） */
function connectionReady(redis: Redis): Promise<true> {
  if (redis.status === 'ready') return Promise.resolve(true);
  return new Promise<true>((resolve, reject) => {
    redis.once('ready', () => resolve(true));
    // error 也当作"未就绪"落地：连不上的时候必须有东西结束这个 Promise，
    // 否则 await 它的人（测试、将来的诊断入口）会吊死在一次永远不来的 ready 上。
    // 常驻的 error 监听器在构造函数里，这里的 once 只负责叫醒等待者。
    redis.once('error', (error: Error) => reject(error));
    redis.once('end', () => reject(new Error('连接已结束')));
  });
}

export class RedisRealtimeBus implements RealtimeBus {
  readonly origin: string;
  /**
   * 线路失败的计数：投递不出去、收到的帧不合法、订阅建不起来，都记在这里。
   * "实时通道是加速器不是权威来源"这句话在今天唯一的可观测形式就是它——
   * 没有这个数，一次断线只会变成一行日志，跑测试的人看不见"到底丢了几帧"。
   */
  wireErrorCount = 0;
  /**
   * 与 `wireErrorCount` 同一套账，但**按原因拆开**（限流闸 `fallbackByReason` 的同形状）。
   * key 就是 `countWireError` 的第一个参数（'投递' / '收到的帧不合契约' / …）——
   * 它们本来就是给人看的话，不是错误码。全空 = 这台还没出过一帧失败。
   */
  wireErrorByReason: Record<string, number> = {};

  private readonly local = new MemoryRealtimeBus();
  private readonly pub: Redis;
  private readonly sub: Redis;
  private disposed = false;

  /**
   * `ready` 的**已落定答案**，`null` = 还没落定。`stats()` 读它而不去 await `ready`——
   * 诊断页不该被一次吊着的连接拖住（`ready` 永不 reject，但连不上的端口可能要等
   * ioredis 的第一轮重试才落定）。落定后不再变，与 `ready` 自己的语义一致。
   */
  private wireReadyValue: boolean | null = null;

  /**
   * 这台总线的**跨实例那一半边**是否已经接上线：订阅在服务器那边登记成功了，
   * 而且发布连接也真的 ready（不是"命令发出去了"，那是另一回事）。
   *
   * 谁用它：想知道"这台机器现在收不收得到别机的事件"的人——集成测试用它代替
   * "反复发一帧直到有一帧收到"那种把建连接的竞态当成断言的写法；生产路径上
   * 想少丢头几帧的调用方也可以先 await 它。
   * 谁不用它：`publish` 本身。本机那一半边从来不依赖线路，等着就绪等于让业务等 Redis。
   *
   * 这个 Promise **永不 reject**：连不上是这一格明确接受的状态（帧不补发，权威在库里），
   * 所以它的答案是 `false`，原因由 `countWireError` 说出去。永不 reject 也让它不必
   * 有人 await 才不会变成 unhandled rejection——线路坏了的时候不该再多砸一次进程。
   *
   * 它回答的是"构造那一次线建起来了没有"，落定之后不再变；不是健康检查，别轮询它。
   * 线路后来断了又恢复不归这里管，归 ioredis 的自动重订（见上面的连接参数）——
   * **所以"这台机器现在收不收得到别机的事件"是另一格**：`stats().wire`，它每次问都现读状态。
   * 这两格分开是有意的，合起来会变成一句错话：Redis 比这台进程晚起来的那台，
   * 这里落定成 `false`，而连接层随后把线订上了，`wire` 是 `up`。
   */
  readonly ready: Promise<boolean>;

  constructor(options: RedisRealtimeBusOptions) {
    this.origin = options.origin ?? defaultOrigin();
    this.pub = new Redis(options.url, PUBLISH_OPTIONS);
    this.sub = new Redis(options.url, SUBSCRIBE_OPTIONS);

    // error 监听器必须挂上：没有监听者的 error 事件在 Node 里是 uncaught exception，
    // 于是"一个连不上的 Redis"会把整个进程带走——那条纪律就是这么被反着打破的。
    this.pub.on('error', (error: Error) => this.countWireError('发布连接', error));
    this.sub.on('error', (error: Error) => this.countWireError('订阅连接', error));
    this.sub.on('message', (wireChannel: string, payload: string) => {
      if (wireChannel !== WIRE_CHANNEL) return; // 这条连接只订一个线路名，收到别的说明有人改错了
      this.receive(payload);
    });

    // 订上线路这件事发生在构造的那一刻（不等第一个订阅者）：总线是进程级单例，
    // 晚订的代价是这段时间里所有别机的事件都不到，而那不是任何调用方想背的东西。
    //
    // 顺序有讲究：发布侧连不上就**当场**回答 false，不去等那条还在排队的订阅。
    // 订阅命令按上面的参数会一直等到 Redis 起来为止（那才是对的自愈行为），
    // 要是 Promise.all 两个一起等，`ready` 在 Redis 宕机时就永不落定，
    // await 它的人只能等到超时——把一个本来能说清楚的"没接上"变成一次吊死的等待。
    const subscribed = this.subscribeWire();
    this.ready = this.publishReady().then(async (publishUp) => (publishUp ? subscribed : false));
    // 落定值给 stats() 用：.then 里永不 reject（上面的注释就是这句话的出处），void 掉浮动的 Promise
    void this.ready.then((value) => {
      this.wireReadyValue = value;
    });
  }

  private async subscribeWire(): Promise<boolean> {
    try {
      // 实测（ioredis 6.0.0 连 Redis 7，2026-10-06）：resolve 出来的是**这条连接当前订了的频道数**
      // （第一次订 1，再订一条 2），不是布尔也不是 'OK'。类型上 ioredis 给的是 `unknown`
      // （命令表是索引签名，没有逐命令签名），所以这里按形状判：数字就比大小，
      // 认不出的回执算"没订上"并说出去——不把陌生形状读成成功。
      const count = await this.sub.subscribe(WIRE_CHANNEL);
      if (typeof count === 'number') return count > 0;
      this.countWireError('订阅回执形状不认识', new Error(`subscribe() 回的是 ${typeof count}：${JSON.stringify(count)}`));
      return false;
    } catch (error) {
      this.countWireError('订阅线路', error);
      return false;
    }
  }

  private async publishReady(): Promise<boolean> {
    try {
      await connectionReady(this.pub);
      return true;
    } catch (error) {
      this.countWireError('发布连接未就绪', error);
      return false;
    }
  }

  publish(channel: string, event: RealtimeEvent): void {
    this.local.publish(channel, event);
    this.send({ kind: 'event', origin: this.origin, channel, event });
  }

  subscribe(channel: string, listener: (event: RealtimeEvent) => void): () => void {
    return this.local.subscribe(channel, listener);
  }

  /**
   * 本机那半边立刻关，别的实例靠一帧 `close` 各自关自己那份（ADR-0025 第六件）。
   * 这一帧没有"补发"语义：关不上就是关不上，被注销的那个人下一次请求会因为没有会话而失败，
   * 所以这里的失败只记账，不重试。
   */
  closeChannel(channel: string): void {
    this.local.closeChannel(channel);
    this.send({ kind: 'close', origin: this.origin, channel });
  }

  /**
   * 只数本进程的订阅者——线路那半边没有可查的人数（Redis pub/sub 不提供订阅者名册）。
   * 所以这个数的用途是"这台机器上有没有人在听"，不是"全平台有没有人在听"，别拿它做多实例的健康判断。
   */
  subscriberCount(channel?: string): number {
    return this.local.subscriberCount(channel);
  }

  /**
   * **此刻**这条线在不在：两条连接的 `status` 现读，不 await、不缓存、不打网络。
   *
   * 为什么需要它而 `ready` 不够：`ready` 是一次性的闩（那语义是对的，测试与"等头几帧"的人要的就是它），
   * 而 `stats()` 曾经只有它——于是 Redis 比这台进程晚起来的那台，界面上永远写着
   * "没接上——这台实例收不到别机的事件"，可连接层早就自动重连并订上线了（上面那段连接参数
   * 说的正是自愈在连接层）。**功能一直是对的，坏的是读数**，这一格修的是读数。
   *
   * 规则本体在 `wireFromStatuses`（那里能逐对判半开状态），这里只负责拿**现值**去调它。
   *
   * 限度：`status` 是这一进程里 ioredis 对那条 TCP 的看法，不是"订阅仍在服务器那边登记着"的证明；
   * 那句由真投递用例负责（`realtime.redis.integration.test.ts`），不靠这里充数。
   */
  private liveWire(): 'up' | 'pending' | 'down' {
    return wireFromStatuses(this.pub.status, this.sub.status);
  }

  /**
   * 诊断自报（§163）：`wireErrorCount` 就是"这台实例断过几帧"那句话的全部依据——
   * 在这之前它只进 stderr 与测试，界面上看不见。`wireReady` 见字段注释（同步读，不 await），
   * `wire` 是现读的那一格，两者可以合法地不一致，界面上分成两行而不是并成一句。
   */
  stats(): RealtimeBusStats {
    return {
      driver: 'redis',
      instance: this.origin,
      subscriberCount: this.local.subscriberCount(),
      wireReady: this.wireReadyValue,
      wire: this.liveWire(),
      wireErrorCount: this.wireErrorCount,
      // 副本而不是原对象：调用方（诊断端点）不该能改到这台总线的账本
      wireErrorByReason: { ...this.wireErrorByReason },
    };
  }

  /**
   * 关掉两条连接。不在 `RealtimeBus` 接口上：生产者的生命周期不归它管，
   * 只有造出这份总线的人（`bus.ts` 的单例、测试）知道自己什么时候不再需要它。
   *
   * 用 `disconnect()` 而不是 `quit()`：quit 要和服务器一来一回，连都没连上的那条连接
   * 上它会吊住收尾（测试里"死端点"那一条就是这种连接）。这里是本机主动收摊，
   * 不需要跟对面道别。幂等：重复调用不再动连接。
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sub.disconnect();
    this.pub.disconnect();
  }

  private send(frame: RealtimeWireFrame): void {
    // 帧是从内部生产者拿到的 PlainObject（不是任何外部输入），序列化不会失败；
    // 真失败了也不能把发事件的请求带崩，所以整段包在 try 里。
    let payload: string;
    try {
      payload = JSON.stringify(frame);
    } catch (error) {
      this.countWireError('帧序列化', error);
      return;
    }
    // ioredis 返回 Promise；没人接的 rejection 会变成 unhandled rejection，必须接住。
    this.pub.publish(WIRE_CHANNEL, payload).catch((error: unknown) => this.countWireError('投递', error));
  }

  private receive(payload: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      this.countWireError('收到的帧不是 JSON', error);
      return;
    }
    const frame = RealtimeWireFrameSchema.safeParse(parsed);
    if (!frame.success) {
      this.countWireError('收到的帧不合契约', frame.error);
      return;
    }
    // 自己发的那一帧会回环到自己（订的是同一条线路），本机那半边早就送达过了
    if (frame.data.origin === this.origin) return;
    if (frame.data.kind === 'close') {
      this.local.closeChannel(frame.data.channel);
      return;
    }
    this.local.publish(frame.data.channel, frame.data.event);
  }

  private countWireError(context: string, error: unknown): void {
    this.wireErrorCount += 1;
    this.wireErrorByReason[context] = (this.wireErrorByReason[context] ?? 0) + 1;
    console.error(
      `[realtime] redis 驱动 ${context} 失败（第 ${this.wireErrorCount} 次，事件不补发；权威状态在库里）：`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
