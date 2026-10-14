import type { RealtimeEvent } from '@nexus/schemas';
import type { RealtimeBus, RealtimeBusStats } from './bus';

/**
 * 进程内驱动（§163）：默认驱动，单实例正确。
 *
 * 它单独住在这个文件里而不是住在 `bus.ts`，是因为 `redisBus.ts` 要用它做本机那半边的扇出，
 * 而 `bus.ts` 又要拿 `redisBus.ts` 选驱动——两边都 import 同一个模块会成一个环。
 * 接口与频道命名仍住在 `bus.ts`（那是生产者看到的门面）。
 *
 * 一条纪律（从 `bus.ts` 抄过来，两个驱动都要守）：`publish` **不抛异常**。
 * 实时通道是加速器，不是权威来源（见 ADR-0010 的后果第 4 条）——
 * 一个坏掉的订阅者不该把正在写库的那个请求带崩。
 */
export class MemoryRealtimeBus implements RealtimeBus {
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
   *
   * 这一格只在**本进程**成立。跨实例的那一半在 `redisBus.ts`：那里 `closeChannel` 会往线路上
   * 发一帧控制消息，让别的实例各自关掉自己那份订阅（ADR-0025 第六件不能在多实例下只对一个进程生效）。
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

  /**
   * 诊断自报（§163）：这个驱动没有线路，所以 `wireReady` / `wireErrorCount` 都是 `null`
   * ——不是 0。报 0 会被读成"跑着一台从没断过帧的 Redis"，而它根本没有帧可断。
   */
  stats(): RealtimeBusStats {
    return {
      driver: 'in-process',
      instance: `pid:${process.pid}`,
      subscriberCount: this.subscriberCount(),
      wireReady: null,
      wireErrorCount: null,
    };
  }
}
