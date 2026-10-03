import type { RealtimeEvent } from '@nexus/schemas';

/**
 * 实时事件总线（§163 / §94）。取舍见 `docs/adr/0010-realtime-sse-not-websocket.md`。
 *
 * 只做一件事：把生产者发出的事件，送到订阅了同一个频道的连接上。
 * 传输（今天是一条 SSE 长连接）与报文（`RealtimeEventSchema`，早已是契约）都不在这一层里——
 * 所以将来加 Redis 驱动做多实例扇出、甚至补一条 WS 传输，**生产者一行都不用改**。
 *
 * 与 `security/rateLimit.ts` 同一个套路、同一句说明：默认进程内驱动，
 * 单实例正确；多实例部署时换 Redis pub/sub 驱动，接口形状不变。
 * **进程内驱动在多实例下收不到别的实例的事件**，这是要接 Redis 的原因。
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
   * 换成 Redis 驱动时这一格必须照样能做，否则第六件就只在一个进程里成立。
   */
  closeChannel(channel: string): void;
  /** 当前订阅者数量，用于诊断与测试（"有没有人真的在听"） */
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

class MemoryRealtimeBus implements RealtimeBus {
  private readonly listeners = new Map<string, Set<(event: RealtimeEvent) => void>>();

  publish(channel: string, event: RealtimeEvent): void {
    const set = this.listeners.get(channel);
    if (!set?.size) return;
    // 先复制再遍历：订阅者可能在回调里退订（关掉页面就会），直接遍历原集合会漏掉后面的人
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch (error) {
        // 一个订阅者出错不能影响同一频道的其他人，也不能影响发事件的请求
        console.error('[realtime] 订阅者回调出错', channel, event.type, error instanceof Error ? error.message : String(error));
      }
    }
  }

  subscribe(channel: string, listener: (event: RealtimeEvent) => void): () => void {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(channel);
      if (!current) return;
      current.delete(listener);
      // 空集合就删掉，避免长跑进程里按项目累积出一堆空 Set
      if (current.size === 0) this.listeners.delete(channel);
    };
  }

  /**
   * 直接删掉整个 Set：这些订阅者从此收不到这个频道的任何事件。
   * 已经拿到退订函数的那些连接稍后会各自调用它，走到 `listeners.get(channel)` 拿到 undefined
   * 就返回——退订函数本来就是幂等的，这里删掉它不会把别人的订阅误摘。
   */
  closeChannel(channel: string): void {
    this.listeners.delete(channel);
  }

  subscriberCount(channel?: string): number {
    if (channel !== undefined) return this.listeners.get(channel)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

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

export function getRealtimeBus(): RealtimeBus {
  if (!store[GLOBAL_KEY]) store[GLOBAL_KEY] = new MemoryRealtimeBus();
  return store[GLOBAL_KEY];
}

/** 测试用：换掉单例，或清空。传 undefined 恢复默认的内存驱动 */
export function setRealtimeBus(bus: RealtimeBus | undefined): void {
  if (bus) store[GLOBAL_KEY] = bus;
  else delete store[GLOBAL_KEY];
}
