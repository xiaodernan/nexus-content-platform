import { and, desc, eq, isNull } from 'drizzle-orm';
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
  return { id: row.id, projectName: owned?.name ?? null };
}

/** 收尾。result 与 error 互斥由调用方保证，这里只如实落库 */
export async function finishTask(
  id: string,
  outcome: { ok: boolean; result?: unknown; error?: string },
): Promise<{ status: 'succeeded' | 'failed'; updated: boolean }> {
  // 枚举里成功那一档叫 succeeded（0000 建库时定的），不是 completed
  const status = outcome.ok ? 'succeeded' : 'failed';
  const rows = await getDb()
    .update(agentTasks)
    .set({
      status,
      finishedAt: new Date(),
      result: outcome.ok ? ((outcome.result ?? null) as never) : null,
      error: outcome.ok ? null : (outcome.error ?? '执行失败，没有给出原因'),
    })
    .where(eq(agentTasks.id, id))
    .returning({ id: agentTasks.id });
  return { status, updated: rows.length > 0 };
}

function view(row: typeof agentTasks.$inferSelect & { projectName: string | null }): TaskView {
  const started = row.startedAt?.getTime() ?? null;
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
