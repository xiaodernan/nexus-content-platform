import { eq } from 'drizzle-orm';
import type { AgentActivity, AiError, AiJobBackend, AiJobStatusResponse, AiJobStatusValue, AiRequest, AiResponse, RealtimeEvent } from '@nexus/schemas';
import { fetchAiJobStatus, submitAiJob } from '../ai/client';
import { gateResponse, heldRecord, nodeNamer, WEB_APPROVAL_POLICY, DESIGN_PATCH, type ApprovalAction, type GateResult, type HeldRecord, type NodeNamer } from '../ai/approvals';
import { channels, getRealtimeBus } from '../realtime/bus';
import { attachJob, bumpActivityCursor, finishTask, holdForApproval, recordCapabilityRefusal, startTask, taskByJobId, type TaskCapability } from './agent-tasks';
import { agentLedgerFields, findAgent, loadRoster, mentionNote, type AgentRosterEntry, type ResolvedAgent } from './agents';
import { emit } from './notifications';
import { getDb } from '../db/client';
import { agentTasks } from '../db/schema';
import { loadDocument } from './projects';

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
 * - **结果交回浏览器之前过 §74 那道门**。异步这条路与 `/api/ai/run` 用同一个 `gateResponse`、
 *   同一份 `WEB_APPROVAL_POLICY`：含高危动作的结果在这里也只是"挂起"，补丁不进报文。
 *   没有这一条，"绕过审批"就只需要多选一个"异步"。
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
  /** §112：服务端按名册解析出的这一轮负责人（含"点了名但名册里没有"的那几份） */
  agent: ResolvedAgent;
  /** 没人被点名时账本那行的归属：这次请求的意图类别，与同步那条路同一口径 */
  fallbackAgentKey: string;
  capability: TaskCapability;
}): Promise<JobSubmitResult> {
  const fields = agentLedgerFields(input.agent, {
    askedAgentKey: input.wire.agentKey,
    fallbackKey: input.fallbackAgentKey,
  });
  const started = await startTask({
    projectId: input.projectId,
    agentKey: fields.agentKey,
    createdById: input.createdById,
    capability: input.capability,
    // 账本记的是摘要不是整份文档——§68 那条纪律对账本同样成立
    input: {
      prompt: input.wire.prompt.slice(0, 500),
      modelClass: input.wire.modelClass,
      variants: input.wire.variants,
      async: true,
      // §74：策略是服务端定的，异步这一路也要看得清"这一行归哪份规矩管"
      approvalPolicy: WEB_APPROVAL_POLICY,
      ...fields,
    },
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
  /** §74：这份结果里有几处要人先点头；空数组表示 `response` 可以原样交回编辑区 */
  approvals: ApprovalAction[];
  /** §112：这一轮服务端实际交给了谁（账本里那一份，不是浏览器选的那一个） */
  agent: { key: string; name: string } | null;
  /**
   * 能交回的那一份 provider 结果。挂起时给的是补丁已被抽走的那一份（与同步路径同一形状），
   * 批准之后客户端要从 `POST /api/ai/tasks/<taskId>/approval` 拿被扣下的那一版。
   */
  response: AiResponse | null;
}

/** 只说真有的东西：一个补丁都没落地时不写"生成顺利"（与 /api/ai/run 同一口径） */
function summaryOf(response: AiJobStatusResponse['result'] | null): string | null {
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

/**
 * 给审批理由报名字的 namer。读不到文档（项目被删了）时退回"报不出名字"，
 * `describe()` 会退回 op 里那个 id —— 那仍是真信息，比编一个"某个元素"好。
 */
async function namerFor(projectId: string | null): Promise<NodeNamer> {
  const doc = projectId ? await loadDocument(projectId) : null;
  return doc ? nodeNamer(doc) : () => null;
}

/**
 * 这一行账上**被点名**的 Agent（§112）。读的是 `input.agent`，不是 `agentKey`：
 * 没人被点名时 `agentKey` 兜底成这次的意图类别，而 `research` 既是一个意图、也是名册里
 * 一个 Agent 的 key——靠字符串撞上的话，一次没人点名的请求会因为命名巧合被换成另一套权限口径。
 * 所以"没有点名"就是 null：不额外拦一道，与同步那条路完全同一口径。
 */
function namedAgentKeyOf(row: { input: unknown }): string | null {
  const input = row.input as { agent?: { key?: string } | null } | null;
  const key = input && typeof input === 'object' ? input.agent?.key : undefined;
  return typeof key === 'string' && key ? key : null;
}

async function agentFor(agentKey: string | null): Promise<AgentRosterEntry | null> {
  if (!agentKey) return null;
  return findAgent(await loadRoster(), agentKey);
}

/**
 * 交回浏览器之前过一遍门。同步与异步共用 `gateResponse`，这里再共用**同一个调用形状**：
 * §74 的审批挂起与 §73 的越权拒收都从这里出去，两处各写一遍迟早长出一套只在一侧生效的规矩。
 */
async function gateForHandback(
  task: Pick<typeof agentTasks.$inferSelect, 'projectId' | 'input'>,
  result: AiResponse,
): Promise<GateResult> {
  const agent = await agentFor(namedAgentKeyOf(task));
  return gateResponse(result, WEB_APPROVAL_POLICY, await namerFor(task.projectId), agent ?? undefined);
}

/** 一行任务的审批现场：`result` 是挂起时写的 HeldRecord，其余状态读不到就当没有 */
function heldOf(row: { result: unknown; requiresApproval: boolean } | undefined): HeldRecord | null {
  if (!row?.requiresApproval) return null;
  const record = row.result as Partial<HeldRecord> | null;
  if (!record || typeof record !== 'object' || !record.delivered || !Array.isArray(record.approvals)) return null;
  return record as HeldRecord;
}

/** 作业的终态 → 任务行 + 一条 generation 通知。`completed` 不等于"这次生成做成了什么" */
async function settle(
  task: typeof agentTasks.$inferSelect,
  projectName: string | null,
  status: AiJobStatusResponse,
): Promise<void> {
  // 只写在跑的行：已经终态或已经挂起的行不再由这一路改写（同一份状态被问第二次是常态）
  if (task.status !== 'running') return;
  /** 交回客户端的那一份：过门之后可能已经不是 provider 原样给的那份（挂起走 return，拒收会抽走补丁） */
  let result = status.result ?? null;
  let refused: GateResult['refused'] | null = null;
  if (status.status === 'completed' && result) {
    const gate = await gateForHandback(task, result);
    if (gate.approvals.length > 0) {
      // §74 的门开在这里，而不是"等客户端拿到补丁之后自己决定要不要落地"。
      // 挂起时终态不写、通知也不发：一条"Generation complete"替一次还没人决定的事签字，
      // 就是 §164 一开始要避免的那种假事件（与 `/api/ai/run` 同一口径）。
      await holdForApproval(task.id, heldRecord(gate, WEB_APPROVAL_POLICY));
      return;
    }
    refused = gate.refused ?? null;
    result = gate.delivered;
  }
  const softError = status.status === 'completed' ? (result?.error ?? null) : null;
  const ok = status.status === 'completed' && !softError;

  const reason = status.error?.message ?? (softError ? `${softError.code}：${softError.message}` : '作业失败，没有给出原因');
  const detail = ok ? summaryOf(result) : reason;

  await finishTask(task.id, ok ? { ok: true, result: { detail } } : { ok: false, error: reason });
  if (refused) {
    // §73 的后半句（"记录审计事件"）在异步这条路的位置：落账那一次。查询侧再过的门只决定报文形状，
    // 一个作业可以被问很多次，审计里要的是"这次越权发生过"一条，不是"有人来看过几次"
    await recordCapabilityRefusal({
      taskId: task.id,
      actorId: task.createdById,
      projectId: task.projectId,
      agentKey: namedAgentKeyOf(task) ?? task.agentKey,
      agentName: refused.agent,
      missing: DESIGN_PATCH,
      opCount: refused.opCount,
    });
  }
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
  /**
   * §112：点名那一句在提交当时已经随响应头说过一次，异步这条路是"隔几秒再来问"，
   * 不重说的话用户只看到作业跑完了，不知道自己拼错的那个名字被忽略过。
   * 读的是账本里那一份（提交时算的），不是现在重算的——名册与文档都会变，而要说的是当时发生了什么。
   */
  const stated = task.input as
    | { agent?: { key: string; name: string } | null; unknownMentions?: string[]; ignoredMentions?: string[]; rosterEmpty?: boolean }
    | null;
  if (stated && typeof stated === 'object') {
    const mentionNoteOf = mentionNote({
      agent: stated.agent ?? null,
      unknownMentions: stated.unknownMentions ?? [],
      ignoredMentions: stated.ignoredMentions ?? [],
      rosterEmpty: stated.rosterEmpty === true,
    });
    if (mentionNoteOf) notes.push(mentionNoteOf);
  }
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
    .select({
      status: agentTasks.status,
      error: agentTasks.error,
      result: agentTasks.result,
      requiresApproval: agentTasks.requiresApproval,
    })
    .from(agentTasks)
    .where(eq(agentTasks.id, task.id))
    .limit(1);
  const detail = fresh?.result && typeof fresh.result === 'object' && 'detail' in fresh.result ? fresh.result.detail : null;

  /**
   * 交回的那一份只有一种口径：**过门之后的**。
   * - 等待审批：给挂起当时写下的那份 `delivered`（补丁已被抽走）。为什么不拿 `held` 重算一遍：
   *   文档在这几秒里可能已经变了，重算出来的理由会换名字，而用户看到的必须是他被问过的那一句。
   * - 已经批准（行是 `succeeded` 但 `requires_approval` 仍为真）：给完整结果——这一行的批准由
   *   `decideApproval` 认，跑到这一步还在报 completed 的，是"批准之后又有人来问一次"，门已经点过头了。
   * - 已经放弃（`cancelled`）：什么都不给，并且说一句为什么没有。
   * - 其余（没挂起过就跑完的）：**再过一遍门**。这里看起来像重复工——`settle` 已经过过一次了——
   *   但 settle 过的那一次决定的是"账本怎么记"，这一处决定的是"报文怎么发"，两次都要过同一个函数，
   *   才不会出现"账本记成拒收、报文却把补丁发出去了"。§73 的越权拒收正是走这一条。
   */
  const held = fresh?.status === 'awaiting_approval' ? heldOf(fresh) : null;
  let response: AiResponse | null = null;
  let approvals: ApprovalAction[] = [];
  if (held) {
    response = held.delivered;
    approvals = held.approvals;
    notes.push(
      `这份结果含 ${held.approvals.length} 处需要人工审批的动作，补丁留在服务端没有交回（批准走 POST /api/ai/tasks/${task.id}/approval）`,
    );
  } else if (status?.status === 'completed' && status.result) {
    if (fresh?.status === 'cancelled') {
      notes.push('这一份挂起的结果已经被放弃，补丁不会再交回编辑区');
    } else if (fresh?.requiresApproval) {
      response = status.result;
    } else {
      const gate = await gateForHandback(task, status.result);
      response = gate.delivered;
      if (gate.refused) {
        notes.push(`${gate.refused.agent} 的职责里没有"改设计文档"这一条，${gate.refused.opCount} 个 op 没有交回（§73）`);
      }
    }
  }

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
    approvals,
    agent: stated?.agent ?? null,
    response,
  };
}
