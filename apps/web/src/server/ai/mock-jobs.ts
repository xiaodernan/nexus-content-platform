/**
 * §162 DEMO MODE 异步作业队列：只在开发环境、未配真实 provider 时启用。
 * 模仿 ai-service 的 MemoryJobStore + Worker，跑在 web 进程内，不挂外部依赖。
 * 仅用于让"异步作业"复选框在 DEMO MODE 下可用，方便验证前端轮询与任务列表回显。
 * 生产环境必须配真实 provider，走 ai-service 那条路（MemoryJobStore/RedisJobStore）。
 *
 * §162 的取消也在这一份里落：取消是"受理 → 检查点 → 落账"的链条——
 * `cancel` 只立标志（或者在还没被领走时当场落账），worker 在检查点看见标志就把结果丢掉。
 * 标志立住不等于作业已经停了（受理 ≠ 停止）；真值在队列这一侧，界面的话都从这里读。
 */

import { randomUUID } from 'node:crypto';
import type { AiRequest } from '@nexus/schemas';
import type { DesignDocument } from '@nexus/design-model';
import { mockProvider } from './mock';

export type DemoJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface DemoJobActivity {
  stage: string;
  status: 'info' | 'running' | 'completed' | 'failed';
  summary: string;
  at: string;
}

export interface DemoJob {
  id: string;
  requestId: string;
  status: DemoJobStatus;
  backend: 'demo-memory';
  queuedAt: string;
  payload: unknown;
  activities: DemoJobActivity[];
  startedAt: string | null;
  finishedAt: string | null;
  progress: number | null;
  result: unknown;
  error: { code: string; message: string; retryable: boolean } | null;
  /** 取消标志：`cancel` 立住，worker 在检查点看见它就丢掉结果（受理 ≠ 停止） */
  cancelRequested: boolean;
}

/** 取消的四种现场各说各的：排队中被领走之前、领走但没开始、生成中途、结果已经算出来但按取消丢弃 */
const CANCEL_NOTE_QUEUED = '作业还没被 worker 领走，当场落成 cancelled';
const CANCEL_NOTE_NOT_STARTED = '取消在开始生成之前被 worker 看见：这一轮没有产生任何补丁';
const CANCEL_NOTE_MIDWAY = '取消在生成中途被 worker 看见：这一轮按取消丢弃，不交回';
const CANCEL_NOTE_DISCARDED = '取消在结果落地之前被 worker 看见：补丁已经算出来，但按取消丢弃，没有交回';

function utcNow(): string {
  return new Date().toISOString();
}

/** 就地落账（调用方决定要不要 `store.save`）：状态、标志、时间、活动一句话，四样一起改 */
function markCancelled(job: DemoJob, note: string): void {
  job.status = 'cancelled';
  job.cancelRequested = true;
  job.finishedAt = utcNow();
  job.activities.push({
    stage: 'queue',
    status: 'info',
    summary: note,
    at: utcNow(),
  });
}

class DemoJobStore {
  private jobs = new Map<string, DemoJob>();
  private pending: string[] = [];
  private mutex = Promise.resolve();
  private readonly maxJobs = 50;

  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    let release: () => void = () => { };
    const nextLock = new Promise<void>((resolve) => { release = resolve; });
    const currentLock = this.mutex;
    this.mutex = nextLock;
    await currentLock;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private purge(): void {
    if (this.jobs.size <= this.maxJobs) return;
    const finished = [...this.jobs.values()]
      .filter((j) => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled')
      .sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''));
    const toRemove = finished.slice(0, this.jobs.size - this.maxJobs);
    for (const job of toRemove) this.jobs.delete(job.id);
  }

  async enqueue(payload: unknown): Promise<DemoJob> {
    const reqId = payload && typeof payload === 'object' && 'requestId' in payload
      ? String((payload as Record<string, unknown>).requestId)
      : '';
    const job: DemoJob = {
      id: `demo_job_${randomUUID().slice(0, 16)}`,
      requestId: reqId ?? '',
      status: 'queued',
      backend: 'demo-memory',
      queuedAt: utcNow(),
      payload,
      activities: [
        {
          stage: 'queue',
          status: 'info',
          summary: '已进入 DEMO 队列，等待模拟 worker 领取',
          at: utcNow(),
        },
      ],
      startedAt: null,
      finishedAt: null,
      progress: null,
      result: null,
      error: null,
      cancelRequested: false,
    };
    await this.withLock(() => {
      this.jobs.set(job.id, job);
      this.pending.push(job.id);
      this.purge();
    });
    return job;
  }

  async claim(): Promise<DemoJob | null> {
    return this.withLock(() => {
      while (this.pending.length) {
        const id = this.pending.shift()!;
        const job = this.jobs.get(id);
        if (job && job.status === 'queued') {
          job.status = 'running';
          job.startedAt = utcNow();
          job.activities.push({
            stage: 'queue',
            status: 'running',
            summary: '模拟 worker 已领取，开始处理',
            at: utcNow(),
          });
          return job;
        }
      }
      return null;
    });
  }

  /**
   * §162 取消的队列侧入口。排队中的当场落账（worker 的 `claim` 只认 `queued`，
   * 状态改成 cancelled 之后它自然跳过）；已经领走的只立标志，落账交给 worker 的检查点——
   * 这就是"受理 ≠ 停止"那句话在代码里的位置。终态的原样交回，取消按钮本来就不该点到它们。
   */
  async cancel(jobId: string): Promise<DemoJob | null> {
    return this.withLock(() => {
      const job = this.jobs.get(jobId);
      if (!job) return null;
      if (job.status === 'queued') {
        markCancelled(job, CANCEL_NOTE_QUEUED);
        return job;
      }
      if (job.status === 'running') {
        job.cancelRequested = true;
        return job;
      }
      return job;
    });
  }

  async isCancelRequested(jobId: string): Promise<boolean> {
    return this.withLock(() => this.jobs.get(jobId)?.cancelRequested ?? false);
  }

  async save(job: DemoJob): Promise<void> {
    await this.withLock(() => {
      this.jobs.set(job.id, job);
    });
  }

  async get(jobId: string): Promise<DemoJob | null> {
    return this.withLock(() => this.jobs.get(jobId) ?? null);
  }

  async counts(): Promise<[number, number]> {
    return this.withLock(() => {
      let pending = 0;
      let running = 0;
      for (const job of this.jobs.values()) {
        if (job.status === 'queued') pending++;
        else if (job.status === 'running') running++;
      }
      return [pending, running];
    });
  }

  async close(): Promise<void> {
    // noop
  }
}

const store = new DemoJobStore();

let workerStarted = false;

async function runDemoJob(job: DemoJob): Promise<void> {
  try {
    // payload 是随 `submitJob` 进队列的那一份 wire（§68：`context.document` 是 web 进程
    // 自己塞进来的权威文档，不走网络）。DeterministicMockProvider 与同步那条路
    // （/api/ai/run）吃的是同一份报文、同一份文档——两条路的补丁因此长得一样。
    const request = job.payload as unknown as AiRequest;
    const context = request.context as { document?: DesignDocument } | undefined;
    const document = context?.document;

    // 检查点一：领到了，但取消先到——什么都没生成，直接落账
    if (await store.isCancelRequested(job.id)) {
      markCancelled(job, CANCEL_NOTE_NOT_STARTED);
      await store.save(job);
      return;
    }

    // 两段等待一共 2.2~3.4 秒：DEMO 作业不能在 Studio 第一次轮询（提交后 1.5 秒）之前
    // 就跑完——"完成得比取消还快"会让观察先把行落成 awaiting_approval，
    // 随后的取消只能吃一条 409（§162 的语义是受理在先，不是抢跑）
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 600));

    // 检查点二：生成开始之前再看一次
    if (await store.isCancelRequested(job.id)) {
      markCancelled(job, CANCEL_NOTE_MIDWAY);
      await store.save(job);
      return;
    }

    job.activities.push({
      stage: 'generate',
      status: 'running',
      summary: '正在生成设计补丁（DEMO 确定性规则）',
      at: utcNow(),
    });
    await store.save(job);

    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 600));

    const response = await mockProvider.run(request, { document });

    // 检查点三：补丁已经算出来了，但取消先到——按取消丢弃，不留一份没人要的结果
    if (await store.isCancelRequested(job.id)) {
      markCancelled(job, CANCEL_NOTE_DISCARDED);
      await store.save(job);
      return;
    }

    // 终态与 ai-service 同一口径（jobs.py worker）：provider 回了 error 就是 failed，
    // error 原样落进 job.error；只有真做成了才带 result
    if (response.error) {
      job.result = null;
      job.error = { code: response.error.code, message: response.error.message, retryable: response.error.retryable === true };
      job.status = 'failed';
      job.finishedAt = utcNow();
      job.activities.push({
        stage: 'queue',
        status: 'failed',
        summary: `作业失败：${response.error.code}：${response.error.message}`,
        at: utcNow(),
      });
    } else {
      job.result = response;
      job.error = null;
      job.status = 'completed';
      job.finishedAt = utcNow();
      job.activities.push({
        stage: 'queue',
        status: 'completed',
        summary: `作业结束：结果已可取（HTTP 200）`,
        at: utcNow(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    job.error = { code: 'internal', message: `模拟 worker 抛出异常：${message}`, retryable: true };
    job.status = 'failed';
    job.finishedAt = utcNow();
    job.activities.push({
      stage: 'queue',
      status: 'failed',
      summary: `作业失败：${message}`,
      at: utcNow(),
    });
  }
  await store.save(job);
}

async function workerLoop(): Promise<void> {
  while (true) {
    const job = await store.claim();
    if (!job) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    await runDemoJob(job);
  }
}

export function startDemoWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  workerLoop().catch((err) => {
    console.error('[demo-jobs] worker crashed', err);
  });
}

export async function enqueueDemoJob(payload: unknown): Promise<DemoJob> {
  startDemoWorker();
  return store.enqueue(payload);
}

export async function getDemoJob(jobId: string): Promise<DemoJob | null> {
  return store.get(jobId);
}

/** §162 取消的队列侧：排队中当场落账、运行中立标志；查不到返回 null（内存队列重启即失） */
export async function cancelDemoJob(jobId: string): Promise<DemoJob | null> {
  return store.cancel(jobId);
}

export async function getDemoJobCounts(): Promise<[number, number]> {
  return store.counts();
}

export { DemoJobStore };
