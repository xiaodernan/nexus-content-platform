import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeadLetterEntry, JobEnvelope, JobHandlerContext } from '@/server/queue/jobQueue';
import { makeDeadLetter } from '@/server/queue/deadLetter';
import { dispatchJob } from '@/server/queue/worker';
import { JOB_HANDLERS } from '@/server/queue/handlers';

/**
 * §MQ v668 — 死信账本**收口**：闭环 ADR 0099 仍欠③。
 *
 * v667 让 transport 层 poison（body 解析失败）与重试耗尽进了 `onDeadLetter` sink，但另两类 poison
 * 仍只 console.error：worker 的未知 type、handler 的 schema 校验失败。于是部署方注入 sink 后拿到的
 * 账本视图是**不完整的**。v668 用一条可选的 `ctx.reportDeadLetter` 把这两处也汇入同一个 sink，
 * 且守住两条硬约束：① 不注入 sink（ctx undefined）时 v661 现场日志逐字保留、连记录都不构造；
 * ② ACK 语义一字未动（poison 返回不抛 ⇒ 驱动 XACK，不重试、不卡 PENDING）。
 *
 * 行为腿全部**纯内存**：`dispatchJob` 是从 start() 闭包里提出来的导出纯函数，直接喂真 handler，
 * 不连 Redis、不起 queue、不碰 globalThis。生产路径确实透传 ctx 由静态接线门钉住。
 */

const emit = vi.hoisted(() => vi.fn(async (_event: unknown) => 'created' as const));
vi.mock('@/server/domain/notifications', () => ({ emit }));

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const WORKER = 'apps/web/src/server/queue/worker.ts';
const HANDLERS = 'apps/web/src/server/queue/handlers.ts';
const MEM = 'apps/web/src/server/queue/memoryJobQueue.ts';
const REDIS = 'apps/web/src/server/queue/redisStreamJobQueue.ts';

const job = (type: string, payload: unknown, attempts = 1): JobEnvelope => ({
  id: 'j-1', type, payload, attempts, createdAt: 1_700_000_000_000,
});

function capture(): { ctx: JobHandlerContext; letters: DeadLetterEntry[] } {
  const letters: DeadLetterEntry[] = [];
  return { ctx: { reportDeadLetter: (e) => letters.push(e) }, letters };
}

const goodPayload = {
  recipientId: 'r', projectId: 'p', projectName: 'n', exportId: 'e', ok: true,
  counts: { design: 1, code: 2, assets: 3 }, missingAssets: 0, durationMs: 5, detail: 'd',
};

afterEach(() => vi.restoreAllMocks());

describe('dispatchJob — 两类新 poison 汇入 sink（纯内存行为腿）', () => {
  it('未知 type：报一条 poison 进 sink，reason 指明类型，且不抛（⇒ 驱动会 XACK）', async () => {
    const { ctx, letters } = capture();
    await expect(dispatchJob(job('mystery.event', { x: 1 }), ctx, {})).resolves.toBeUndefined();
    expect(letters).toHaveLength(1);
    expect(letters[0]!.kind).toBe('poison');
    expect(letters[0]!.type).toBe('mystery.event');
    expect(letters[0]!.reason).toContain('no registered handler');
    expect(letters[0]!.reason).toContain('mystery.event');
    expect(letters[0]!.attempts).toBe(1);
    expect(letters[0]!.bodyPreview).toContain('x');
  });

  it('handler schema 校验失败：真 buildComplete 报 poison 进 sink，emit 没被调，且不抛', async () => {
    emit.mockClear();
    const { ctx, letters } = capture();
    await expect(
      dispatchJob(job('build.complete', { exportId: 'only' }), ctx, JOB_HANDLERS),
    ).resolves.toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
    expect(letters).toHaveLength(1);
    expect(letters[0]!.kind).toBe('poison');
    expect(letters[0]!.type).toBe('build.complete');
    expect(letters[0]!.reason).toBe('schema validation failed');
    expect(letters[0]!.bodyPreview).toContain('only');
  });

  it('合法 payload：handler 正常完成，不进 sink，emit 被调', async () => {
    emit.mockClear();
    const { ctx, letters } = capture();
    const stats: import('@/server/queue/worker').JobWorkerStats = { running: false, driver: 'none', handlers: [], processed: {}, failed: 0, startedAt: null };
    await dispatchJob(job('build.complete', goodPayload), ctx, JOB_HANDLERS, stats);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(letters).toEqual([]);
    expect(stats.processed['build.complete']).toBe(1);
    expect(stats.failed).toBe(0);
  });

  it('handler 抛错：rethrow 给驱动重试，不误报成 poison（保住 v661 retry 语义）', async () => {
    const { ctx, letters } = capture();
    const stats: import('@/server/queue/worker').JobWorkerStats = { running: false, driver: 'none', handlers: [], processed: {}, failed: 0, startedAt: null };
    const flaky = { flaky: async () => { throw new Error('transient'); } };
    await expect(dispatchJob(job('flaky', {}), ctx, flaky, stats)).rejects.toThrow('transient');
    expect(letters).toEqual([]); // 只有终态才进账本，抛错仍是可恢复的
    expect(stats.failed).toBe(1);
    expect(stats.processed['flaky']).toBeUndefined();
  });
});

describe('默认行为逐字不变（不注入 sink）', () => {
  it('ctx undefined 时两类 poison 仍返回不抛，现场日志文案一字未改', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(dispatchJob(job('mystery.event', {}), undefined, {})).resolves.toBeUndefined();
    await expect(dispatchJob(job('build.complete', { exportId: 'only' }), undefined, JOB_HANDLERS)).resolves.toBeUndefined();
    const lines = err.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('no handler for job type') && l.includes('acking away'))).toBe(true);
    expect(lines.some((l) => l.includes('poison build.complete entry') && l.includes('did not match the contract'))).toBe(true);
  });

  it('构造门：两驱的 ctx 只在显式注入 onDeadLetter 时存在，缺省恒 undefined', () => {
    for (const path of [MEM, REDIS]) {
      const t = src(path);
      expect(t, `${path} 没有条件式构造 ctx`).toMatch(/this\.ctx = custom \? \{ reportDeadLetter: custom \} : undefined/);
      expect(t, `${path} 丢失了默认 sink 回退`).toMatch(/this\.sink = options\?\.onDeadLetter \?\? consoleDeadLetterSink/);
    }
  });
});

describe('静态接线门：生产路径确实把 ctx 透传下去', () => {
  it('start() 的回调把 ctx 交给 dispatchJob，dispatchJob 再透传给 handler', () => {
    const t = src(WORKER);
    expect(t, 'start() 没有改用 dispatchJob').toMatch(/\.start\(\(job, ctx\) => dispatchJob\(job, ctx, JOB_HANDLERS, s\.stats\)\)/);
    expect(t, 'dispatchJob 没有把 ctx 透传给 handler').toMatch(/await handler\(job, ctx\)/);
  });

  it('两驱调用 handler 时都传 this.ctx', () => {
    for (const path of [MEM, REDIS]) {
      expect(src(path), `${path} 调用 handler 没透传 ctx`).toMatch(/await handler\(job, this\.ctx\)/);
    }
  });

  it('三类 poison 判定点都汇入同一个 reportDeadLetter 通道', () => {
    const worker = src(WORKER);
    const handlers = src(HANDLERS);
    // ① worker 未知 type
    expect(worker).toMatch(/if \(!handler\) \{[\s\S]*?ctx\?\.reportDeadLetter\(makeDeadLetter\(\{[\s\S]*?kind: 'poison'/);
    // ② handler schema 失败
    expect(handlers).toMatch(/if \(!payload\) \{[\s\S]*?ctx\?\.reportDeadLetter\(makeDeadLetter\(\{[\s\S]*?kind: 'poison'/);
    // ③ transport 层 poison（v667 已有，这里确认它用的是同一个 sink，没有被 v668 接线改断）
    expect(src(REDIS)).toMatch(/this\.sink\(makeDeadLetter\(\{ kind: 'poison'/);
  });

  it('#3 收口后 startJobWorker 不再内联分派逻辑（防止两处漂移）', () => {
    const t = src(WORKER);
    expect(t).not.toMatch(/\.start\(async \(job: JobEnvelope\) => \{/);
    expect(t).toMatch(/export async function dispatchJob\(/);
  });
});

describe('makeDeadLetter 自定义 reason（v668 新增参数）', () => {
  it('传 reason 时优先于默认分流，其它字段与 v667 形状一致', () => {
    const e = makeDeadLetter({
      kind: 'poison', type: 't', attempts: 2, reason: 'schema validation failed', body: { a: 1 }, at: 42,
    });
    expect(e).toEqual({
      kind: 'poison', type: 't', attempts: 2, reason: 'schema validation failed',
      at: 42, bodyPreview: '{"a":1}',
    });
  });

  it('reason 与 err 同给时 reason 胜出（调用方显式语义优先于异常文本）', () => {
    expect(makeDeadLetter({ kind: 'exhausted', type: 't', attempts: 3, err: new Error('boom'), reason: 'custom' }).reason)
      .toBe('custom');
  });

  it('不传 reason 时默认分流不变（v667 的 11 门之外再钉一次防回退）', () => {
    expect(makeDeadLetter({ kind: 'poison', type: 't', attempts: 0 }).reason).toBe('unparseable job body');
    expect(makeDeadLetter({ kind: 'exhausted', type: 't', attempts: 3 }).reason).toBe('handler failed');
    expect(makeDeadLetter({ kind: 'exhausted', type: 't', attempts: 3, err: 'oops' }).reason).toBe('oops');
  });
});
