import { afterEach, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@nexus/schemas';
import { channels, getRealtimeBus, setRealtimeBus, type RealtimeBus } from '@/server/realtime/bus';
import { MemoryRealtimeBus } from '@/server/realtime/localBus';
import {
  activeConnections,
  acquireConnection,
  MAX_CONNECTIONS_PER_USER,
  releaseConnection,
} from '@/server/realtime/connections';

/**
 * §163 的事件总线与连接计数。两者都是纯内存、不碰数据库，所以在这里把"确定性"钉死：
 * 该送到的送到、该隔离的隔离、该释放的释放。取舍见
 * `docs/adr/0010-realtime-sse-not-websocket.md`。
 */

const note = (title: string): RealtimeEvent => ({ type: 'notification', level: 'info', title });

afterEach(() => {
  setRealtimeBus(undefined);
});

describe('RealtimeBus', () => {
  it('送到同一频道上的订阅者，不跨频道泄漏', () => {
    const bus = getRealtimeBus();
    const a: RealtimeEvent[] = [];
    const b: RealtimeEvent[] = [];
    bus.subscribe(channels.project('p1'), (e) => a.push(e));
    bus.subscribe(channels.project('p2'), (e) => b.push(e));

    bus.publish(channels.project('p1'), note('给 p1 的'));

    expect(a).toHaveLength(1);
    expect(b).toEqual([]);
  });

  it('同一个频道上的多个订阅者都收到（多标签页要一起亮）', () => {
    const bus = getRealtimeBus();
    const first: RealtimeEvent[] = [];
    const second: RealtimeEvent[] = [];
    bus.subscribe(channels.user('u1'), (e) => first.push(e));
    bus.subscribe(channels.user('u1'), (e) => second.push(e));

    bus.publish(channels.user('u1'), note('都该收到'));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it('没有订阅者时不抛异常（事件不持久化，没人听就丢掉）', () => {
    const bus = getRealtimeBus();
    expect(() => bus.publish(channels.project('nobody'), note('无人接收'))).not.toThrow();
  });

  it('退订之后不再收到，且退订是幂等的', () => {
    const bus = getRealtimeBus();
    const seen: RealtimeEvent[] = [];
    const off = bus.subscribe(channels.project('p1'), (e) => seen.push(e));

    bus.publish(channels.project('p1'), note('第一条'));
    off();
    bus.publish(channels.project('p1'), note('第二条'));
    expect(() => off()).not.toThrow();
    bus.publish(channels.project('p1'), note('第三条'));

    expect(seen.map((e) => (e.type === 'notification' ? e.title : e.type))).toEqual(['第一条']);
  });

  it('退订只摘自己，不影响同一频道上的其他人', () => {
    const bus = getRealtimeBus();
    const kept: RealtimeEvent[] = [];
    const dropped: RealtimeEvent[] = [];
    const off = bus.subscribe(channels.project('p1'), (e) => dropped.push(e));
    bus.subscribe(channels.project('p1'), (e) => kept.push(e));

    off();
    bus.publish(channels.project('p1'), note('还在的人收到'));

    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(1);
  });

  it('一个订阅者抛异常不影响同频道的其他人，也不影响发布方', () => {
    const bus = getRealtimeBus();
    const survivor: RealtimeEvent[] = [];
    bus.subscribe(channels.project('p1'), () => {
      throw new Error('这个订阅者坏了');
    });
    bus.subscribe(channels.project('p1'), (e) => survivor.push(e));

    // 实时通道是加速器不是权威来源：坏掉的订阅者不能把正在写库的请求带崩
    expect(() => bus.publish(channels.project('p1'), note('继续送'))).not.toThrow();
    expect(survivor).toHaveLength(1);
  });

  it('订阅者在回调里退订自己，不会漏掉后面的人', () => {
    const bus = getRealtimeBus();
    const second: RealtimeEvent[] = [];
    let offSelf: (() => void) | null = null;
    offSelf = bus.subscribe(channels.project('p1'), () => offSelf?.());
    bus.subscribe(channels.project('p1'), (e) => second.push(e));

    bus.publish(channels.project('p1'), note('一次'));

    expect(second).toHaveLength(1);
    expect(bus.subscriberCount(channels.project('p1'))).toBe(1);
  });

  it('subscriberCount 如实报数，退订后频道被清掉', () => {
    const bus = getRealtimeBus();
    expect(bus.subscriberCount()).toBe(0);
    const off = bus.subscribe(channels.user('u1'), () => undefined);
    expect(bus.subscriberCount(channels.user('u1'))).toBe(1);
    expect(bus.subscriberCount()).toBe(1);
    off();
    expect(bus.subscriberCount(channels.user('u1'))).toBe(0);
    expect(bus.subscriberCount()).toBe(0);
  });

  it('closeChannel 摘掉这个频道上的全部订阅，别的频道照旧收得到', () => {
    const bus = getRealtimeBus();
    const closed: RealtimeEvent[] = [];
    const other: RealtimeEvent[] = [];
    bus.subscribe(channels.user('gone'), (e) => closed.push(e));
    bus.subscribe(channels.user('gone'), (e) => closed.push(e));
    bus.subscribe(channels.project('p1'), (e) => other.push(e));
    expect(bus.subscriberCount(channels.user('gone'))).toBe(2);

    bus.closeChannel(channels.user('gone'));

    // 两个订阅者一起摘掉，并且之后的 publish 一条也不送达（§144 第六件：注销后不再向他推任何东西）
    bus.publish(channels.user('gone'), note('注销之后的事件'));
    expect(closed).toEqual([]);
    expect(bus.subscriberCount(channels.user('gone'))).toBe(0);
    // 对照：这不是"把总线关了"，别的频道还是活的
    bus.publish(channels.project('p1'), note('还在的人收到'));
    expect(other).toHaveLength(1);
  });

  it('closeChannel 之后，拿着旧退订函数的人再调用一次不会抛，也不会误摘新订阅', () => {
    const bus = getRealtimeBus();
    const off = bus.subscribe(channels.user('gone'), () => undefined);
    bus.closeChannel(channels.user('gone'));
    // SSE 那条连接关掉时照常调用它自己那份退订——频道集合早没了，必须是无操作
    expect(() => off()).not.toThrow();

    const seen: RealtimeEvent[] = [];
    const renewed = bus.subscribe(channels.user('gone'), (e) => seen.push(e));
    off();
    bus.publish(channels.user('gone'), note('重新订阅的人收到'));
    expect(seen).toHaveLength(1);
    // 频道也没被永久封死：注销是关上门，不是把这路频道名从总线里抹掉
    renewed();
  });

  it('closeChannel 对没有订阅的频道与已经不存在的频道都是无操作', () => {
    const bus = getRealtimeBus();
    expect(() => bus.closeChannel(channels.user('never-subscribed'))).not.toThrow();
    expect(bus.subscriberCount()).toBe(0);
    const off = bus.subscribe(channels.user('u2'), () => undefined);
    off();
    expect(() => bus.closeChannel(channels.user('u2'))).not.toThrow();
  });

  it('总线可替换（多实例扇出换 Redis 驱动时生产者不用改）', () => {
    const seen: RealtimeEvent[] = [];
    const fake: RealtimeBus = {
      publish: (_channel, event) => seen.push(event),
      subscribe: () => () => undefined,
      closeChannel: () => undefined,
      subscriberCount: () => 0,
      stats: () => ({ driver: 'in-process', instance: 'test-double', subscriberCount: 0, wireReady: null, wireErrorCount: null }),
    };
    setRealtimeBus(fake);
    getRealtimeBus().publish(channels.project('p1'), note('走的是替换后的驱动'));
    expect(seen).toHaveLength(1);
  });

  it('stats() 自报家门：进程内驱动的线路两格是 null 不是 0（没帧可断）', () => {
    const bus = new MemoryRealtimeBus();
    expect(bus.stats()).toEqual({
      driver: 'in-process',
      instance: `pid:${process.pid}`,
      subscriberCount: 0,
      wireReady: null,
      wireErrorCount: null,
    });
    bus.subscribe(channels.project('p1'), () => undefined);
    bus.subscribe(channels.user('u1'), () => undefined);
    expect(bus.stats().subscriberCount).toBe(2);
  });

  it('stats() 读的是单例——替换总线后诊断拿到的是替换后那份', () => {
    setRealtimeBus({
      publish: () => undefined,
      subscribe: () => () => undefined,
      closeChannel: () => undefined,
      subscriberCount: () => 3,
      stats: () => ({ driver: 'in-process', instance: 'test-double', subscriberCount: 3, wireReady: null, wireErrorCount: null }),
    });
    expect(getRealtimeBus().stats().instance).toBe('test-double');
    expect(getRealtimeBus().stats().subscriberCount).toBe(3);
  });
});

describe('连接计数', () => {
  const user = `cap-${Date.now()}`;

  it('到上限就拒绝，释放之后又能进来', () => {
    for (let i = 0; i < MAX_CONNECTIONS_PER_USER; i += 1) {
      expect(acquireConnection(user)).toBe(true);
    }
    expect(activeConnections(user)).toBe(MAX_CONNECTIONS_PER_USER);
    // 上限之外不再放行：每条连接都握着订阅与心跳定时器，不能让客户端说了算
    expect(acquireConnection(user)).toBe(false);

    releaseConnection(user);
    expect(activeConnections(user)).toBe(MAX_CONNECTIONS_PER_USER - 1);
    expect(acquireConnection(user)).toBe(true);
  });

  it('释放到 0 之后计数归零，不会变成负数把用户永久挡在外面', () => {
    const solo = `${user}-solo`;
    acquireConnection(solo);
    releaseConnection(solo);
    releaseConnection(solo); // 多释放一次（abort 与 cancel 都可能触发收尾）
    expect(activeConnections(solo)).toBe(0);
    expect(acquireConnection(solo)).toBe(true);
    releaseConnection(solo);
  });

  it('各用户各算各的', () => {
    const a = `${user}-a`;
    const b = `${user}-b`;
    acquireConnection(a);
    expect(activeConnections(a)).toBe(1);
    expect(activeConnections(b)).toBe(0);
    releaseConnection(a);
  });
});
