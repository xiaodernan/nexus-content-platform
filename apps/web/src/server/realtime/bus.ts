import type { RealtimeEvent } from '@nexus/schemas';
import { MemoryRealtimeBus } from './localBus';
import { REDIS_URL_ENV, RedisRealtimeBus, WIRE_CHANNEL } from './redisBus';

/**
 * 实时事件总线（§163 / §94）。取舍见 `docs/adr/0010-realtime-sse-not-websocket.md`。
 *
 * 只做一件事：把生产者发出的事件，送到订阅了同一个频道的连接上。
 * 传输（今天是一条 SSE 长连接）与报文（`RealtimeEventSchema`，早已是契约）都不在这一层里——
 * 所以加 Redis 驱动做多实例扇出、甚至补一条 WS 传输，**生产者一行都不用改**。
 *
 * 与 `security/rateLimit.ts` 同一个套路：这一层有两个驱动，选哪个看环境变量——
 * 默认 `MemoryRealtimeBus`（进程内，单实例正确，**在多实例下收不到别的实例的事件**），
 * 设了 `NEXUS_REDIS_URL` 才换成 `RedisRealtimeBus`（跨实例扇出，见 `docs/adr/0028-…`）。
 * 两个驱动都实现下面这四个方法，所以换驱动不换调用方。
 *
 * 一条纪律：`publish` **不抛异常**。实时通道是加速器，不是权威来源（见 ADR 的后果第 4 条）——
 * 一个坏掉的订阅者不该把正在写库的那个请求带崩。
 */

export interface RealtimeBus {
  /** 发一条事件。没有订阅者时静默丢弃（事件不是持久化的，权威状态永远在库里） */
  publish(channel: string, event: RealtimeEvent): void;
  /** 订阅一个频道，返回退订函数。退订必须幂等：重复调用不能把别人的订阅摘掉 */
  subscribe(channel: string, listener: (event: RealtimeEvent) => void): () => void;
  /**
   * 摘掉这个频道上本进程内的全部订阅，之后的 `publish` 一条也不送达这些人（§144 / ADR-0025 第六件：
   * 账号注销之后不该再向他推任何东西）。
   *
   * 它停的是**推送**，不是**连接**：已经打开的那条 SSE 还挂着，只是再也收不到事件；
   * 这个人的下一次请求会因为没有会话而失败。今天这条总线没有任何"从服务端掐断一条 HTTP 长连接"
   * 的原语（`connections.ts` 只数人数），所以界面上不写"连接已断开"这种话。
   * 两个驱动都做得到：进程内驱动删掉本地那份订阅，Redis 驱动另外往线路上发一帧 `close`，
   * 让别的实例各自关掉自己那份——第六件因此不只在一个进程里成立。
   */
  closeChannel(channel: string): void;
  /**
   * 当前订阅者数量，用于诊断与测试（"有没有人真的在听"）。
   * Redis 驱动下这是**本进程**的人数：pub/sub 线路查不到远端有谁在订，别拿它当全平台的数。
   */
  subscriberCount(channel?: string): number;
}

/**
 * 频道命名。项目频道给 Studio 用；用户频道给 §164 的通知用
 * ——`RealtimeEventSchema` 里 `notification` 的 `projectId` 是可选的，
 * 所以通知不能只挂在项目频道上（用户可能还没打开任何项目）。
 */
export const channels = {
  project: (projectId: string) => `project:${projectId}`,
  user: (userId: string) => `user:${userId}`,
};

/**
 * 单例挂在 globalThis 上，不是模块变量。
 *
 * 这不是"防止热更新丢状态"那种客套：dev 下 Next 会为不同的 route 编译出各自的模块图，
 * 发事件的那条路由（`/api/ai/run`、`/api/published/interact`）与持连接的那条
 * （`/api/realtime`）**可能各自拿到一份模块实例**。挂在模块变量上，一边 publish 到
 * 自己那份空总线，另一边在自己那份上等——测试全绿（vitest 里只有一个实例），浏览器里
 * 永远收不到。这是全局缓存的标准做法（Next 官方对 dev 单例的同一建议）。
 */
const GLOBAL_KEY = '__nexus_realtime_bus__';
type GlobalStore = typeof globalThis & { [GLOBAL_KEY]?: RealtimeBus };

const store = globalThis as GlobalStore;

/**
 * 选驱动：只看 `NEXUS_REDIS_URL`，非空即用 Redis 扇出，否则进程内。
 *
 * 为什么默认还是进程内：本机开发、vitest、e2e 都只有一个 web 进程，跨实例那一格在那里
 * 不是被测试的功能而是多余的依赖；而"多实例部署"是真的需要时才打开的开关。
 * 这条开关是 opt-in 的，所以建单例那一刻会把**装上了哪个驱动**打进日志——
 * 只看环境变量的人会在"设了但没生效"和"生效了但没人说"之间分不清。
 *
 * 不做的事：不在连接失败时悄悄退回进程内。那会让一台配了 Redis 的实例看起来正常、
 * 实际上收不到别家的事件，比直接报错更难查（`RedisRealtimeBus` 自己在 `publish` 里
 * 记账并放行业务，那是同一句话的另一半：线路坏了不拖垮请求，但要说出来）。
 */
function createDefaultBus(): RealtimeBus {
  const url = process.env[REDIS_URL_ENV]?.trim();
  if (!url) {
    console.log(`[realtime] 驱动=进程内（单实例；多实例部署设 ${REDIS_URL_ENV} 换成 Redis 扇出）`);
    return new MemoryRealtimeBus();
  }
  console.log(`[realtime] 驱动=Redis 扇出（线路 ${WIRE_CHANNEL}）`);
  return new RedisRealtimeBus({ url });
}

export function getRealtimeBus(): RealtimeBus {
  if (!store[GLOBAL_KEY]) store[GLOBAL_KEY] = createDefaultBus();
  return store[GLOBAL_KEY];
}

/**
 * 测试用：换掉单例，或清空。传 undefined 恢复默认的驱动选择（也就是重新读一次环境变量）。
 *
 * 换掉之前手上那份 Redis 驱动请自己 `dispose()`——接口里没有这一格（生产者的生命周期
 * 不归总线门面管），漏掉就是漏掉两条到 Redis 的连接。
 */
export function setRealtimeBus(bus: RealtimeBus | undefined): void {
  if (bus) store[GLOBAL_KEY] = bus;
  else delete store[GLOBAL_KEY];
}
