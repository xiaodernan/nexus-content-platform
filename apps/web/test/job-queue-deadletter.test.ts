import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryJobQueue } from '@/server/queue/memoryJobQueue';
import type { DeadLetterEntry } from '@/server/queue/jobQueue';

/**
 * §MQ v667 — 死信**运输层**门：两驱在作业进入终态时真的把记录交给 sink，且 Redis 的毒条目真的被 ACK。
 *
 * 纯函数形状由 dead-letter.test.ts 钉；这里钉"接线没断"：
 * - 行为腿用 MemoryJobQueue（无 Redis，低内存宿主可跑）：handler 一直抛到 maxAttempts，收集 onDeadLetter，
 *   断言恰好一条 exhausted、attempts/type/reason 正确；缺省 sink 时退回 console.error（默认行为不变）。
 * - 静态腿钉 RedisStreamJobQueue 那个**真 bug 的修复**：poison（toEnvelope 返回 null）在新读路径与
 *   XAUTOCLAIM 认领路径都经 handleEntry → 记 sink(kind:poison) **且 XACK**；旧实现 `if (job) process(...)`
 *   对 null 既不处理也不 ACK，条目永远卡 PENDING、被每轮 XAUTOCLAIM 反复认领。静态门逐字钉住这条，
 *   因为在无 Redis 宿主上跑不了真 consumer group。
 */

const REDIS_SRC = join(process.cwd(), 'apps/web/src/server/queue/redisStreamJobQueue.ts');
const src = () => readFileSync(REDIS_SRC, 'utf8').replace(/\r\n/g, '\n');

afterEach(() => vi.restoreAllMocks());

describe('MemoryJobQueue — 重试耗尽把记录交给 sink', () => {
  it('handler 一直抛到 maxAttempts：恰好一条 exhausted，attempts/type/reason 正确', async () => {
    const letters: DeadLetterEntry[] = [];
    const q = new MemoryJobQueue({
      maxAttempts: 3,
      onDeadLetter: (e) => letters.push(e),
    });
    await q.start(async () => {
      throw new Error('notifications insert failed');
    });
    await q.enqueue('build.complete', { exportId: 'e-42' });
    await vi.waitFor(() => expect(letters).toHaveLength(1));
    await q.stop();

    expect(letters).toHaveLength(1); // 不是每条失败都记，只在重试耗尽那一次记
    const entry = letters[0]!;
    expect(entry.kind).toBe('exhausted');
    expect(entry.type).toBe('build.complete');
    expect(entry.attempts).toBe(3);
    expect(entry.reason).toBe('notifications insert failed');
    expect(entry.bodyPreview).toContain('e-42');
    expect(entry.at).toBeGreaterThan(0);
  });

  it('成功完成的作业不进死信账本', async () => {
    const letters: DeadLetterEntry[] = [];
    const q = new MemoryJobQueue({ maxAttempts: 3, onDeadLetter: (e) => letters.push(e) });
    const seen: string[] = [];
    await q.start(async (job) => {
      seen.push(job.type);
    });
    await q.enqueue('build.complete', { ok: true });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    await q.stop();
    expect(letters).toEqual([]);
  });

  it('不设 sink 时退回 console.error（v661 默认行为不变）', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const q = new MemoryJobQueue({ maxAttempts: 2 });
    await q.start(async () => {
      throw new Error('boom');
    });
    await q.enqueue('build.complete', {});
    await vi.waitFor(() => expect(err).toHaveBeenCalled());
    await q.stop();
    expect(err.mock.calls.some((c) => String(c[0]).includes('DROPPED after 2 attempts'))).toBe(true);
  });
});

describe('RedisStreamJobQueue — poison 被 ACK 且记 sink（静态接线门，无 Redis 可跑）', () => {
  it('新读路径：每条 entry 都经 handleEntry（poison 也会被处理，不再 `if (job)` 跳过）', () => {
    const text = src();
    expect(text, '读循环还在用 `if (job) process(...)`，poison 会被跳过且永不 ACK').not.toMatch(/if \(job\) await this\.process/);
    expect(text, 'XREADGROUP 的 entries 没有统一 funnel').toMatch(/for \(const \[id, fields\] of entries\) await this\.handleEntry\(id, fields, handler\)/);
  });

  it('handleEntry：poison 分支先记 sink(kind:poison) 再 XACK（ADR 0066 承诺的 "logged and ACKed away"）', () => {
    const text = src();
    const branch = /if \(!job\) \{([\s\S]*?)\n {4}\}/.exec(text);
    expect(branch, 'handleEntry 没有 poison 分支').not.toBeNull();
    const body = branch![1]!;
    expect(body, 'poison 没记 sink').toMatch(/this\.sink\(makeDeadLetter\(\{ kind: 'poison'/);
    expect(body, 'poison 没被 XACK——会永远卡 PENDING 被反复认领').toMatch(/await this\.writer\.xack\(this\.streamKey, this\.group, id\)/);
    // 顺序：先记录再 ACK——即便 ACK 失败，记录也已经落地，不会既没记又没清。
    expect(body.indexOf('this.sink')).toBeLessThan(body.indexOf('xack'));
  });

  it('reclaim 返回 raw [id, fields]，不让 poison 在 XAUTOCLAIM 路径被 filter 成 null 而丢掉 id', () => {
    const text = src();
    expect(text).toMatch(/private async reclaim\(\): Promise<\[string, string\[\]\]\[\]>/);
    expect(text, 'reclaim 又把 null envelope 过滤掉了，poison 的 id 会丢失、无法 ACK').not.toMatch(/\.filter\(\(j\): j is JobEnvelope => j !== null\)/);
    expect(text, '认领的条目没走统一 funnel').toMatch(/for \(const \[id, fields\] of claimed\) await this\.handleEntry\(id, fields, handler\)/);
  });

  it('exhausted 终态走 sink（不再只 console.error），两驱同形状', () => {
    const text = src();
    expect(text).toMatch(/this\.sink\(makeDeadLetter\(\{ kind: 'exhausted'/);
    // 耗尽分支不该再有裸 DROPPED 日志作为唯一去向（默认 sink 里仍会记日志，那是允许的）。
    const process = /private async process\([\s\S]*?\n {2}\}/.exec(text);
    expect(process, 'process 方法找不到').not.toBeNull();
    expect(process![0], 'process 的耗尽分支仍在裸 console.error 而不经 sink').not.toMatch(/console\.error\(`\[job-queue\] DROPPED/);
  });

  it('两驱都从 options.onDeadLetter 取 sink，缺省退回 consoleDeadLetterSink', () => {
    const redis = src();
    const mem = readFileSync(join(process.cwd(), 'apps/web/src/server/queue/memoryJobQueue.ts'), 'utf8').replace(/\r\n/g, '\n');
    for (const [name, text] of [['redis', redis], ['memory', mem]] as const) {
      expect(text, `${name} 没接 onDeadLetter`).toMatch(/options\?\.onDeadLetter \?\? consoleDeadLetterSink/);
    }
  });
});
