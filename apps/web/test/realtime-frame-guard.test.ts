import { afterEach, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@nexus/schemas';
import { channels } from '@/server/realtime/bus';
import { MAX_FRAME_BYTES, RedisRealtimeBus } from '@/server/realtime/redisBus';

/**
 * §SC-55 MQ 候选③ — 发送端帧护栏的判分（64 KiB）。
 *
 * 每一条用例打的都是 "pub/sub 没有背压" 这个根上的洞：线路上不去、也不忍丢包，
 * 所以决定这一帧能不能上线路的唯一地方是这里——不是 Redis、不是订阅者、不是重试。
 *
 * 用的是「没人监听的端口」（`56399`）：判据问的是"大帧到底到没到 `ioredis`"——
 * 若实现不到位，死端口会恰好把它藏起来（`publish` 只是在 Promise 里拒绝、同步计数不到『投递』）。
 * 真线路不属于这一格的职责，真线路在 `realtime.redis.integration.test.ts` 里。
 */

const DEAD_URL = 'redis://127.0.0.1:56399';

const note = (title: string): RealtimeEvent => ({ type: 'notification', level: 'info', title });

const opened: RedisRealtimeBus[] = [];
function makeBus(): RedisRealtimeBus {
  const bus = new RedisRealtimeBus({ url: DEAD_URL });
  opened.push(bus);
  return bus;
}

afterEach(() => {
  while (opened.length) opened.pop()!.dispose();
});

describe('发送端帧护栏（§SC-55，MAX_FRAME_BYTES = 64 KiB）', () => {
  it('超大帧就地丢弃、记账，本机那一半照常送达', () => {
    const bus = makeBus();
    const received: RealtimeEvent[] = [];
    bus.subscribe(channels.project('p1'), (event) => received.push(event));

    bus.publish(channels.project('p1'), note('x'.repeat(MAX_FRAME_BYTES + 1024)));

    // 本机半边不排队、不等线路——这一半必须先动，哪怕线路上大帧被护栏拦下
    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('notification');
    expect(bus.stats().wireErrorByReason!['帧超长']).toBe(1);
    expect(bus.stats().wireErrorByReason!['投递']).toBe(0);
    expect(bus.stats().wireErrorByReason!['帧序列化']).toBe(0);
  });

  it('连续两发超限帧，计数恰好是 2，不出现"几乎送达"', () => {
    const bus = makeBus();
    bus.publish(channels.project('p1'), note('y'.repeat(MAX_FRAME_BYTES + 512)));
    bus.publish(channels.project('p1'), note('z'.repeat(MAX_FRAME_BYTES + 512)));
    expect(bus.stats().wireErrorByReason!['帧超长']).toBe(2);
    expect(bus.stats().wireErrorByReason!['投递']).toBe(0);
  });

  it('护栏边界：恰好略低于上限的帧不被误伤', () => {
    const bus = makeBus();
    const payloadFree = MAX_FRAME_BYTES - 1024; // 留 1 KiB 给结构开销，仍压不到护栏
    bus.publish(channels.project('p1'), note('a'.repeat(payloadFree)));
    expect(bus.stats().wireErrorByReason!['帧超长']).toBe(0);
  });
});
