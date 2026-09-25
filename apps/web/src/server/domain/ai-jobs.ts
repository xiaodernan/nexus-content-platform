import { eq } from 'drizzle-orm';
import type { AgentActivity, AiError, AiJobBackend, AiJobStatusResponse, AiJobStatusValue, AiRequest, RealtimeEvent } from '@nexus/schemas';
import { fetchAiJobStatus, submitAiJob } from '../ai/client';
import { channels, getRealtimeBus } from '../realtime/bus';
import { attachJob, bumpActivityCursor, finishTask, startTask, taskByJobId, type TaskCapability } from './agent-tasks';
import { emit } from './notifications';
import { getDb } from '../db/client';
import { agentTasks } from '../db/schema';

/**
 * §162 的 web 侧消费者：ai-service 早就有真队列（`POST /v1/ai/jobs` 入队、asyncio worker 执行、
 * `GET /v1/ai/jobs/<id>` 读状态），但 web 从来没有提交到它、也没有读过它——
 * 于是"作业会自己结束"这件事在 web 这一侧不存在，§164 点名的 Build complete /
 * Agent task complete 两类通知也就一直没有真事件可发。
 *
 * 这一片补的就是那条回路，并守住四条：
 * - **状态的真值在 ai-service，web 只是镜像**。每次查询都去问一次，不看缓存、不看界面上说过什么。
 *   web 落的是"我观察到的终态"，不是"我认为它该结束了"。
 * - **终态只落一次行，通知只发一条**。任务行只在非终态时被写，通知有 `generation:<taskId>` 的
 *   幂等 dedupe 兜着——两个标签页同时轮询也不会写出两件事。
 * - **进度不许编**。worker 从不设 `progress`（单次 LLM 调用没有可观测的中间态），
 *   所以这里透传的是 `null`，而不是替它填一个 0.5；能给的真实信号只有活动列表。
 * - **作业查不到时不许让任务停在 running**。内存后端重启即失，那个作业号就指向一个不存在的东西；
 *   这种情况把行落成 failed 并写明"查不到"，比一条永远转圈的"正在生成"诚实。
 */

export type JobSubmitResult =
  | {
      ok: true;
      jobId: string;
      taskId: string;
      requestId: string;
      status: AiJobStatusValue;
      backend: AiJobBackend;
      capacity: number;
      /** 后端带来的限制（memory = 只有那一个进程看得到），那句话来自 ai-service，不改写 */
      note: string;
    }
  | { ok: false; status: number | null; error: AiError };

/** 提交一次异步作业：先落任务行，再入队；入队没成功就把那行立刻结掉，不停在 running */
export async function submitJob(input: {
  wire: AiRequest;
  projectId: string;
  createdById: string;
  agentKey: string;
  capability: TaskCapability;
}): Promise<JobSubmitResult> {
  const started = await startTask({
    projectId: input.projectId,
    agentKey: input.agentKey,
    createdById: input.createdById,
    capability: input.capability,
    // 账本记的是摘要不是整份文档——§68 那条纪律对账本同样成立
    input: { prompt: input.wire.prompt.slice(0, 500), modelClass: input.wire.modelClass, variants: input.wire.variants, async: true },
  });
  const submitted = await submitAiJob(input.wire);
  if (!submitted.ok) {
    await finishTask(started.id, { ok: false, error: submitted.error.message });
    return { ok: false, status: submitted.status, error: submitted.error };
  }
  const attached = await attachJob(started.id, submitted.accepted.jobId);
  if (!attached) {
    // 理论上到不了这里（jobId 是 ai-service 刚生成的）。真的到了——比如同一 jobId 已被别行认领——
    // 宁可结掉这行也不留一条查不回来的 running
    const message = '作业号没能写进任务行，这次提交没有被账本认领';
    await finishTask(started.id, { ok: false, error: message });
    return { ok: false, status: null, error: { code: 'internal', message, retryable: true } };
  }
  return { ...submitted.accepted, taskId: started.id, ok: true };
}

export interface JobObservation {
  jobId: string;
  taskId: string;
  projectId: string | null;
  /** ai-service 报的状态，原样透传（问不到就是 null，不拿账本里的旧状态冒充"现在的"） */
  jobStatus: AiJobStatusValue | null;
  backend: AiJobBackend | null;
  /** 只有真知道才给；今天这条队列永远给 null */
  progress: number | null;
  activities: AgentActivity[];
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** 这行任务在 web 账本里的状态（终态由本轮观察写入） */
  taskStatus: string;
  /** 终态那句话：成功是"几处补丁 · 几份方案"，失败是原因 */
  outcome: string | null;
  /** 这一轮观察有什么要说清楚的：查不到、问不到、后端是内存 —— 不藏在状态码里 */
  notes: string[];
}

/** 只说真有的东西：一个补丁都没落地时不写"生成顺利"（与 /api/ai/run 同一口径） */
function summaryOf(response: AiJobStatusResponse['result'] | undefined): string | null {
  const patches = Array.isArray(response?.patches) ? response.patches.length : 0;
  const plans = Array.isArray(response?.plans) ? response.plans.length : 0;
  if (!patches && !plans) return null;
  return `${patches} 处补丁 · ${plans} 份方案`;
}

/**
 * 活动 → 实时事件。`agent.step` 的 status 枚举里没有 `info` 那一档，
 * 所以 info 走 `agent.activity`（装的就是整条活动原样）而不是硬塞成一个 step——
 * 把"只是交代一句"伪装成"某一步的状态变化"，界面上就会多出一条并不存在的过程。
 */
function stepEvent(projectId: string, taskId: string, index: number, activity: AgentActivity): RealtimeEvent | null {
  const base = { projectId, taskId } as const;
  const status = activity.status;
  if (status === 'started' || status === 'running' || status === 'completed' || status === 'failed') {
    return { type: 'agent.step', ...base, stepId: `${index}:${activity.stage}`, status, summary: activity.summary };
  }
  if (status === 'info') return { type: 'agent.activity', ...base, activity };
  return null;
}

/** 作业的终态 → 任务行 + 一条 generation 通知。`completed` 不等于"这次生成做成了什么" */
async function settle(
  task: typeof agentTasks.$inferSelect,
  projectName: string | null,
  status: AiJobStatusResponse,
): Promise<void> {
  if (task.status === 'succeeded' || task.status === 'failed') return;
  const softError = status.status === 'completed' ? (status.result?.error ?? null) : null;
  const ok = status.status === 'completed' && !softError;
  const reason = status.error?.message ?? (softError ? `${softError.code}：${softError.message}` : '作业失败，没有给出原因');
  const detail = ok ? summaryOf(status.result) : reason;

  await finishTask(task.id, ok ? { ok: true, result: { detail } } : { ok: false, error: reason });
  if (!task.createdById || !task.projectId) return;
  await emit({
    kind: 'generation',
    recipientId: task.createdById,
    projectId: task.projectId,
    projectName: projectName ?? '未命名项目',
    taskId: task.id,
    agentKey: task.agentKey,
    capability: task.capability ?? 'unavailable',
    ok,
    durationMs: task.startedAt ? Math.max(0, Date.now() - task.startedAt.getTime()) : 0,
    detail,
  });
}

/**
 * 问一次作业，并把观察到的东西落进账本。
 *
 * `actorId` 是归属判定：任务行按 `created_by` 认人，别人的作业号在这里查不到（返回 null）。
 * 不说"存在但不给你看"——作业状态里带着提示词摘要与 provider 返回的补丁。
 */
export async function observeJob(jobId: string, actorId: string): Promise<JobObservation | null> {
  const found = await taskByJobId(jobId, actorId);
  if (!found) return null;
  const { task, projectName } = found;
  const notes: string[] = [];
  const fetched = await fetchAiJobStatus(jobId);
  const status: AiJobStatusResponse | null = fetched.ok ? fetched.status : null;

  if (!fetched.ok) {
    const error = fetched.error;
    if (fetched.status === 404) {
      const reason = `作业在 ai-service 那一侧查不到了（${error.message}）`;
      // 已经是终态的行不再改：一次查不到不该把"成功"倒回去改成失败
      if (task.status !== 'succeeded' && task.status !== 'failed') {
        await finishTask(task.id, { ok: false, error: reason });
      }
      notes.push(reason);
    } else {
      notes.push(`这次没能问到作业状态：${error.message}`);
    }
  }

  if (status) {
    if (status.backend === 'memory') notes.push('这个作业存在 ai-service 进程的内存里：重启即失，也只有那一个进程看得到');
    if (status.progress === null) notes.push('这条队列没有真进度来源：进度只在真的知道时给，所以一直是空的');

    const unseen = status.activities.slice(task.activityCursor);
    if (unseen.length && task.projectId) {
      // 先占游标再推事件：两个标签页同时轮询时只有一个 CAS 得中，另一个不会重复推
      const claimed = await bumpActivityCursor(task.id, task.activityCursor, status.activities.length);
      if (claimed) {
        for (const [offset, activity] of unseen.entries()) {
          const event = stepEvent(task.projectId, task.id, task.activityCursor + offset, activity);
          if (event) getRealtimeBus().publish(channels.project(task.projectId), event);
        }
      }
    }
    if (status.status === 'completed' || status.status === 'failed') await settle(task, projectName, status);
  }

  const [fresh] = await getDb()
    .select({ status: agentTasks.status, error: agentTasks.error, result: agentTasks.result })
    .from(agentTasks)
    .where(eq(agentTasks.id, task.id))
    .limit(1);
  const detail = fresh?.result && typeof fresh.result === 'object' && 'detail' in fresh.result ? fresh.result.detail : null;
  return {
    jobId,
    taskId: task.id,
    projectId: task.projectId,
    jobStatus: status?.status ?? null,
    backend: status?.backend ?? null,
    progress: status?.progress ?? null,
    activities: status?.activities ?? [],
    queuedAt: status?.queuedAt ?? null,
    startedAt: status?.startedAt ?? null,
    finishedAt: status?.finishedAt ?? null,
    taskStatus: fresh?.status ?? task.status,
    outcome: fresh?.status === 'failed' ? (fresh?.error ?? null) : typeof detail === 'string' ? detail : null,
    notes,
  };
}
