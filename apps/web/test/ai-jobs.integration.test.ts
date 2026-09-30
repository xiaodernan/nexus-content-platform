import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AiJobStatusResponse, AiRequest, AiResponse } from '@nexus/schemas';
import { AiJobObservationSchema, APPROVAL_TTL_MS } from '@nexus/schemas';
import { observeJob, submitJob } from '../src/server/domain/ai-jobs';
import type { ResolvedAgent } from '../src/server/domain/agents';
import { decideApproval, listProjectTasks } from '../src/server/domain/agent-tasks';
import { createProject, listProjects, loadDocument } from '../src/server/domain/projects';
import { channels, getRealtimeBus } from '../src/server/realtime/bus';
import { getDb } from '../src/server/db/client';
import { agentTasks, auditEvents, notifications, projects, users } from '../src/server/db/schema';

/**
 * §162 web 侧作业消费者：状态的真值在 ai-service 那一侧，所以这台测试的重点不是
 * "队列能不能跑"（那是 `apps/ai-service/tests/test_jobs.py` 的 9 条），而是
 * **web 拿到一份作业状态之后做对了什么**：
 * 什么时候写任务行、什么时候闭嘴、什么时候不许把 `completed` 当成功、
 * 查不到时为什么不能留着一条永远转圈的 running。
 *
 * 因此这里用的是一个假 ai-service（本地 HTTP，返回按 `AiJobStatusResponseSchema` 的形状写）：
 * 假的这一侧只负责"照我说的报状态"，被测的那一侧是 web 的镜像逻辑。
 * stub 的形状必须与真报文一致——少给一个字段、多给一个字段，测出来的都是另一个东西。
 * 真服务连同真 worker 的验证在 e2e 那一条（同一个 DEMO 之外的路径）。
 */

const RUN = `s162${Date.now().toString(36)}`;
let ownerId = '';
let otherId = '';
let projectId = '';
const createdProjects: string[] = [];

/** 假 ai-service 的可变剧本 */
let nextStatus: AiJobStatusResponse | null = null;
let statusForUnknown: { status: number; body: unknown } = { status: 404, body: { code: 'not_found', message: 'job not found' } };
let getCalls = 0;
let postCalls = 0;
let lastSubmitted: unknown = null;
/** 手工推进的作业状态：每个用例自己决定下一次 GET 报什么 */
function scriptedJob(over: Partial<AiJobStatusResponse>): AiJobStatusResponse {
  return {
    jobId: over.jobId ?? 'job-x',
    requestId: over.requestId ?? 'req-x',
    backend: over.backend ?? 'memory',
    status: over.status ?? 'running',
    queuedAt: over.queuedAt ?? new Date('2026-09-26T00:00:00.000Z').toISOString(),
    startedAt: over.startedAt ?? new Date('2026-09-26T00:00:01.000Z').toISOString(),
    finishedAt: over.finishedAt ?? null,
    progress: over.progress ?? null,
    activities: over.activities ?? [],
    ...(over.result ? { result: over.result } : {}),
    ...(over.error ? { error: over.error } : {}),
  };
}

/**
 * 一份能过 `AiResponseSchema` 的 provider 结果。为什么要写全而不是 `as never` 塞一个形状：
 * `fetchAiJobStatus` 会按契约校验整份报文，stub 少一个必填字段就会以"契约违约"的形态红，
 * 而那条红与"镜像逻辑写错了"长得一模一样——测试自己造的坑最容易骗过人。
 */
function okResponse(over: Partial<AiResponse> = {}): AiResponse {
  return {
    requestId: `req-${RUN}`,
    capability: 'real',
    provider: 'fake-provider',
    model: 'fake-model',
    plans: [],
    patches: [{ ops: [] }],
    labels: [],
    activities: [],
    explanation: '',
    usage: { provider: 'fake-provider', model: 'fake-model', modelClass: 'balanced', tokensIn: 0, tokensOut: 0, latencyMs: 10, costUsd: 0, toolCalls: 0, demoMode: false },
    approvals: [],
    ...over,
  };
}

let server: Server;
let baseUrl = '';
const originalUrl = process.env.NEXUS_AI_SERVICE_URL;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `队列作者${RUN}`, email: `s162o+${RUN}@nexus.test`, handle: `s162${RUN}` })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ displayName: `队列路人${RUN}`, email: `s162a+${RUN}@nexus.test`, handle: `s162a${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  otherId = other!.id;
  const doc = await createProject(ownerId, { name: `队列项目${RUN}`, kind: 'website' });
  projectId = doc.id;
  createdProjects.push(doc.id);

  server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/ai/jobs') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        postCalls += 1;
        try {
          lastSubmitted = JSON.parse(body) as unknown;
        } catch {
          lastSubmitted = null;
        }
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jobId: `job-${postCalls}`, requestId: 'req-x', status: 'queued', backend: 'memory', note: '内存后端：重启即失', capacity: 1 }));
      });
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/v1/ai/jobs/')) {
      getCalls += 1;
      if (nextStatus && req.url === `/v1/ai/jobs/${nextStatus.jobId}`) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(nextStatus));
        return;
      }
      res.writeHead(statusForUnknown.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(statusForUnknown.body));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'not_found', message: 'no such route' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.NEXUS_AI_SERVICE_URL = baseUrl;
});

afterEach(() => {
  nextStatus = null;
  getCalls = 0;
  lastSubmitted = null;
  statusForUnknown = { status: 404, body: { code: 'not_found', message: 'job not found' } };
});

afterAll(async () => {
  if (originalUrl === undefined) delete process.env.NEXUS_AI_SERVICE_URL;
  else process.env.NEXUS_AI_SERVICE_URL = originalUrl;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const db = getDb();
  // 审计行不会因为删任务而消失（那张表本来就是"删了业务行也要留下当时发生过什么"），自己收干净
  await db.delete(auditEvents).where(and(eq(auditEvents.action, 'ai.agent.capability'), eq(auditEvents.actorId, ownerId)));
  await db.delete(agentTasks).where(inArray(agentTasks.projectId, createdProjects));
  await db.delete(projects).where(inArray(projects.id, createdProjects));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

/** 每次现取 projectId：模块加载时它还只是空串，写成常量会把一个不存在的项目 id 发出去 */
const wireFor = (pid: string): AiRequest => ({
  requestId: `req-${RUN}`,
  intent: 'design-edit',
  prompt: '把标题换成更醒目的那一版',
  modelClass: 'balanced',
  variants: 1,
  context: { projectId: pid, selection: [], recentChanges: [] },
  references: [],
  // §74 的两栏在契约上有默认值，`AiRequest`（推断自输出侧）因此要求显式给：
  // 空审批策略 + 非 dryRun，就是"这次提交不挂审批、要真跑"
  approvalPolicy: [],
  dryRun: false,
});

/**
 * §112 之后 `submitJob` 吃的是**服务端解析出的那一份**（`ResolvedAgent`），不再是一个自由字符串。
 * 这一片测的是"web 怎么镜像作业状态"，所以默认给一份"没人被点名"的解析结果；
 * 名册解析本身在 `agents.integration.test.ts`，那里的真名册读的是库。
 */
const UNNAMED: ResolvedAgent = { agent: null, unknown: [], ignored: [], rosterEmpty: false };

async function submit(agentKey = 'design-edit', agent: ResolvedAgent = UNNAMED) {
  const result = await submitJob({ wire: wireFor(projectId), projectId, createdById: ownerId, agent, fallbackAgentKey: agentKey, capability: 'real' });
  if (!result.ok) throw new Error('这次提交本身失败了，用例的前提不成立');
  return result;
}

async function taskRow(taskId: string) {
  const [row] = await getDb().select().from(agentTasks).where(eq(agentTasks.id, taskId)).limit(1);
  return row!;
}

async function generationRows(taskId: string) {
  return getDb()
    .select({ kind: notifications.kind, body: notifications.body, title: notifications.title })
    .from(notifications)
    .where(and(eq(notifications.dedupeKey, `generation:${taskId}`)));
}

describe('提交：先有账本，再有作业号', () => {
  it('提交成功时任务行拿到 providerJobId，状态还是 running（没跑完不写成功）', async () => {
    const submitted = await submit();
    // 作业号由 ai-service 给，这里只要求它是它报的那个：唯一索引会挡住"两行认领同一个号"，
    // 所以用例之间不能复用号（fake 的计数不重置，就是这个原因）
    expect(/^job-\d+$/.test(submitted.jobId)).toBe(true);
    expect(submitted.backend).toBe('memory');
    // ai-service 那句限制原样带回来，不改写成"已入队，稍后可查"
    expect(submitted.note).toBe('内存后端：重启即失');
    const row = await taskRow(submitted.taskId);
    expect(row.providerJobId).toBe(submitted.jobId);
    expect(row.status).toBe('running');
    expect(row.finishedAt).toBeNull();
    expect((row.input as { async?: boolean }).async).toBe(true);

    // 对照：账本里这一行确实归在这个项目下，而且带得进项目任务列表
    const listed = await listProjectTasks(projectId, ownerId);
    expect(listed?.tasks.some((t) => t.id === submitted.taskId)).toBe(true);

    // 落到假服务的是 assemble 之后的 wire：§68 那条边界对异步提交同样成立。
    // 正面先断"该带的带了"（intent / projectId），反面才说"不该带的没带"（整份文档）
    const posted = lastSubmitted as { intent?: string; context?: { projectId?: string }; document?: unknown };
    expect(posted.intent).toBe('design-edit');
    expect(posted.context?.projectId).toBe(projectId);
    expect(posted.document).toBeUndefined();
  });

  it('ai-service 没答话时把那行结掉，而不是留一条永远查不到的 running', async () => {
    process.env.NEXUS_AI_SERVICE_URL = 'http://127.0.0.1:1';
    const result = await submitJob({ wire: wireFor(projectId), projectId, createdById: ownerId, agent: UNNAMED, fallbackAgentKey: 'design-edit', capability: 'real' });
    process.env.NEXUS_AI_SERVICE_URL = baseUrl;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('前提不成立');
    expect(result.status).toBeNull();
    expect(result.error.code).toBe('provider-unavailable');
    const newest = (await listProjectTasks(projectId, ownerId))!.tasks[0]!;
    const row = await taskRow(newest.id);
    expect(row.status).toBe('failed');
    expect(row.error).toBe(result.error.message);
    expect(row.finishedAt).not.toBeNull();
    expect(row.providerJobId).toBeNull();
  });
});

describe('观察：web 只是镜像，写什么由观察到的东西决定', () => {
  it('还在跑：任务行不动，进度是空的，内存后端与没有进度来源各说一句', async () => {
    const submitted = await submit();
    nextStatus = scriptedJob({ jobId: submitted.jobId, status: 'running' });
    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.jobStatus).toBe('running');
    expect(seen?.taskStatus).toBe('running');
    // 不许替 worker 填一个 0.5：单次 LLM 调用没有可观测的中间态
    expect(seen?.progress).toBeNull();
    expect(seen?.notes.join(' ')).toContain('内存里');
    expect(seen?.notes.join(' ')).toContain('进度');
    expect((await taskRow(submitted.taskId)).status).toBe('running');
    expect(await generationRows(submitted.taskId)).toHaveLength(0);
  });

  it('completed 但 provider 带着 error：账本与通知都按失败记', async () => {
    const submitted = await submit();
    nextStatus = scriptedJob({
      jobId: submitted.jobId,
      status: 'completed',
      finishedAt: new Date('2026-09-26T00:00:09.000Z').toISOString(),
      result: okResponse({ patches: [], error: { code: 'provider-unavailable', message: 'DEMO Mock 不认这条指令', retryable: false } }),
    });
    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.jobStatus).toBe('completed');
    expect(seen?.taskStatus).toBe('failed');
    expect((await taskRow(submitted.taskId)).error).toContain('DEMO Mock 不认这条指令');
    const rows = await generationRows(submitted.taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toContain('失败');

    // 反向对照：同样一份 result 去掉那个 error，同一份代码就记成成功
    const okSubmitted = await submit();
    nextStatus = scriptedJob({
      jobId: okSubmitted.jobId,
      status: 'completed',
      result: okResponse(),
    });
    const okSeen = await observeJob(okSubmitted.jobId, ownerId);
    expect(okSeen?.taskStatus).toBe('succeeded');
    expect(okSeen?.outcome).toBe('1 处补丁 · 0 份方案');
  });

  it('同一份 completed 被问两次：任务行不重写、通知只有一条（幂等靠 dedupe 键，不靠运气）', async () => {
    const submitted = await submit();
    nextStatus = scriptedJob({
      jobId: submitted.jobId,
      status: 'completed',
      result: okResponse(),
    });
    expect((await observeJob(submitted.jobId, ownerId))?.taskStatus).toBe('succeeded');
    const first = await taskRow(submitted.taskId);
    expect(await observeJob(submitted.jobId, ownerId)).not.toBeNull();
    const second = await taskRow(submitted.taskId);
    expect(second.finishedAt?.getTime()).toBe(first.finishedAt?.getTime());
    expect(await generationRows(submitted.taskId)).toHaveLength(1);
  });

  it('failed：原因原样进账本，没有原因时是那句兜底而不是空', async () => {
    const submitted = await submit();
    nextStatus = scriptedJob({ jobId: submitted.jobId, status: 'failed', error: { code: 'provider-failed', message: 'worker 抛了：上游 502', retryable: true } });
    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.taskStatus).toBe('failed');
    expect(seen?.outcome).toBe('worker 抛了：上游 502');

    const noReason = await submit();
    nextStatus = scriptedJob({ jobId: noReason.jobId, status: 'failed' });
    const seen2 = await observeJob(noReason.jobId, ownerId);
    expect(seen2?.outcome).toBe('作业失败，没有给出原因');
  });

  it('作业在那一侧查不到：running 的行落成 failed 并写明原因；已经成功的行不倒回去', async () => {
    const submitted = await submit();
    nextStatus = null; // 走 404
    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.jobStatus).toBeNull();
    expect(seen?.taskStatus).toBe('failed');
    expect(seen?.notes.join(' ')).toContain('查不到');

    // 对照：同一份 404 打在一行已经成功的任务上，状态不许被改写
    const done = await submit();
    nextStatus = scriptedJob({
      jobId: done.jobId,
      status: 'completed',
      result: okResponse(),
    });
    await observeJob(done.jobId, ownerId);
    nextStatus = null;
    const again = await observeJob(done.jobId, ownerId);
    expect(again?.taskStatus).toBe('succeeded');
    expect((await taskRow(done.taskId)).status).toBe('succeeded');
  });

  it('问不到（非 404）时任务行一动都不动：没观察到终态就不写终态', async () => {
    const submitted = await submit();
    statusForUnknown = { status: 503, body: { code: 'provider-unavailable', message: 'ai-service 正在重启', retryable: true } };
    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.jobStatus).toBeNull();
    expect(seen?.taskStatus).toBe('running');
    expect(seen?.notes.join(' ')).toContain('正在重启');
    expect((await taskRow(submitted.taskId)).status).toBe('running');
  });
});

describe('活动列表 → 实时事件：推过的不再推第二遍', () => {
  it('started/completed 走 agent.step，info 走 agent.activity；第二次观察同一批活动一条都不发', async () => {
    const submitted = await submit();
    const events: string[] = [];
    const unsubscribe = getRealtimeBus().subscribe(channels.project(projectId), (e) => {
      if (e.type === 'agent.step' || e.type === 'agent.activity') events.push(`${e.type}:${'stepId' in e ? e.stepId : e.activity.stage}:${e.taskId === submitted.taskId ? 'mine' : 'other'}`);
    });
    nextStatus = scriptedJob({
      jobId: submitted.jobId,
      status: 'running',
      activities: [
        { stage: 'assemble', status: 'started', summary: '装配上下文' },
        { stage: 'assemble', status: 'completed', summary: '目录 12 页' },
        { stage: 'note', status: 'info', summary: '这一条只是交代一句' },
      ],
    });
    const first = await observeJob(submitted.jobId, ownerId);
    expect(first?.activities).toHaveLength(3);
    // 顺序与内容都是真的：三条活动、各自落在正确的事件类型上
    expect(events).toEqual([
      `agent.step:0:assemble:mine`,
      `agent.step:1:assemble:mine`,
      `agent.activity:note:mine`,
    ]);
    expect((await taskRow(submitted.taskId)).activityCursor).toBe(3);

    // 同一批活动再问一次：一条都不许再推（不然界面的过程列表会越刷越长）
    const before = events.length;
    await observeJob(submitted.jobId, ownerId);
    expect(events).toHaveLength(before);

    // 对照：活动列表真的长了，才推新增那一条，游标跟着走
    nextStatus = scriptedJob({
      jobId: submitted.jobId,
      status: 'completed',
      activities: [
        { stage: 'assemble', status: 'started', summary: '装配上下文' },
        { stage: 'assemble', status: 'completed', summary: '目录 12 页' },
        { stage: 'note', status: 'info', summary: '这一条只是交代一句' },
        { stage: 'provider', status: 'completed', summary: 'provider 返回 1 处补丁' },
      ],
      result: okResponse(),
    });
    await observeJob(submitted.jobId, ownerId);
    expect(events.slice(before)).toEqual(['agent.step:3:provider:mine']);
    expect((await taskRow(submitted.taskId)).activityCursor).toBe(4);
    unsubscribe();
  });
});

describe('归属：别人的作业号在这里问不出任何东西', () => {
  it('路人拿同一个 jobId：查不到，而且 web 连去问 ai-service 都没有问', async () => {
    const submitted = await submit();
    nextStatus = scriptedJob({ jobId: submitted.jobId, status: 'completed' });
    const callsBefore = getCalls;
    expect(await observeJob(submitted.jobId, otherId)).toBeNull();
    // 这一句是关键：归属判断在前，去问在后。反过来（先问再判）就会把别人的提示词摘要与补丁
    // 取回自己的进程里再拒——那已经是把东西拿出来了
    expect(getCalls).toBe(callsBefore);
    // 对照：同一个人同一个号，这次去问了，而且状态落进行
    expect(await observeJob(submitted.jobId, ownerId)).not.toBeNull();
    expect(getCalls).toBe(callsBefore + 1);
    expect((await taskRow(submitted.taskId)).status).toBe('succeeded');
  });

  it('项目不属于这个人时，任务列表整个不给（连任务数都不报）', async () => {
    await submit();
    expect(await listProjectTasks(projectId, otherId)).toBeNull();
    expect((await listProjects(ownerId)).some((p) => p.id === projectId)).toBe(true);
  });
});

/**
 * §74 的门装在异步这条路上。这一组的重点不是"门会不会拦"（那是 `ai-approvals.integration.test.ts`
 * 那 16 条的事），而是**同一条路上多了第二条入口之后，绕过去要付出什么**：
 * 如果异步这条路把结果原样交回，那么"绕过审批"就只需要在提交时多选一个"异步"——
 * 门就没必要存在了。所以这一组钉的是：拦点在这一侧、拦下之后账本上是什么、
 * 批准/放弃之后再来问给什么，以及一次都没做完时不许有"Generation complete"。
 */

/** 从项目当前文档里取一个真实存在的非根节点：审批理由要报得出它的名字，就得用真 id */
async function victimNode() {
  const doc = await loadDocument(projectId);
  if (!doc) throw new Error('项目文档读不到，用例的前提不成立');
  const page = doc.pages[0];
  if (!page) throw new Error('项目文档没有页，用例的前提不成立');
  const node = Object.values(page.nodes).find((n) => n.id !== page.rootId);
  if (!node) throw new Error('这一页只有根节点，用例需要一个可删的子节点');
  return { pageId: page.id, nodeId: node.id, name: node.name };
}

/** 提交一份"跑完了、结果里带一个删除动作"的作业，并观察一次（返回这一轮看到的东西） */
async function heldJob(nodeId?: string) {
  const submitted = await submit();
  const v = await victimNode();
  nextStatus = scriptedJob({
    jobId: submitted.jobId,
    status: 'completed',
    result: okResponse({ patches: [{ pageId: v.pageId, summary: '删掉这一块', ops: [{ op: 'remove', nodeId: nodeId ?? v.nodeId }] }] }),
  });
  const seen = await observeJob(submitted.jobId, ownerId);
  if (!seen) throw new Error('自己的作业问不到，用例的前提不成立');
  return { submitted, v, seen };
}

describe('§74 的同一道门：异步作业的结果也要先过门才交回', () => {
  it('completed 带 remove：补丁不交回、行挂成 awaiting_approval、通知一条都不发', async () => {
    const { submitted, v, seen } = await heldJob();
    expect(seen.jobStatus).toBe('completed');
    // 作业真的跑完了（jobStatus 是 completed），但任务行没写成功也没写失败——它在等人决定
    expect(seen.taskStatus).toBe('awaiting_approval');
    expect(seen.approvals).toHaveLength(1);
    expect(seen.approvals[0]?.action).toBe('delete');
    // 理由里是文档里那个节点的名字：证明异步这条路径也走了一遍 nodeNamer，
    // 而不是"读不到就退回 id"那条兜底（真挂起时退化成裸 uuid 是能被接受的，但不该是默认）
    expect(seen.approvals[0]?.reason).toContain(v.name);
    // 交回的那一份里补丁是空的，而它带的是 approval-required 而不是"成功"
    expect(seen.response?.patches ?? []).toEqual([]);
    expect(seen.response?.error?.code).toBe('approval-required');
    expect(JSON.stringify(seen.notes)).toContain('需要人工审批');
    expect(AiJobObservationSchema.safeParse(seen).success).toBe(true);

    const row = await taskRow(submitted.taskId);
    expect(row.status).toBe('awaiting_approval');
    expect(row.requiresApproval).toBe(true);
    // 等待不是终态：写了 finishedAt，任务列表就会把"还等人决定"算进已跑完的用时
    expect(row.finishedAt).toBeNull();
    // 存的是完整的那一份（批准的凭据是"看过这一版"），所以被扣下的 op 必须还在库里
    const record = row.result as { held?: { patches?: unknown[] }; approvals?: unknown[]; heldOpCount?: number };
    expect(record.held?.patches).toHaveLength(1);
    expect(record.approvals).toHaveLength(1);
    expect(record.heldOpCount).toBe(1);
    // 这一句是这一组的核心反面：异步这条路上，"跑完"不该发一条完成通知
    expect(await generationRows(submitted.taskId)).toHaveLength(0);
  });

  /**
   * §74 的到期在异步那条路上也要成立：作业挂起之后没人来点，Studio 是每隔几秒来问一次的，
   * 那一条读就是这一片里"看得见等待态的入口"之一。不在这儿收敛，界面上就会出现一张
   * 几天没动的"还等着审批"卡片——而且它的批准按钮按下去也不会生效，那才是真难解释的样子。
   */
  it('挂起之后一直没人裁决：下一次轮询把它作废，而不是继续说"还等着"', async () => {
    const { submitted, seen } = await heldJob();
    expect(seen.taskStatus).toBe('awaiting_approval');
    await getDb()
      .update(agentTasks)
      .set({ awaitingSince: new Date(Date.now() - APPROVAL_TTL_MS - 60_000) })
      .where(eq(agentTasks.id, submitted.taskId));

    const again = await observeJob(submitted.jobId, ownerId);
    expect(again?.taskStatus).toBe('cancelled');
    // 补丁到死都没交回：作废改的是行的状态，不是"过期之后换个说法把内容发出去"
    expect(again?.response?.patches ?? []).toEqual([]);
    const notes = JSON.stringify(again?.notes ?? []);
    expect(notes).toContain('已作废');
    // 也不能反过来谎称是用户点的放弃：那一句只属于真的有人裁决过的行
    expect(notes).not.toContain('已经被放弃');

    const row = await taskRow(submitted.taskId);
    expect(row.status).toBe('cancelled');
    expect(row.approvedBy).toBeNull();
    expect(row.approvedAt).toBeNull();
    // 作废不是完成：一条生成完成的通知都不该因为"终于有了终态"而发出去
    expect(await generationRows(submitted.taskId)).toHaveLength(0);
  });

  it('反向对照：没有高危动作的 completed 照旧一路到底——补丁交回、行写成功、通知一条', async () => {
    const submitted = await submit();
    const v = await victimNode();
    nextStatus = scriptedJob({
      jobId: submitted.jobId,
      status: 'completed',
      result: okResponse({ patches: [{ pageId: v.pageId, summary: '换一句标题', ops: [{ op: 'set', nodeId: v.nodeId, path: 'name', value: '更醒目' }] }] }),
    });
    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.approvals).toEqual([]);
    expect(seen?.taskStatus).toBe('succeeded');
    expect(seen?.response?.patches?.[0]?.ops).toHaveLength(1);
    expect((await taskRow(submitted.taskId)).requiresApproval).toBe(false);
    expect(await generationRows(submitted.taskId)).toHaveLength(1);
  });

  it('批准之后再来问一次：给回完整的那一份，而不是又挂起来一次', async () => {
    const v = await victimNode();
    const { submitted } = await heldJob(v.nodeId);
    const decided = await decideApproval(submitted.taskId, ownerId, 'approve', '127.0.0.1');
    expect(decided.ok).toBe(true);
    // 批准交回的就是被扣下的那一版：一个 op 都没少，也没重新生成
    const held = (decided.ok ? decided.held : null) as { patches?: { ops: unknown[] }[] } | null;
    expect(held?.patches?.[0]?.ops).toHaveLength(1);

    // 决定之后同一个作业再问一次（界面刷新、另一个标签页轮询都会走到这里）
    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.taskStatus).toBe('succeeded');
    expect(seen?.approvals).toEqual([]);
    expect(seen?.response?.patches?.[0]?.ops).toHaveLength(1);
    // 行没有被打回等待态：门点过头之后，同一份结果不该再拦第二次
    const row = await taskRow(submitted.taskId);
    expect(row.status).toBe('succeeded');
    expect(row.requiresApproval).toBe(true);
    expect(row.approvedBy).toBe(ownerId);
  });

  it('放弃之后再来问：一份补丁都不给，并且说一句为什么没有', async () => {
    const v = await victimNode();
    const { submitted } = await heldJob(v.nodeId);
    const decided = await decideApproval(submitted.taskId, ownerId, 'reject', '127.0.0.1');
    expect(decided.ok).toBe(true);
    expect(decided.ok ? decided.status : null).toBe('cancelled');

    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.taskStatus).toBe('cancelled');
    // ai-service 那一侧仍报 completed 且带着结果——放弃是对"要不要交回"的决定，不是对作业的判断
    expect(seen?.jobStatus).toBe('completed');
    expect(seen?.response).toBeNull();
    expect(JSON.stringify(seen?.notes)).toContain('已经被放弃');
  });

  it('同一次挂起被问两次：现场不重写，两次给的是同一份说法', async () => {
    const v = await victimNode();
    const { submitted } = await heldJob(v.nodeId);
    const first = (await observeJob(submitted.jobId, ownerId))!;
    expect(first.taskStatus).toBe('awaiting_approval');
    const row = await taskRow(submitted.taskId);
    expect(row.status).toBe('awaiting_approval');
    // 两轮给出去的报文完全相同：`delivered` 是挂起当时存下的那一份，不是每次现算的
    expect(first.response).not.toBeNull();
    expect(JSON.stringify(first.response)).toBe(JSON.stringify((row.result as { delivered: unknown }).delivered));
    // 文档在两轮之间没有变，重算也只会算出同一句理由——但代码不该依赖"没有变"这个前提
    expect(first.approvals).toHaveLength(1);
    expect(await generationRows(submitted.taskId)).toHaveLength(0);
  });

  it('文档里查不到的节点 id：理由退回那个 id，不编一个"某个元素"', async () => {
    const { seen } = await heldJob('ghost-node-not-in-this-doc');
    expect(seen.approvals[0]?.reason).toContain('ghost-node-not-in-this-doc');
    expect(seen.approvals[0]?.reason).not.toContain('某个元素');
    // 报不出名字不等于放过：门照样拦
    expect(seen.taskStatus).toBe('awaiting_approval');
  });
});

/**
 * §73 在异步这条路的那一半：被点名的 Agent 没有 `design.patch` 时，结果是**拒收**，不是挂起。
 *
 * 为什么单独一组：§74 与 §73 在界面上长得像（都是"补丁没进画布"），但语义相反——
 * 挂起是"这件事等人点头"，拒收是"这一位点了头也没用"。把它们混在一个 describe 里，
 * 下一次有人只改 `approvals` 那条分支，测试不会告诉他另一条也变了。
 */
describe('§73 的越权拒收：被点名的人没有 design.patch', () => {
  const QA: ResolvedAgent = {
    agent: { key: 'qa', name: 'QA Agent', responsibilities: ['只提问题，不改设计文档'], capabilities: ['browser.read', 'test.run'] },
    unknown: [],
    ignored: [],
    rosterEmpty: false,
  };
  const DESIGN: ResolvedAgent = {
    agent: { key: 'design', name: 'Design Agent', responsibilities: ['规划并修改设计模型'], capabilities: ['design.read', 'design.patch'] },
    unknown: [],
    ignored: [],
    rosterEmpty: false,
  };

  async function refusedJob(nodeId: string, pageId: string, op: { op: 'remove'; nodeId: string } | { op: 'set'; nodeId: string; path: string; value: unknown }) {
    const submitted = await submit('qa', QA);
    nextStatus = scriptedJob({
      jobId: submitted.jobId,
      status: 'completed',
      result: okResponse({ patches: [{ pageId, summary: '动一下这一块', ops: [op as never] }] }),
    });
    const seen = await observeJob(submitted.jobId, ownerId);
    if (!seen) throw new Error('自己的作业问不到，用例的前提不成立');
    return { submitted, seen };
  }

  it('remove 来自 QA：不挂起、不交回，行落 failed，审计留一条被拒的越权', async () => {
    const v = await victimNode();
    const { submitted, seen } = await refusedJob(v.nodeId, v.pageId, { op: 'remove', nodeId: v.nodeId });
    // 这不是审批问题：approvals 是空的，没有人会被问"要不要让 QA 删掉它"
    expect(seen.approvals).toEqual([]);
    expect(seen.response?.patches ?? []).toEqual([]);
    expect(seen.response?.error?.code).toBe('permission-denied');
    expect(JSON.stringify(seen.notes)).toContain('没有交回（§73）');
    expect(JSON.stringify(seen.notes)).toContain('QA Agent');

    const row = await taskRow(submitted.taskId);
    expect(row.status).toBe('failed');
    expect(row.requiresApproval).toBe(false);
    // 越权要留证据（§73 后半句）。detail 里得说清是哪一位、缺哪个作用域、扣了几个 op
    const audits = await getDb()
      .select({ action: auditEvents.action, allowed: auditEvents.allowed, detail: auditEvents.detail, targetId: auditEvents.targetId })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'ai.agent.capability'), eq(auditEvents.targetId, submitted.taskId)));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.allowed).toBe(false);
    expect(audits[0]?.detail).toMatchObject({ agentKey: 'qa', missing: 'design.patch', opCount: 1 });
  });

  it('不是删除也一样拒：QA 连"改个名字"都不能交回', async () => {
    const v = await victimNode();
    const { seen } = await refusedJob(v.nodeId, v.pageId, { op: 'set', nodeId: v.nodeId, path: 'name', value: 'QA 起的名字' });
    // 同一个 op 换成 Design Agent 是能交回的（见下一条）——于是这一条的红不是"set 一律不进"
    expect(seen.response?.patches ?? []).toEqual([]);
    expect(seen.response?.error?.code).toBe('permission-denied');
  });

  it('反向对照：同样一份 set 补丁，来自 Design Agent 就照旧交回', async () => {
    const v = await victimNode();
    const submitted = await submit('design', DESIGN);
    nextStatus = scriptedJob({
      jobId: submitted.jobId,
      status: 'completed',
      result: okResponse({ patches: [{ pageId: v.pageId, summary: '换个标题', ops: [{ op: 'set', nodeId: v.nodeId, path: 'name', value: '更醒目' }] }] }),
    });
    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.response?.patches?.[0]?.ops).toHaveLength(1);
    expect(seen?.response?.error).toBeUndefined();
    expect((await taskRow(submitted.taskId)).status).toBe('succeeded');
    // 没越权就不该有那条审计：这一条是上一条的正向对照
    const audits = await getDb().select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.targetId, submitted.taskId));
    expect(audits).toHaveLength(0);
  });

  it('没人被点名、意图恰好叫 research：按名册里那位 Research Agent 的权限处理是错的，照旧只走 §74', async () => {
    // `research` 既是一个意图类别，也是名册里一个 Agent 的 key。门只认账本里"被点名"的那一位，
    // 靠 agentKey 字符串撞上的话，一次没人点名的请求会被换成另一套权限口径
    const v = await victimNode();
    const submitted = await submit('research', UNNAMED);
    nextStatus = scriptedJob({
      jobId: submitted.jobId,
      status: 'completed',
      result: okResponse({ patches: [{ pageId: v.pageId, summary: '删掉这一块', ops: [{ op: 'remove', nodeId: v.nodeId }] }] }),
    });
    const seen = await observeJob(submitted.jobId, ownerId);
    expect(seen?.taskStatus).toBe('awaiting_approval');
    expect(seen?.approvals).toHaveLength(1);
    expect(seen?.agent).toBeNull();
  });

  it('观察报文里的 agent 来自账本：选了 QA 就写着 QA', async () => {
    const v = await victimNode();
    const { seen } = await refusedJob(v.nodeId, v.pageId, { op: 'set', nodeId: v.nodeId, path: 'name', value: 'x' });
    expect(seen.agent).toEqual({ key: 'qa', name: 'QA Agent' });
    expect(AiJobObservationSchema.safeParse(seen).success).toBe(true);
  });
});
