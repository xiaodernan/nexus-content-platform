import { describe, expect, it } from 'vitest';
import { DemoJobStore } from '@/server/ai/mock-jobs';

/**
 * DEMO MODE 内存作业队列（`server/ai/mock-jobs.ts`）的第一份单测。
 *
 * 这一格要钉的是 §162 那句最容易被弄错的话：**取消被受理 ≠ 作业已经停了**。
 * 代码里的位置很明确——`cancel()` 遇到排队中的作业当场落成 `cancelled`，
 * 遇到已经领走的**只立标志**（`cancelRequested`），真正的落账交给 worker 的检查点。
 * 一旦哪天有人把"立标志"改成"直接改状态"，界面上就会出现一句假话：
 * "作业已停止"，而 worker 还在跑、还可能交回结果。
 *
 * 为什么能直接测 `DemoJobStore`（而不是走 `enqueueDemoJob`）：
 * 那个入口会**启动 worker 循环**（带 1.2~1.8s 的两段等待），测起来又慢又不确定；
 * 而队列的语义（入队/领取/取消/计数/清理）全在这个 class 里，与 worker 无关。
 * 直接 `new DemoJobStore()` 就是"不启动 worker 的那条路"——**不碰定时器、不碰真库**。
 */

describe('DemoJobStore · 入队与领取', () => {
  it('入队 → 状态 queued，带一条"已进入 DEMO 队列"的活动', async () => {
    const store = new DemoJobStore();
    const job = await store.enqueue({ requestId: 'req-1' });
    expect(job.status).toBe('queued');
    expect(job.backend).toBe('demo-memory');
    expect(job.startedAt).toBeNull();
    expect(job.finishedAt).toBeNull();
    expect(job.cancelRequested).toBe(false);
    expect(job.activities[0]!.summary).toContain('已进入 DEMO 队列');
  });

  it('领取 → 状态 running 且 startedAt 落时间', async () => {
    const store = new DemoJobStore();
    await store.enqueue({ requestId: 'req-1' });
    const claimed = await store.claim();
    expect(claimed?.status).toBe('running');
    expect(claimed?.startedAt).not.toBeNull();
  });

  it('队列空 → claim 返回 null', async () => {
    const store = new DemoJobStore();
    expect(await store.claim()).toBeNull();
  });

  it('counts 只数 queued 与 running（完成的与取消的不算在里面）', async () => {
    const store = new DemoJobStore();
    await store.enqueue({ requestId: 'a' });
    await store.enqueue({ requestId: 'b' });
    expect(await store.counts()).toEqual([2, 0]);
    await store.claim();
    expect(await store.counts()).toEqual([1, 1]);
  });
});

describe('DemoJobStore · 取消（受理 ≠ 停止）', () => {
  it('排队中取消 → 当场落成 cancelled，并说清"还没被 worker 领走"', async () => {
    const store = new DemoJobStore();
    const job = await store.enqueue({ requestId: 'req-1' });
    const cancelled = await store.cancel(job.id);
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.cancelRequested).toBe(true);
    expect(cancelled?.finishedAt).not.toBeNull();
    expect(cancelled?.activities.at(-1)!.summary).toContain('还没被 worker 领走');
  });

  it('已经领走（running）取消 → **只立标志**，状态仍是 running', async () => {
    const store = new DemoJobStore();
    const job = await store.enqueue({ requestId: 'req-1' });
    await store.claim();
    const cancelled = await store.cancel(job.id);
    // 这一条是"受理 ≠ 停止"那句话在代码里的位置：状态没有被改
    expect(cancelled?.status).toBe('running');
    expect(cancelled?.cancelRequested).toBe(true);
    expect(cancelled?.finishedAt).toBeNull();
  });

  it('立了标志的作业，worker 的检查点能读到（isCancelRequested 为真）', async () => {
    const store = new DemoJobStore();
    const job = await store.enqueue({ requestId: 'req-1' });
    await store.claim();
    expect(await store.isCancelRequested(job.id)).toBe(false);
    await store.cancel(job.id);
    expect(await store.isCancelRequested(job.id)).toBe(true);
  });

  it('已取消的作业不会被 worker 再领走（claim 只认 queued）', async () => {
    const store = new DemoJobStore();
    const job = await store.enqueue({ requestId: 'req-1' });
    await store.cancel(job.id);
    expect(await store.claim()).toBeNull();
  });

  it('查不到的作业 → cancel 返回 null（内存队列重启即失，如实说）', async () => {
    const store = new DemoJobStore();
    expect(await store.cancel('demo_job_根本没有')).toBeNull();
  });

  it('终态（completed）再取消 → 原样交回，不改状态', async () => {
    const store = new DemoJobStore();
    const job = await store.enqueue({ requestId: 'req-1' });
    await store.claim();
    job.status = 'completed';
    job.finishedAt = new Date().toISOString();
    await store.save(job);
    const after = await store.cancel(job.id);
    expect(after?.status).toBe('completed');
    expect(after?.cancelRequested).toBe(false);
  });
});

describe('DemoJobStore · 内存上限的清理', () => {
  it('超过上限时先清已结束的（还在排队/在跑的留着）', async () => {
    const store = new DemoJobStore();
    // 上限是 50：造 51 个已完成的，再造 1 个排队的 → 清理后总数仍是 51，
    // 但被清掉的是**已结束**的那些（还在排队的不该被清）
    for (let i = 0; i < 51; i += 1) {
      const job = await store.enqueue({ requestId: `done-${i}` });
      job.status = 'completed';
      job.finishedAt = new Date(2020, 0, 1, 0, 0, i).toISOString();
      await store.save(job);
    }
    const live = await store.enqueue({ requestId: 'live' });
    const got = await store.get(live.id);
    expect(got, '排队的那个不该被清掉').not.toBeNull();
    expect(got?.status).toBe('queued');
  });
});
