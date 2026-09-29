import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { RealtimeEvent } from '@nexus/schemas';
import { channels, getRealtimeBus } from '../realtime/bus';
import { recordAudit } from './audit';
import { chargeGeneration } from './credit-ledger';
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

/**
 * 收尾。result 与 error 互斥由调用方保证，这里只如实落库。
 *
 * §134 的扣点也挂在这里，而不是挂在两个调用方身上：`finishTask` 是同步请求与异步作业
 * **共用**的那一个终态写入方，扣点放在调用方就会长出第二条路（那条路忘了扣，余额页还在发）。
 * 三条边界：
 * - 只有 `succeeded` 扣点，失败与"等人裁决"都不扣（用户没拿到东西，扣点等于罚）；
 * - 一次任务只扣一行（库里 `credit_ledger_task_kind_key` 那条部分唯一索引兜着）；
 * - 写不进账本就让它抛。这里 catch 掉等于宣布"这次生成是免费的"，
 *   而那正是 §134 要的"消费透明"的反面。
 */
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
    .returning({
      id: agentTasks.id,
      projectId: agentTasks.projectId,
      createdById: agentTasks.createdById,
      agentKey: agentTasks.agentKey,
      capability: agentTasks.capability,
    });
  const row = rows[0];
  if (row) {
    // 失败也推：任务页与 Studio 上的"正在生成"要能自己停下来，而不是永远转着
    publishGenerationProgress(row.projectId, id, 1, outcome.ok ? '完成' : `失败：${reason}`);
    if (status === 'succeeded' && row.createdById) {
      await chargeGeneration({
        taskId: id,
        userId: row.createdById,
        projectId: row.projectId ?? null,
        agentKey: row.agentKey,
        capability: row.capability ?? null,
      });
    }
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

/**
 * §25：把这轮的计划写进 `plan` 列。
 *
 * 这一列从 0000 建库起就在表上，但直到 2026-09-29 **全库没有一处写它**——于是 §25 说的
 * "用户可以看到 Planning… 1..8" 只能活在那个请求的内存里，刷新就没了。写入方只有一处
 * （`server/agent/runtime.ts` 的编排器），读回来仍是 `AgentPlanSchema` 那一份形状，
 * 所以计划不会长出第二个版本。
 */
export async function recordPlan(taskId: string, plan: unknown): Promise<boolean> {
  const rows = await getDb()
    .update(agentTasks)
    .set({ plan: plan as never })
    .where(eq(agentTasks.id, taskId))
    .returning({ id: agentTasks.id });
  return rows.length > 0;
}

/** 编排作业的一行：计划 + 终态结果。这两列只给 §112 的编排读，TaskView 不带上它们 */
export interface PlannedTaskView {
  taskId: string;
  projectId: string;
  projectName: string | null;
  status: string;
  capability: TaskCapability | null;
  error: string | null;
  /**
   * §25 的计划。形状由读的人拿 `AgentPlanSchema` 校验（jsonb 列本身没有类型）；
   * 值是 null = 这行不是编排产生的。这里写 `unknown` 而不是 `unknown | null`——
   * `unknown` 本来就含 null，再写一遍只会让 lint 说这是句废话。
   */
  plan: unknown;
  /** 终态：每一步的结论（见 `server/agent/runtime.ts`） */
  result: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

function plannedShape(row: { task: typeof agentTasks.$inferSelect; projectName: string | null }): PlannedTaskView {
  return {
    taskId: row.task.id,
    projectId: row.task.projectId ?? '',
    projectName: row.projectName,
    status: row.task.status,
    capability: row.task.capability ?? null,
    error: row.task.error,
    plan: row.task.plan ?? null,
    result: row.task.result ?? null,
    startedAt: row.task.startedAt?.toISOString() ?? null,
    finishedAt: row.task.finishedAt?.toISOString() ?? null,
    createdAt: row.task.createdAt.toISOString(),
  };
}

/**
 * 这个项目最近一次编排作业。
 *
 * `isNotNull(plan)` 就是"这行是编排"的判定：普通 `/api/ai/run` 从来不写 plan 列，
 * 所以不必再拿 `input` 里那个标记当真值——多存一份状态就多一处会漂移。
 * 归属同样按项目所有者判：别人的项目连"有没有过作业"都不给。
 */
export async function latestPlannedTask(projectId: string, actorId: string): Promise<PlannedTaskView | null> {
  const [row] = await getDb()
    .select({ task: agentTasks, projectName: projects.name })
    .from(agentTasks)
    .innerJoin(projects, eq(projects.id, agentTasks.projectId))
    .where(
      and(
        eq(agentTasks.projectId, projectId),
        eq(projects.ownerId, actorId),
        isNull(projects.deletedAt),
        isNotNull(agentTasks.plan),
      ),
    )
    .orderBy(desc(agentTasks.createdAt))
    .limit(1);
  return row ? plannedShape(row) : null;
}

/** 一条编排作业（按归属判；别人的与不存在给同一个答案） */
export async function plannedTask(taskId: string, actorId: string): Promise<PlannedTaskView | null> {
  const [row] = await getDb()
    .select({ task: agentTasks, projectName: projects.name })
    .from(agentTasks)
    .innerJoin(projects, eq(projects.id, agentTasks.projectId))
    .where(and(eq(agentTasks.id, taskId), eq(projects.ownerId, actorId), isNotNull(agentTasks.plan)))
    .limit(1);
  return row ? plannedShape(row) : null;
}

/** 「在跑」超过这个时长还没有执行方收尾，就认为那一轮死了（编排是同步跑完的，不是长驻作业） */
export const STALE_RUN_MS = 5 * 60 * 1000;

/**
 * 断在半路的编排行（§162 / ADR-0011 同一个口径：读的时候收敛）。
 *
 * 编排在 web 进程里同步跑完，所以一行 `running` 挂着超过 `STALE_RUN_MS` 只可能是
 * 进程被重启或被杀——那行不会自己变回终态，界面上就成了"永远在跑"。这里只碰没有
 * `providerJobId` 的行：有作业号的那些归 §162 的消费者管，两边不抢同一行。
 */
export async function convergeStaleRun(taskId: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await getDb()
    .select({ status: agentTasks.status, providerJobId: agentTasks.providerJobId, startedAt: agentTasks.startedAt })
    .from(agentTasks)
    .where(eq(agentTasks.id, taskId))
    .limit(1);
  if (!row || row.status !== 'running' || row.providerJobId || !row.startedAt) return false;
  if (now.getTime() - row.startedAt.getTime() < STALE_RUN_MS) return false;
  await finishTask(taskId, {
    ok: false,
    error: `这次编排没有跑完：执行方超过 ${Math.round(STALE_RUN_MS / 60000)} 分钟没有收尾（进程被重启或被杀），计划里那一步的状态是最后一次落库的样子`,
  });
  return true;
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
  /**
   * §134：批准就是这条任务的成功终态，所以它也要扣点——挂起那一次 `deliver` 没走收尾，
   * 这份补丁到现在才真的落到画布上，不扣点就等于"走审批门的那条路免费"。
   * 拒绝不扣（用户没拿到东西）。这里与 `finishTask` 共用同一个 `chargeGeneration`，
   * 而库里的 `credit_ledger_task_kind_key` 挡住任何第二次写，所以"批准后作业又被轮询到"
   * 那种回头路也只会有一行账。
   */
  if (decision === 'approve') {
    await chargeGeneration({
      taskId,
      userId: actorId,
      projectId: row.projectId ?? null,
      agentKey: row.agentKey,
      capability: row.capability ?? null,
    });
  }
  return { ok: true, decision, status, held: decision === 'approve' ? (result.held ?? null) : null, approvals: result.approvals ?? [] };
}

/**
 * §73「越权调用直接失败并记录审计事件」里"记录"的那一半。
 *
 * 只在**落账那一次**写（同步的 deliver / 异步的 settle），不在查询侧再写一遍：
 * 一个作业可以被问很多次，审计要的是"这次越权发生过"这一条事实，不是"有人来看过几次"。
 */
export async function recordCapabilityRefusal(input: {
  taskId: string;
  actorId: string | null;
  projectId: string | null;
  agentKey: string;
  agentName: string;
  missing: string;
  opCount: number;
  ip?: string | null;
}): Promise<void> {
  await recordAudit({
    actorId: input.actorId,
    action: 'ai.agent.capability',
    targetType: 'agent_task',
    targetId: input.taskId,
    allowed: false,
    detail: {
      agentKey: input.agentKey,
      agent: input.agentName,
      missing: input.missing,
      opCount: input.opCount,
      projectId: input.projectId,
    },
    ip: input.ip ?? null,
  });
}

function approvalShape(task: typeof agentTasks.$inferSelect) {  const record = (task.result ?? {}) as { approvals?: unknown; heldOpCount?: unknown };
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
