import { afterEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import type { RealtimeEvent, RealtimeWireFrame } from '@nexus/schemas';
import { channels, getRealtimeBus, setRealtimeBus } from '@/server/realtime/bus';
import { MemoryRealtimeBus } from '@/server/realtime/localBus';
import { REDIS_URL_ENV, RedisRealtimeBus, WIRE_CHANNEL } from '@/server/realtime/redisBus';

/**
 * §163 欠的那一格：跨实例扇出。打**真 Redis**（本机 `nexus-redis` 容器，56379），
 * 不用假连接也不 mock —— 这一格唯一要证的正是"两条独立进程各自的本机订阅能不能经由线路连起来"，
 * mock 掉线路就等于把要测的东西测了个空。取舍见 `docs/adr/0028-realtime-redis-fanout.md`。
 *
 * 每条用例都在问一个行为问题，不是问"有没有调用到 ioredis"：
 * 别机的订阅者收得到吗、自己那份会不会收到两次、关门那一帧跨不跨得过去、
 * 线路上坏掉的字节会不会落到本机订阅者嘴里、端点死了业务还被拖着吗。
 */

const REDIS_URL = process.env[REDIS_URL_ENV]?.trim() || 'redis://127.0.0.1:56379';
/** 没人监听的端口：这一格要的正是"连不上"，所以不能借用上面那个真地址 */
const DEAD_URL = 'redis://127.0.0.1:56399';

const note = (title: string): RealtimeEvent => ({ type: 'notification', level: 'info', title });

const opened: RedisRealtimeBus[] = [];
function makeBus(url = REDIS_URL, origin?: string): RedisRealtimeBus {
  const bus = new RedisRealtimeBus({ url, origin });
  opened.push(bus);
  return bus;
}

let wire: Redis | null = null;
/** 直接发到线路上、不经过总线的连接：用来扮演"另一台机器"以及"线路上的坏字节" */
function wireConnection(): Redis {
  wire ??= new Redis(REDIS_URL);
  return wire;
}

const originalEnv = process.env[REDIS_URL_ENV];

afterEach(() => {
  for (const bus of opened) bus.dispose();
  opened.length = 0;
  wire?.disconnect();
  wire = null;
  setRealtimeBus(undefined);
  if (originalEnv === undefined) delete process.env[REDIS_URL_ENV];
  else process.env[REDIS_URL_ENV] = originalEnv;
});

/**
 * 投递断言之前先确认线路真的接上了：`SUBSCRIBE` 要在服务器那边登记、发布连接要 ready，
 * 这中间发到线路上的帧**真的会丢**（这一格明确接受：不补发，权威状态永远在库里）。
 * 用 `ready` 而不是"反复发一帧直到收到"：后者测到的是建连接的竞态，
 * 而且补发出去的那几帧会在断言开始后才到达，把"收到 1 条"变成"收到 2 条"——
 * 2026-10-04 第一版就是这么红的（不是驱动错，是那条 warm-up 自己在漏帧）。
 */
async function wireIsUp(...buses: RedisRealtimeBus[]): Promise<void> {
  for (const bus of buses) {
    // 答案必须是 true：ready=false 的总线在下面的断言里只会表现为"收不到"，
    // 那正是最容易误读成驱动坏了的失败形状
    await expect(bus.ready).resolves.toBe(true);
  }
}

describe('RedisRealtimeBus 跨实例投递', () => {
  it('别机的订阅者收到，自己这台只收到一次（回环那一帧被 origin 摘掉）', async () => {
    const alpha = makeBus();
    const beta = makeBus();
    const channel = channels.project('p-cross');
    await wireIsUp(alpha, beta);

    const seenAlpha: RealtimeEvent[] = [];
    const seenBeta: RealtimeEvent[] = [];
    alpha.subscribe(channel, (event) => seenAlpha.push(event));
    beta.subscribe(channel, (event) => seenBeta.push(event));

    alpha.publish(channel, note('跨实例那一条'));

    // 本机那半边不等线路：publish 返回时同进程的订阅者已经拿到了
    expect(seenAlpha).toHaveLength(1);
    await expect.poll(() => seenBeta.length, { timeout: 15_000, interval: 100 }).toBe(1);
    // 走过的是一趟 JSON + zod，不是同一个对象引用——字段得原样到达
    expect(seenBeta[0]).toEqual({ type: 'notification', level: 'info', title: '跨实例那一条' });
    // seenAlpha 停在 1 就是去重的见证：alpha 自己也订了那条线路，
    // 少了 origin 那一刀，这里会是 2（本机一份 + 回环一份），Studio 会出现同一个进度条动两次
    expect(seenAlpha).toHaveLength(1);
  });

  it('closeChannel 跨实例生效：别的实例上那个频道的订阅被摘掉，其他频道照旧', async () => {
    const alpha = makeBus();
    const beta = makeBus();
    const gone = channels.user('gone');
    const staying = channels.project('still-here');
    await wireIsUp(alpha, beta);

    const seenGone: RealtimeEvent[] = [];
    const seenStaying: RealtimeEvent[] = [];
    beta.subscribe(gone, (event) => seenGone.push(event));
    beta.subscribe(staying, (event) => seenStaying.push(event));

    // 对照（先证明这条频道是活的，"之后收不到"才不是白断言）
    alpha.publish(gone, note('关门之前'));
    await expect.poll(() => seenGone.length, { timeout: 15_000, interval: 100 }).toBe(1);

    alpha.closeChannel(gone);

    // 关门在 beta 上直接可见：不是"没收到"这种反证，是订阅者人数归零
    await expect.poll(() => beta.subscriberCount(gone), { timeout: 15_000, interval: 100 }).toBe(0);
    expect(alpha.subscriberCount(gone)).toBe(0);

    alpha.publish(gone, note('关门之后'));
    await expect.poll(() => beta.subscriberCount(staying), { timeout: 15_000, interval: 100 }).toBe(1);
    expect(seenGone).toHaveLength(1); // 只有关门之前那一条

    // 这不是把 beta 的总线整个关了：别的频道还活着（ADR-0025 第六件说的是这个人的频道）
    alpha.publish(staying, note('别的频道照旧'));
    await expect.poll(() => seenStaying.length, { timeout: 15_000, interval: 100 }).toBe(1);
  });

  it('线路上的帧先过契约：合法的收下来，坏字节只记账，不落本机订阅者', async () => {
    const alpha = makeBus();
    const channel = channels.user('wire-in');
    const seen: RealtimeEvent[] = [];
    alpha.subscribe(channel, (event) => seen.push(event));

    const good: RealtimeWireFrame = { kind: 'event', origin: '别的实例', channel, event: note('合法的帧') };
    await wireIsUp(alpha);
    await wireConnection().publish(WIRE_CHANNEL, JSON.stringify(good));
    // 对照组：同一台、同一频道，合法帧刚刚真的落到了本机订阅者嘴里
    await expect.poll(() => seen.length, { timeout: 15_000, interval: 100 }).toBe(1);

    const errorsBefore = alpha.wireErrorCount;
    // 两种坏法都要试：根本不是 JSON 的字节，以及结构合但 event 少了必填字段的帧
    const badEvent: unknown = { kind: 'event', origin: '别的实例', channel, event: { type: 'notification', level: 'info' } };
    await wireConnection().publish(WIRE_CHANNEL, '这不是 JSON');
    await wireConnection().publish(WIRE_CHANNEL, JSON.stringify(badEvent));

    await expect.poll(() => alpha.wireErrorCount - errorsBefore, { timeout: 15_000, interval: 100 }).toBeGreaterThanOrEqual(2);
    // 两帧都没到（还是 1 条，就是合法那一条）：线路上的字节不能因为"是我们自己发的"就直接对象化
    expect(seen).toHaveLength(1);
  });

  it('自己的 origin 不处理：同一台机器发的帧不会二次送达', async () => {
    const alpha = makeBus(REDIS_URL, 'fixed-origin');
    const channel = channels.project('loopback');
    const seen: RealtimeEvent[] = [];
    alpha.subscribe(channel, (event) => seen.push(event));

    await wireIsUp(alpha);
    const mine: RealtimeWireFrame = { kind: 'event', origin: alpha.origin, channel, event: note('自己发的') };
    await wireConnection().publish(WIRE_CHANNEL, JSON.stringify(mine));
    // 这一帧带着 alpha 自己的 origin，也就是 `alpha.publish` 之后从线路上回来那一份的形状：
    // 本机订阅者在 publish 当时就已经拿到过了，回来这一份必须跳过，否则同一条事件送达两次。
    // 拿"紧接着另一台的那条真的到了"来给这次跳过定界，否则这里等到的只是超时。
    const theirs: RealtimeWireFrame = { kind: 'event', origin: '另一台', channel, event: note('别人发的') };
    await wireConnection().publish(WIRE_CHANNEL, JSON.stringify(theirs));
    await expect.poll(() => seen.length, { timeout: 15_000, interval: 100 }).toBe(1);
    // 到的那一条是别人的（去重坏了这里会是两条，第一条是"自己发的"）
    expect(seen[0]).toEqual({ type: 'notification', level: 'info', title: '别人发的' });
  });

  it('端点连不上时 publish/closeChannel 都不抛，本机那半边照送', async () => {
    const dead = makeBus(DEAD_URL);
    const channel = channels.project('dead-wire');
    const seen: RealtimeEvent[] = [];
    dead.subscribe(channel, (event) => seen.push(event));

    expect(() => dead.publish(channel, note('线路是坏的'))).not.toThrow();
    expect(() => dead.closeChannel(channel)).not.toThrow();
    // 实时通道是加速器不是权威来源：坏线路不能把正在写库的那个请求带崩，
    // 也不能让同进程的订阅者白等——本机那一半边不依赖 Redis
    expect(seen).toHaveLength(1);
    await expect.poll(() => dead.wireErrorCount, { timeout: 5_000, interval: 50 }).toBeGreaterThan(0);
    // ready 说的是不是"这条总线接上线了"，用假不了的反证钉一次：
    // 端点连不上时它必须落定为 false，而不是吊在"订阅命令已经发出去了"这种半路上
    await expect(dead.ready).resolves.toBe(false);
  });
});

describe('驱动选择（bus.ts 的那一刀）', () => {
  it('默认进程内；只有 NEXUS_REDIS_URL 非空才换 Redis 扇出', () => {
    delete process.env[REDIS_URL_ENV];
    setRealtimeBus(undefined);
    expect(getRealtimeBus()).toBeInstanceOf(MemoryRealtimeBus);

    // 空串/全空格不算 URL：设了个空值的人想要的是"没设"，不是"连一个空地址"
    process.env[REDIS_URL_ENV] = '   ';
    setRealtimeBus(undefined);
    expect(getRealtimeBus()).toBeInstanceOf(MemoryRealtimeBus);

    process.env[REDIS_URL_ENV] = REDIS_URL;
    setRealtimeBus(undefined);
    const bus = getRealtimeBus();
    expect(bus).toBeInstanceOf(RedisRealtimeBus);
    // 单例还是单例：dev 下每条路由可能各自拿到一份模块图，跨实例扇出不能一条路由一份连接
    expect(getRealtimeBus()).toBe(bus);
    (bus as RedisRealtimeBus).dispose();
  });
});
