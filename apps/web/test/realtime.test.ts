import { afterEach, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@nexus/schemas';
import { channels, getRealtimeBus, setRealtimeBus, type RealtimeBus } from '@/server/realtime/bus';
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

  it('总线可替换（多实例扇出换 Redis 驱动时生产者不用改）', () => {
    const seen: RealtimeEvent[] = [];
    const fake: RealtimeBus = {
      publish: (_channel, event) => seen.push(event),
      subscribe: () => () => undefined,
      subscriberCount: () => 0,
    };
    setRealtimeBus(fake);
    getRealtimeBus().publish(channels.project('p1'), note('走的是替换后的驱动'));
    expect(seen).toHaveLength(1);
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
