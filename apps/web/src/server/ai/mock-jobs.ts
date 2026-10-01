/**
 * §162 DEMO MODE 异步作业队列：只在开发环境、未配真实 provider 时启用。
 * 模仿 ai-service 的 MemoryJobStore + Worker，跑在 web 进程内，不挂外部依赖。
 * 仅用于让"异步作业"复选框在 DEMO MODE 下可用，方便验证前端轮询与任务列表回显。
 * 生产环境必须配真实 provider，走 ai-service 那条路（MemoryJobStore/RedisJobStore）。
 */

import { randomUUID } from 'node:crypto';

export type DemoJobStatus = 'queued' | 'running' | 'completed' | 'failed';

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
}

function utcNow(): string {
  return new Date().toISOString();
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
      .filter((j) => j.status === 'completed' || j.status === 'failed')
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
    const payload = job.payload as Record<string, unknown>;
    const promptVal = payload.prompt;
    const prompt = typeof promptVal === 'string' ? promptVal : '';
    const _modelClassVal = payload.modelClass;
    const _modelClass = typeof _modelClassVal === 'string' ? _modelClassVal : 'balanced';
    const _variantsVal = payload.variants;
    const _variants = typeof _variantsVal === 'number' ? _variantsVal : 1;
    const context = payload.context as Record<string, unknown> | undefined;

    await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

    job.activities.push({
      stage: 'generate',
      status: 'running',
      summary: '正在生成设计补丁（DEMO 模板）',
      at: utcNow(),
    });
    await store.save(job);

    await new Promise((r) => setTimeout(r, 500 + Math.random() * 300));

    const patches: unknown[] = [];
    const selection = context?.selection as string[] | undefined;
    if (selection && selection.length > 0) {
      for (const nodeId of selection) {
        patches.push({
          op: 'update',
          target: { page: 'current', node: nodeId },
          set: {
            style: {
              fills: [{ kind: 'color', color: { r: 0.9, g: 0.3, b: 0.2, a: 1 } }],
            },
          },
        });
      }
    } else {
      patches.push({
        op: 'add',
        target: { page: 'current', parent: 'root', index: -1 },
        node: {
          type: 'text',
          name: 'AI 生成的文本',
          text: `基于「${prompt.slice(0, 30)}」生成的演示内容`,
          layout: { mode: 'none' },
          size: { width: 'hug', height: 'hug' },
          position: { x: 100, y: 100 },
          style: { fills: [], opacity: 1 },
          typography: { fontSize: 16 },
        },
      });
    }

    job.result = {
      patches,
      plans: [],
      explanation: `DEMO MODE：异步作业在 ${job.startedAt} 完成，生成了 ${patches.length} 处补丁（模板结果）`,
      capability: 'demo',
      agentKey: 'design',
    };
    job.status = 'completed';
    job.finishedAt = utcNow();
    job.activities.push({
      stage: 'queue',
      status: 'completed',
      summary: `作业结束：结果已可取（HTTP 200）`,
      at: utcNow(),
    });
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

export async function getDemoJobCounts(): Promise<[number, number]> {
  return store.counts();
}

export { DemoJobStore };