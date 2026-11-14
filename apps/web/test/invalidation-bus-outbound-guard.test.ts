import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DISCOVER_INVALIDATE_CHANNEL,
  MAX_VIEWERS_PER_FRAME,
  MAX_VIEWER_ID_LENGTH,
  MemoryInvalidationBus,
  MemoryInvalidationHub,
  RedisInvalidationBus,
  parseInvalidationFrame,
  type RedisLike,
} from '../src/server/domain/invalidation-bus';

/**
 * §MQ-2 / ADR-0149：失效总线**发送侧**有界性 + 诚实账本（承接 ADR-0126 留白的 "MQ 候选③"条数维度）。
 *
 * ADR-0126/0127 已把**接收侧** `parseInvalidationFrame` 的护栏钉死（定向帧 1≤条数≤128、每个 id
 * 1..128 字符）；ADR-0132/§SC-55 又给**另一条线路**（realtime redisBus）加了 64 KiB **字节**护栏。
 * 本片补的是本模块**发送侧**缺席的同构护栏：`MemoryInvalidationBus.publish` 与
 * `RedisInvalidationBus.publish` 今天只挡空集，超界定向帧照样序列化、照样 `published += 1`，
 * 而接收侧必然把它当坏帧丢（`errors += 1`、`received/applied` 不增）——制造出
 * "发布侧记成功、每个对端必然丢弃"的**诚实账本谎**。
 *
 * 定性（不夸大）：生产调用方 `blocks.ts`/`social.ts` 每次最多 2 个 viewer，碰不到 128，
 * 故这是**公共接口的 latent 契约缺口**（`publish(viewerIds)` 是 public、`invalidateDiscoverFor`
 * 是 rest 参数），不是正在发生的事故。修法对齐 ADR-0132 已固化纪律：**发送侧 fail-safe 就地拒绝、
 * 记 error、`published` 不虚记**；本地 `bumpLocal` 已在 `invalidateInStore` 先做（本机即时生效不破），
 * 远端最坏退回 15s TTL 自愈（ADR-0114 边界原样成立）。**不改 `InvalidationBusStats` 字段形状**、
 * 不动接收侧、不动 `discover-cache`、不动前端——与 §MQ-1 同一"行为收紧、字段零变"口径。
 *
 * 判据全纯内存：hub 双 bus 往返 + 假连接 Redis 驱动 + 源码静态绑定门；零真 Redis / 零真库 /
 * 零 sleep / 零时钟。核心不变式一句话：
 *   **发送侧 `published` 记的每一帧，都必须是接收侧 `parseInvalidationFrame` 认的合法帧。**
 */

/** 造一对共享 hub 的 bus：A 发 B 收，各挂一个抓帧订阅，A 自己回环被 origin 去重。 */
function makePair() {
  const hub = new MemoryInvalidationHub();
  const a = new MemoryInvalidationBus(hub);
  const b = new MemoryInvalidationBus(hub);
  const seenA: string[][] = [];
  const seenB: string[][] = [];
  a.subscribe((ids) => seenA.push(ids));
  b.subscribe((ids) => seenB.push(ids));
  return { hub, a, b, seenA, seenB, dispose: () => { a.dispose(); b.dispose(); } };
}

/** 假 ioredis 连接：只保留发帧所需表面 + 记录上线路的 payload。 */
function fakeRedis(overrides: { publishFail?: boolean } = {}): RedisLike & {
  published: Array<[string, string]>;
  handlers: Map<string, (...args: any[]) => void>;
} {
  const handlers = new Map<string, (...args: any[]) => void>();
  const published: Array<[string, string]> = [];
  return {
    published,
    handlers,
    on(event, listener) { handlers.set(event, listener); return this; },
    async subscribe() { return 1; },
    async publish(channel, payload) {
      if (overrides.publishFail) throw new Error('publish failed');
      published.push([channel, payload]);
      return 1;
    },
    disconnect() { /* no-op */ },
  } as RedisLike & { published: Array<[string, string]>; handlers: Map<string, (...args: any[]) => void> };
}

/**
 * 造一"发"一"收"两条**不同 origin** 的 Redis bus（模拟两个进程），并把发方上线路的帧
 * 手工投递给收方的 message handler——走过的正是生产 `RedisInvalidationBus` 的真实收发路径，
 * 而不是自发自收被 origin 回环去重吞掉。
 */
function makeRedisPair() {
  const pubA = fakeRedis();
  const subA = fakeRedis();
  const pubB = fakeRedis();
  const subB = fakeRedis();
  const a = new RedisInvalidationBus(pubA, subA, { url: 'redis://fake', origin: 'proc-a' });
  const b = new RedisInvalidationBus(pubB, subB, { url: 'redis://fake', origin: 'proc-b' });
  const seenB: Array<[string[], boolean | undefined]> = [];
  b.subscribe((ids, global) => seenB.push([ids, global]));
  /** 把发方第 n 帧投给收方；返回是否真投递过（发方没上线路就不投）。 */
  const deliver = (n: number): boolean => {
    const wire = pubA.published[n];
    if (!wire) return false;
    const message = subB.handlers.get('message') as (channel: string, payload: string) => void;
    message(wire[0], wire[1]);
    return true;
  };
  return { a, b, pubA, seenB, deliver, dispose: () => { a.dispose(); b.dispose(); } };
}

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `u${i}`);
const longId = (): string => 'x'.repeat(MAX_VIEWER_ID_LENGTH + 1);

describe('§MQ-2 内存驱动发送侧守界（发送侧账本不得虚记）', () => {
  it('超界定向帧（MAX+1）：就地拒绝，published 不虚记、errors 记 1、对端零动静', () => {
    const { a, b, seenB, dispose } = makePair();
    expect(() => a.publish(ids(MAX_VIEWERS_PER_FRAME + 1))).not.toThrow(); // write path 绝不抛
    // 修复前：published=1、errors=0；对端把坏帧丢掉记 errors=1 —— 正是要钉死的谎。
    expect(a.stats().published).toBe(0);
    expect(a.stats().errors).toBe(1);
    expect(b.stats().received).toBe(0);
    expect(b.stats().errors).toBe(0); // 坏帧根本没上线路，对端不该背锅
    expect(b.stats().applied).toBe(0);
    expect(seenB).toEqual([]);
    dispose();
  });

  it('恰好在上限（MAX）的合法帧放行、逐字等价，不误伤（零回归对照）', () => {
    const { a, b, seenB, dispose } = makePair();
    const atLimit = ids(MAX_VIEWERS_PER_FRAME);
    a.publish(atLimit);
    expect(a.stats().published).toBe(1);
    expect(a.stats().errors).toBe(0);
    expect(b.stats()).toMatchObject({ received: 1, applied: MAX_VIEWERS_PER_FRAME, errors: 0 });
    expect(seenB).toEqual([atLimit]);
    dispose();
  });

  it('单个 id 超长（MAX_VIEWER_ID_LENGTH+1）：整帧拒绝（发送侧守与接收侧同一界）', () => {
    const { a, b, seenB, dispose } = makePair();
    a.publish(['ok', longId()]);
    // 修复前：帧上线路，对端 parse 因超长 id 判坏帧丢弃；发布侧却记了 published。
    expect(a.stats().published).toBe(0);
    expect(a.stats().errors).toBe(1);
    expect(b.stats().received).toBe(0);
    expect(seenB).toEqual([]);
    dispose();
  });

  it('空字符串 id：整帧拒绝（接收侧也拒，发送侧不能先记成功）', () => {
    const { a, b, seenB, dispose } = makePair();
    a.publish(['u1', '']);
    expect(a.stats().published).toBe(0);
    expect(a.stats().errors).toBe(1);
    expect(b.stats().received).toBe(0);
    expect(seenB).toEqual([]);
    dispose();
  });

  it('零回归：空集定向帧仍是 no-op（不记 published，也不该记 error）', () => {
    const { a, b, seenB, dispose } = makePair();
    a.publish([]);
    expect(a.stats().published).toBe(0);
    expect(a.stats().errors).toBe(0); // 正常 no-op，不是坏帧
    expect(b.stats().received).toBe(0);
    expect(seenB).toEqual([]);
    dispose();
  });

  it('零回归：全局帧（global=true + 空 viewerIds）不受定向护栏影响，照常收发', () => {
    const { a, b, seenB, dispose } = makePair();
    a.publish([], true);
    expect(a.stats().published).toBe(1);
    expect(a.stats().errors).toBe(0);
    expect(b.stats()).toMatchObject({ received: 1, applied: 1, errors: 0 }); // 全局帧记 1 次处置
    expect(seenB).toEqual([[]]);
    dispose();
  });

  it('不变量穷举各档条数：published +1 ⇔ 对端 received +1 且 errors 不增', () => {
    for (const n of [1, 2, MAX_VIEWERS_PER_FRAME, MAX_VIEWERS_PER_FRAME + 1, MAX_VIEWERS_PER_FRAME * 2]) {
      const { a, b, dispose } = makePair();
      a.publish(ids(n));
      const over = n > MAX_VIEWERS_PER_FRAME;
      expect({ n, pub: a.stats().published, rec: b.stats().received, err: b.stats().errors }).toEqual({
        n,
        pub: over ? 0 : 1,
        rec: over ? 0 : 1,
        err: 0,
      });
      dispose();
    }
  });

  it('账本-线路恒等：published 只记真正上线路的帧（超界不记、合法记满、不重复）', () => {
    const hub = new MemoryInvalidationHub();
    let wireFrames = 0;
    hub.attach(() => { wireFrames += 1; }); // 线路中枢抓包，不过 dispatcher 去重
    const a = new MemoryInvalidationBus(hub);
    const b = new MemoryInvalidationBus(hub);
    b.subscribe(() => undefined);
    a.publish(ids(2));
    a.publish(ids(MAX_VIEWERS_PER_FRAME + 1)); // 超界：不该上线路
    a.publish([], true); // 全局：该上线路
    expect(wireFrames).toBe(2); // 2 帧合法上线路（定向小帧 + 全局帧）
    expect(a.stats().published).toBe(2); // 账本与线路逐帧相等，不虚记不漏记
    a.dispose();
    b.dispose();
  });

  it('dispose 后超界 publish 仍不记账（生命周期与守界叠加，零回归）', () => {
    const { a, b, dispose } = makePair();
    a.dispose();
    a.publish(ids(MAX_VIEWERS_PER_FRAME + 1));
    expect(a.stats().published).toBe(0);
    expect(b.stats().received).toBe(0);
    dispose();
  });
});

describe('§MQ-2 Redis 生产驱动发送侧守界（同一纯函数，双驱动不漂移）', () => {
  it('超界定向帧：不调用线路 publish（帧不挨 ioredis）、published 不虚记、errors 记 1', () => {
    const { a, pubA, deliver, dispose } = makeRedisPair();
    expect(() => a.publish(ids(MAX_VIEWERS_PER_FRAME + 1))).not.toThrow();
    expect(pubA.published).toHaveLength(0); // 对齐 ADR-0132"ioredis 从未被调用"
    expect(a.stats().published).toBe(0);
    expect(a.stats().errors).toBeGreaterThanOrEqual(1);
    expect(deliver(0)).toBe(false); // 没帧可投
    dispose();
  });

  it('恰好 MAX 合法帧：真上线路、被 parse 认、投递给另一进程 applied 满额（零回归）', () => {
    const { a, pubA, seenB, deliver, dispose } = makeRedisPair();
    const atLimit = ids(MAX_VIEWERS_PER_FRAME);
    a.publish(atLimit);
    expect(pubA.published).toHaveLength(1);
    expect(pubA.published[0]![0]).toBe(DISCOVER_INVALIDATE_CHANNEL);
    expect(parseInvalidationFrame(pubA.published[0]![1])?.viewerIds).toEqual(atLimit);
    expect(deliver(0)).toBe(true);
    expect(seenB).toEqual([[atLimit, false]]);
    expect(a.stats().errors).toBe(0);
    dispose();
  });

  it('单个 id 超长：Redis 驱动同样就地拒绝，不上线路（与内存驱动同口径）', () => {
    const { a, pubA, seenB, deliver, dispose } = makeRedisPair();
    a.publish(['ok', longId()]);
    expect(pubA.published).toHaveLength(0);
    expect(a.stats().published).toBe(0);
    expect(a.stats().errors).toBeGreaterThanOrEqual(1);
    expect(deliver(0)).toBe(false);
    expect(seenB).toEqual([]);
    dispose();
  });

  it('零回归：全局帧仍上线路、带 global 标志、投递给另一进程（不受定向守界误伤）', () => {
    const { a, pubA, seenB, deliver, dispose } = makeRedisPair();
    a.publish([], true);
    expect(pubA.published).toHaveLength(1);
    const wire = JSON.parse(pubA.published[0]![1]) as { viewerIds: string[]; global?: boolean };
    expect(wire.viewerIds).toEqual([]);
    expect(wire.global).toBe(true);
    expect(deliver(0)).toBe(true);
    expect(seenB).toEqual([[[], true]]);
    dispose();
  });

  it('线路 publish 失败仍是失败账（不抛、errors 增、published 不冒充成功）', async () => {
    const sub = fakeRedis();
    const bus = new RedisInvalidationBus(fakeRedis({ publishFail: true }), sub, { url: 'redis://fake' });
    expect(() => bus.publish(['u1'])).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(bus.stats().errors).toBeGreaterThanOrEqual(1);
    bus.dispose();
  });
});

/* ── 源码静态绑定门：把"发送侧守接收侧同一界"钉在声明上，而非只靠行为断言 ── */

const SRC = fileURLToPath(new URL('../src/server/domain/invalidation-bus.ts', import.meta.url));
const source = readFileSync(SRC, 'utf8');

/** 按花括号深度配平，抠出指定签名后的整段函数体（含嵌套 try/catch、箭头）。 */
function bodyFrom(src: string, anchor: string): string {
  const at = src.indexOf(anchor);
  if (at < 0) return '';
  const open = src.indexOf('{', at + anchor.length - 1);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

/** 抠出某类的 publish 方法体：从类起点后第一个 publish( 的签名 `{` 配平到闭合。 */
function publishBody(src: string, className: string): string {
  const cls = src.indexOf(`export class ${className}`);
  if (cls < 0) return '';
  return bodyFrom(src.slice(cls), 'publish(');
}

/** 去掉注释与字符串字面量，避免"注释里出现合法 token"式假绿（A11Y-2 教训）。 */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

describe('§MQ-2 源码声明绑定门（守界必须共用同一纯函数与同一常量）', () => {
  it('两个驱动 publish 都调用同一个出站守界函数（防只改一个驱动、防各写一份漂移）', () => {
    const mem = strip(publishBody(source, 'MemoryInvalidationBus'));
    const redis = strip(publishBody(source, 'RedisInvalidationBus'));
    expect(mem).not.toBe('');
    expect(redis).not.toBe('');
    const guardCall = /\bisValidOutboundFrame\s*\(/;
    expect(guardCall.test(mem)).toBe(true);
    expect(guardCall.test(redis)).toBe(true);
  });

  it('出站守界是纯函数：绑定两条常量护栏、有拒绝出口、自身不碰账本', () => {
    const guard = strip(bodyFrom(source, 'function isValidOutboundFrame'));
    expect(guard).not.toBe('');
    expect(guard).toMatch(/\bMAX_VIEWERS_PER_FRAME\b/);
    expect(guard).toMatch(/\bMAX_VIEWER_ID_LENGTH\b/);
    expect(guard).toMatch(/\breturn false\b/); // 明确有拒绝出口
    // 记账只属于 publish：纯函数不该碰 counters（账本诚实单一归口）。
    expect(guard).not.toMatch(/\bpublished\b/);
    expect(guard).not.toMatch(/\berrors\b/);
  });

  it('拒绝分支在 published 记账之前 return，且就地记 errors（账本诚实绑在声明上）', () => {
    for (const cls of ['MemoryInvalidationBus', 'RedisInvalidationBus']) {
      const body = strip(publishBody(source, cls));
      const guardAt = body.search(/\bisValidOutboundFrame\s*\(/);
      const publishedAt = body.search(/\bpublished\s*\+=?\s*1\b|\bpublished\+\+/);
      expect(guardAt).toBeGreaterThanOrEqual(0);
      expect(publishedAt).toBeGreaterThan(guardAt);
      const between = body.slice(guardAt, publishedAt);
      expect(/\breturn\b/.test(between)).toBe(true); // 守卫后必须就地 return
      expect(/\berrors\s*\+=?\s*1\b|\berrors\+\+/.test(between)).toBe(true); // 拒绝记一笔 error
    }
  });

  it('接收侧 parseInvalidationFrame 护栏一字未松（本片只加发送侧，不动接收侧契约）', () => {
    const parse = strip(bodyFrom(source, 'export function parseInvalidationFrame'));
    expect(parse).toMatch(/ids\.length\s*===\s*0\s*\|\|\s*ids\.length\s*>\s*MAX_VIEWERS_PER_FRAME/);
    expect(parse).toMatch(/id\.length\s*>\s*MAX_VIEWER_ID_LENGTH/);
  });
});
