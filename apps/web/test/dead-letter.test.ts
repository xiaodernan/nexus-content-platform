import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEAD_LETTER_PREVIEW_LIMIT,
  bodyPreview,
  consoleDeadLetterSink,
  errorReason,
  makeDeadLetter,
} from '@/server/queue/deadLetter';

/**
 * §MQ v667 — 终态作业（重试耗尽 / 毒条目）的**记录形状**门。
 *
 * ADR 0066 把这条 lane 明确定成 "dead-letter by log, because this platform has no dead-letter store yet"，
 * 而旧实现真的只 `console.error` 一行：进程重启 / 日志轮转后，"哪几个 advisory side-effect 没做成"
 * 永久消失、无人可查。v667 把它升级成可观察的 `DeadLetterEntry`，经 `onDeadLetter` sink 交给部署方
 * （可落库、可发监控、可只是日志）——**默认行为不变**（不设 sink 仍只记日志，advisory lane 不擅自多存状态）。
 *
 * 这一片钉纯函数：摘要定长 + 隐私截断、reason 提取、两种终态形状、时间可注入、永不抛。纯内存、
 * 不连 Redis、不改源码，低内存共享宿主跑得动。运输层（两驱真的调 sink、poison 真的被 ACK）由
 * job-queue-deadletter.test.ts 钉。
 */

const FIXED_AT = 1_700_000_000_000;

afterEach(() => vi.restoreAllMocks());

describe('bodyPreview — 定长、折叠、隐私截断、永不抛', () => {
  it('对象 body 走 JSON 摘要，不保留整段 payload', () => {
    const p = bodyPreview({ title: 'hello', link: 'https://example.com' });
    expect(p).toContain('hello');
    expect(p).toContain('example.com');
  });

  it('超过上限就截断并带省略号（定长上界，不让用户数据复制进账本）', () => {
    const long = 'x'.repeat(DEAD_LETTER_PREVIEW_LIMIT + 50);
    const p = bodyPreview(long);
    expect(p.endsWith('…')).toBe(true);
    expect(p.length).toBe(DEAD_LETTER_PREVIEW_LIMIT + 1); // 内容截到上限 + 一个省略号
  });

  it('折叠换行与控制空白，一条摘要不撑成多行', () => {
    expect(bodyPreview('a\nb\t\nc')).toBe('a b c');
  });

  it('null / undefined / 循环引用都不抛', () => {
    expect(() => bodyPreview(null)).not.toThrow();
    expect(() => bodyPreview(undefined)).not.toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => bodyPreview(cyclic)).not.toThrow();
    expect(bodyPreview(null)).toBe('');
    expect(bodyPreview(undefined)).toBe('');
  });

  it('字符串原样保留（毒条目的 body 可能本来就是坏 JSON 串）', () => {
    expect(bodyPreview('{bad json')).toBe('{bad json');
  });
});

describe('errorReason / makeDeadLetter — 稳定形状', () => {
  it('Error 取 message，不把堆栈塞进账本行', () => {
    expect(errorReason(new Error('db is down'))).toBe('db is down');
  });

  it('非 Error 的抛出值也能收成字符串', () => {
    expect(errorReason('plain string')).toBe('plain string');
    expect(errorReason(42)).toBe('42');
  });

  it('exhausted：attempts / reason / bodyPreview / at 齐全，时间可注入', () => {
    const entry = makeDeadLetter({
      kind: 'exhausted',
      type: 'build.complete',
      attempts: 5,
      err: new Error('notifications insert failed'),
      body: { exportId: 'e-1' },
      at: FIXED_AT,
    });
    expect(entry).toEqual({
      kind: 'exhausted',
      type: 'build.complete',
      attempts: 5,
      reason: 'notifications insert failed',
      at: FIXED_AT,
      bodyPreview: '{"exportId":"e-1"}',
    });
  });

  it('poison：无 error 时给稳定默认 reason，body 原样摘要', () => {
    const entry = makeDeadLetter({ kind: 'poison', type: 'build.complete', attempts: 0, body: '{oops', at: FIXED_AT });
    expect(entry.kind).toBe('poison');
    expect(entry.reason).toBe('unparseable job body');
    expect(entry.bodyPreview).toBe('{oops');
    expect(entry.attempts).toBe(0);
  });

  it('缺省 at 用当前时间（落在调用前后之间）', () => {
    const before = Date.now();
    const entry = makeDeadLetter({ kind: 'exhausted', type: 't', attempts: 3 });
    const after = Date.now();
    expect(entry.at).toBeGreaterThanOrEqual(before);
    expect(entry.at).toBeLessThanOrEqual(after);
  });
});

describe('consoleDeadLetterSink — 默认行为仍是「只记日志」，且不泄漏 body', () => {
  it('poison 与 exhausted 各记一行，含 kind / type / reason', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDeadLetterSink(makeDeadLetter({ kind: 'poison', type: 'mystery', attempts: 0, body: 'x', at: FIXED_AT }));
    consoleDeadLetterSink(makeDeadLetter({ kind: 'exhausted', type: 'build.complete', attempts: 5, err: new Error('boom'), at: FIXED_AT }));
    expect(err).toHaveBeenCalledTimes(2);
    expect(err.mock.calls[0]![0]).toContain('POISON');
    expect(err.mock.calls[0]![0]).toContain('mystery');
    expect(err.mock.calls[1]![0]).toContain('DROPPED after 5 attempts');
    expect(err.mock.calls[1]![0]).toContain('boom');
  });
});
