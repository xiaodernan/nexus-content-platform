import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RealtimeEvent } from '@nexus/schemas';
import { channels, getRealtimeBus } from '../realtime/bus';
import { getDb } from '../db/client';
import { agentTasks, projects } from '../db/schema';

/**
 * §112 / §113 的落脚点：`agent_tasks` 这张表从 0000 建库起就有结构（plan / input / result /
 * error / requiresApproval / attempt / 三个时间戳），但**全库没有一处写它**——
 * 所以 §164 原文点名的"Agent task complete"一直没有真事件可发（写在收件箱的"没有来源"清单里）。
 *
 * 这一片补的就是那个写入方：一次 AI 请求 = 一行任务，跑完就落到 completed / failed。
 * 三条纪律：
 * - **不造第二份真值**。任务行只是"发生过这么一件事"的账，改设计仍然只走 Command 那一条路（§150），
 *   这张表不参与工作区状态。
 * - **capability 如实记**。走真 provider 记 `real`，走 DEMO Mock 记 `demo`（§160）——
 *   两者混成一谈，事后看任务列表就分不清"这条结果是模型给的还是模板给的"。
 * - **失败也要落行**。请求炸掉时留一条 failed + error，而不是什么都没有：
 *   "我点了执行但什么都没发生"与"执行失败了，原因是 X"是两件完全不同的事。
 */

export type TaskCapability = 'real' | 'demo' | 'unavailable';

export interface StartTaskInput {
  projectId: string | null;
  agentKey: string;
  createdById: string;
  capability: TaskCapability;
  conversationId?: string | null;
  /** 这次请求的输入摘要（不是整份文档，§68 那条纪律同样适用于账本） */
  input: unknown;
}

export interface TaskView {
  id: string;
  projectId: string | null;
  projectName: string | null;
  agentKey: string;
  status: string;
  capability: TaskCapability | null;
  attempt: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  /** 跑完用了多久；没跑完是 null，不拿"到现在为止"冒充时长 */
  durationMs: number | null;
}

export async function startTask(input: StartTaskInput): Promise<{ id: string; projectName: string | null }> {
  const db = getDb();
  // 项目名顺手取一次：通知标题要用它，而"《prj_9f3c…》生成完成"这种标题没人读得懂
  const [owned] = input.projectId
    ? await db
        .select({ name: projects.name })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), isNull(projects.deletedAt)))
        .limit(1)
    : [];
  const [row] = await db
    .insert(agentTasks)
    .values({
      projectId: input.projectId,
      agentKey: input.agentKey,
      status: 'running',
      capability: input.capability,
      conversationId: input.conversationId ?? null,
      input: input.input as never,
      createdById: input.createdById,
      startedAt: new Date(),
    })
    .returning({ id: agentTasks.id });
  if (!row) throw new Error('写入任务行没有返回 id');
  // §163：任务真的开始了才推一条 progress=0。这是**真实的**起点，不是编出来的刻度——
  // 一次同步请求只有"开始"和"结束"两个真信号，中间没有可观测的分段，
  // 所以不编 0.2 / 0.5 / 0.9 那种假进度（ai-service 那条"没有真进度来源时 progress 恒为 null"是同一口径）。
  publishGenerationProgress(input.projectId, row.id, 0, '已提交');
  return { id: row.id, projectName: owned?.name ?? null };
}

/**
 * §163：只推项目频道。没有项目的任务（projectId 为 null）没有频道可发，就不发。
 * 顺带说明为什么这里不需要另查一次项目：收尾语句的 `returning` 直接把 project_id 带回来了。
 */
function publishGenerationProgress(projectId: string | null, taskId: string, progress: number, message: string): void {
  if (!projectId) return;
  const event: RealtimeEvent = {
    type: 'generation.progress',
    projectId,
    taskId,
    kind: 'agent',
    progress,
    message,
  };
  getRealtimeBus().publish(channels.project(projectId), event);
}

/** 收尾。result 与 error 互斥由调用方保证，这里只如实落库 */
export async function finishTask(
  id: string,
  outcome: { ok: boolean; result?: unknown; error?: string },
): Promise<{ status: 'succeeded' | 'failed'; updated: boolean }> {
  // 枚举里成功那一档叫 succeeded（0000 建库时定的），不是 completed
  const status = outcome.ok ? 'succeeded' : 'failed';
  const reason = outcome.error ?? '执行失败，没有给出原因';
  const rows = await getDb()
    .update(agentTasks)
    .set({
      status,
      finishedAt: new Date(),
      result: outcome.ok ? ((outcome.result ?? null) as never) : null,
      error: outcome.ok ? null : reason,
    })
    .where(eq(agentTasks.id, id))
    .returning({ id: agentTasks.id, projectId: agentTasks.projectId });
  const row = rows[0];
  if (row) {
    // 失败也推：任务页与 Studio 上的"正在生成"要能自己停下来，而不是永远转着
    publishGenerationProgress(row.projectId, id, 1, outcome.ok ? '完成' : `失败：${reason}`);
  }
  return { status, updated: rows.length > 0 };
}

/**
 * §162：把这行任务认领到 ai-service 的那个作业上。只在提交真的拿到 jobId 之后调用。
 * 已有 job 的行不再覆盖：一行任务对两个作业，轮询回来就说不清哪个状态算数。
 */
export async function attachJob(taskId: string, jobId: string): Promise<boolean> {
  const rows = await getDb()
    .update(agentTasks)
    .set({ providerJobId: jobId })
    .where(and(eq(agentTasks.id, taskId), isNull(agentTasks.providerJobId)))
    .returning({ id: agentTasks.id });
  return rows.length > 0;
}

/** 任务 + 项目名 + 游标。`actorId` 是归属判定：别人的作业查不到，连状态都不给 */
export interface JobTaskRow {
  task: typeof agentTasks.$inferSelect;
  projectName: string | null;
}

export async function taskByJobId(jobId: string, actorId: string): Promise<JobTaskRow | null> {
  const [row] = await getDb()
    .select({ task: agentTasks, projectName: projects.name })
    .from(agentTasks)
    .leftJoin(projects, eq(projects.id, agentTasks.projectId))
    .where(and(eq(agentTasks.providerJobId, jobId), eq(agentTasks.createdById, actorId)))
    .limit(1);
  return row ? { task: row.task, projectName: row.projectName } : null;
}

/**
 * 推进"已经翻译成实时事件的活动条数"。带上 `from` 做比较并换回：两个标签页同时轮询
 * 同一个作业时，后写的那次不会把游标倒回去，也不会让另一路觉得自己推过了。
 */
export async function bumpActivityCursor(taskId: string, from: number, to: number): Promise<boolean> {
  if (to <= from) return false;
  const rows = await getDb()
    .update(agentTasks)
    .set({ activityCursor: to })
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.activityCursor, from)))
    .returning({ id: agentTasks.id });
  return rows.length > 0;
}

function view(row: typeof agentTasks.$inferSelect & { projectName: string | null }): TaskView {  const started = row.startedAt?.getTime() ?? null;
  const finished = row.finishedAt?.getTime() ?? null;
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    agentKey: row.agentKey,
    status: row.status,
    capability: row.capability ?? null,
    attempt: row.attempt,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    durationMs: started !== null && finished !== null ? Math.max(0, finished - started) : null,
  };
}

/**
 * 一个项目的任务列表。按归属判定：项目不属于这个人就当没有（连任务数都不给）——
 * 任务行里带着 prompt 摘要与 provider 返回的补丁，那是别人的工作区内容。
 */
export async function listProjectTasks(
  projectId: string,
  actorId: string,
  limit = 50,
): Promise<{ tasks: TaskView[]; projectName: string } | null> {
  const db = getDb();
  const [owned] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, actorId), isNull(projects.deletedAt)))
    .limit(1);
  if (!owned) return null;
  const take = Math.min(Math.max(Math.trunc(limit) || 1, 1), 200);
  const rows = await db
    .select({ task: agentTasks, projectName: projects.name })
    .from(agentTasks)
    .innerJoin(projects, eq(projects.id, agentTasks.projectId))
    .where(eq(agentTasks.projectId, projectId))
    .orderBy(desc(agentTasks.createdAt))
    .limit(take);
  return { projectName: owned.name, tasks: rows.map((r) => view({ ...r.task, projectName: r.projectName })) };
}

export async function getTask(id: string): Promise<TaskView | null> {
  const [row] = await getDb()
    .select({ task: agentTasks, projectName: projects.name })
    .from(agentTasks)
    .leftJoin(projects, eq(projects.id, agentTasks.projectId))
    .where(eq(agentTasks.id, id))
    .limit(1);
  if (!row) return null;
  return view({ ...row.task, projectName: row.projectName ?? null });
}
