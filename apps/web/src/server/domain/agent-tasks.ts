import { and, desc, eq, isNull } from 'drizzle-orm';
import type { RealtimeEvent } from '@nexus/schemas';
import { channels, getRealtimeBus } from '../realtime/bus';
import { recordAudit } from './audit';
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
  /** §74：这一行是不是由审批门挂起来的（等待中的行没有 finishedAt，靠这个字段说清为什么） */
  requiresApproval: boolean;
  /** 批准时间与批准人；拒绝的那一次两样都是 null（列的语义是"谁批准了"） */
  approvedAt: string | null;
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

/**
 * §74：把一份含高危动作的结果挂起来。这条语句是全库**唯一**给
 * `requires_approval` 与状态 `awaiting_approval` 置值的写入方（这两列建库起就有，一直无人置真）。
 *
 * 不写 `finishedAt`：等待不是终态。写了它，任务列表会把"还等人决定"的一行算进"已跑完"的用时里，
 * 而 `durationMs` 会变成"从提交到没人管"的一个数——那不是任何人想看的时长。
 *
 * 条件里钉住"只有还在跑的任务能被挂起"：终态行如果被覆盖，账本上就多出一条
 * "先成功了、后又等审批"的回溯记录，而 `decideApproval` 会替它补上批准时间。
 */
export async function holdForApproval(taskId: string, record: unknown): Promise<boolean> {
  const rows = await getDb()
    .update(agentTasks)
    .set({ status: 'awaiting_approval', requiresApproval: true, result: record as never })
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.status, 'running')))
    .returning({ id: agentTasks.id });
  return rows.length > 0;
}

export type ApprovalDecision = 'approve' | 'reject';

export type ApprovalOutcome =
  /** 批准：`held` 是被挂起的那一份完整结果，调用方把它交回编辑区 */
  | { ok: true; decision: ApprovalDecision; status: 'succeeded' | 'cancelled'; held: unknown; approvals: unknown }
  /** 这条任务不在等待态（决定过了，或者本来就没挂起） */
  | { ok: false; code: 'not_pending'; message: string }
  /** 任务号是别人的，或者根本不存在：与 §162 一样，不区分两种情况以免枚举 */
  | { ok: false; code: 'not_found'; message: string };

/**
 * 任务号长得不像 uuid 时不去打库：Postgres 会为语法不合法的 uuid 抛错，
 * 那条错在界面上是一条 500，而它该有的答案是"没这条任务"。
 */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = '这条任务不存在，或者不属于你。';

/**
 * 人工裁决一次挂起的 AI 结果。三条不能省的判断：
 * - **归属先判**（`createdById`）：批准别人的结果等于替别人改工作区；
 * - **只认等待态**：条件写在 WHERE 里，决定过第二次拿不到行，也就不会把 `approvedAt` 刷成新的时间；
 * - **拒绝不写 `approved_by/approved_at`**：那两列记的是"谁批准了"，替一次拒绝填上它们
 *   就是往审计里塞一条反的。拒绝的决定记在 `result.decision` 里。
 *
 * §84 的审计两种结果都写：`allowed:false` 那一行就是"有人试过替别人批准"的现场证据。
 */
export async function decideApproval(
  taskId: string,
  actorId: string,
  decision: ApprovalDecision,
  ip?: string | null,
): Promise<ApprovalOutcome> {
  if (!UUID_LIKE.test(taskId)) return { ok: false, code: 'not_found', message: NOT_FOUND };
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentTasks)
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.createdById, actorId)))
    .limit(1);
  if (!row) {
    await recordAudit({
      actorId,
      action: 'ai.approval.decide',
      targetType: 'agent_task',
      targetId: taskId,
      allowed: false,
      detail: { reason: 'not-mine-or-missing', decision },
      ip: ip ?? null,
    });
    return { ok: false, code: 'not_found', message: NOT_FOUND };
  }
  if (row.status !== 'awaiting_approval' || !row.requiresApproval) {
    return {
      ok: false,
      code: 'not_pending',
      message: `这条任务现在是「${row.status}」，不在等审批——挂起的结果只有第一次决定算数。`,
    };
  }

  const result = (row.result ?? {}) as Record<string, unknown>;
  const decided = { ...result, decision: { by: actorId, at: new Date().toISOString(), decision } };
  const status = decision === 'approve' ? 'succeeded' : 'cancelled';
  const rows = await db
    .update(agentTasks)
    .set({
      status,
      finishedAt: new Date(),
      result: decided as never,
      // 批准才填那两列；拒绝留 null（见上）
      approvedBy: decision === 'approve' ? actorId : null,
      approvedAt: decision === 'approve' ? new Date() : null,
    })
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.status, 'awaiting_approval')))
    .returning({ id: agentTasks.id });
  if (rows.length === 0) {
    // 两个标签页同时点：后到的那一次读到的还是 awaiting，写的时候已经被前面那笔改掉了
    return { ok: false, code: 'not_pending', message: '这一条刚刚已经被决定过了，这次没有改动。' };
  }
  await recordAudit({
    actorId,
    action: 'ai.approval.decide',
    targetType: 'agent_task',
    targetId: taskId,
    allowed: true,
    detail: { decision, approvals: result.approvals ?? [], projectId: row.projectId },
    ip: ip ?? null,
  });
  return { ok: true, decision, status, held: decision === 'approve' ? (result.held ?? null) : null, approvals: result.approvals ?? [] };
}

function approvalShape(task: typeof agentTasks.$inferSelect) {
  const record = (task.result ?? {}) as { approvals?: unknown; heldOpCount?: unknown };
  return {
    taskId: task.id,
    projectId: task.projectId,
    agentKey: task.agentKey,
    status: task.status,
    requiresApproval: task.requiresApproval,
    approvals: record.approvals ?? [],
    heldOpCount: typeof record.heldOpCount === 'number' ? record.heldOpCount : null,
    capability: task.capability ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

/**
 * 一条任务的审批现场。**故意不返回被扣下的补丁**：
 * 读一读不需要决定，而 §74 要的是"决定之前那份东西进不了工作区"。
 * 归属同样按 `created_by` 判，别人的任务与不存在给同一个答案（null）。
 */
export type ApprovalTaskView = ReturnType<typeof approvalShape>;

/**
 * 这个项目里还等人裁决的任务，最新一条在前。
 * Studio 打开时要靠它把审批卡片找回来：卡片如果只存在 React 状态里，
 * 一次刷新就变成"库内一条永远等待、界面上什么都没有"的行——那正是 §162 里
 * "没人来问就一直停在在跑"的那种洞，只是这次洞在审批那一侧。
 */
export async function listPendingApprovals(projectId: string, actorId: string, limit = 10): Promise<ApprovalTaskView[]> {
  if (!UUID_LIKE.test(projectId)) return [];
  const take = Math.min(Math.max(Math.trunc(limit) || 1, 1), 50);
  const rows = await getDb()
    .select({ task: agentTasks })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.projectId, projectId),
        eq(agentTasks.createdById, actorId),
        eq(agentTasks.status, 'awaiting_approval'),
      ),
    )
    .orderBy(desc(agentTasks.createdAt))
    .limit(take);
  return rows.map((row) => approvalShape(row.task));
}

export async function readApprovalTask(taskId: string, actorId: string): Promise<ApprovalTaskView | null> {
  if (!UUID_LIKE.test(taskId)) return null;
  const [row] = await getDb()
    .select({ task: agentTasks })
    .from(agentTasks)
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.createdById, actorId)))
    .limit(1);
  return row ? approvalShape(row.task) : null;
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
    requiresApproval: row.requiresApproval,
    approvedAt: row.approvedAt?.toISOString() ?? null,
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
