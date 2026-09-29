import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { AgentPlan, RealtimeEvent } from '@nexus/schemas';
import { runReadinessCheck } from '../src/server/agent/runtime';
import { STALE_RUN_MS, convergeStaleRun, latestPlannedTask } from '../src/server/domain/agent-tasks';
import { createProject } from '../src/server/domain/projects';
import { channels, setRealtimeBus, type RealtimeBus } from '../src/server/realtime/bus';
import { getDb } from '../src/server/db/client';
import { agentTasks, agents, creditLedger, notifications, projects, users } from '../src/server/db/schema';

/**
 * §112 多步 Agent 协作的**执行方**打真库。
 *
 * 纯层（`agent-runtime.test.ts`）只能证明"计划本身对"；这一层要证明的是**它真的跑过**：
 * 计划落进 `plan` 列、每一步的事件按顺序推出去、任务行落到 succeeded / failed、
 * 通知按成功或失败说不同的话、扣点只发生在成功那一次。桩数据在这一层骗不过去。
 *
 * 三条纪律照着 §165/§166/§168：每条"没有"都要配一条"换个状态就有"的对照——
 * "报告步没有发 agent.step"要配"另外三步发了"，否则那条断言只是"什么都没建起来"的同义反复。
 */

interface Captured {
  channel: string;
  event: RealtimeEvent;
}

let captured: Captured[] = [];
const bus: RealtimeBus = {
  publish: (channel, event) => captured.push({ channel, event }),
  subscribe: () => () => undefined,
  subscriberCount: () => 0,
};

let owner: string;

beforeEach(() => {
  captured = [];
  setRealtimeBus(bus);
});

beforeAll(async () => {
  const [row] = await getDb()
    .insert(users)
    .values({ displayName: '编排房主', email: `orch+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = row!.id;
});

afterAll(async () => {
  setRealtimeBus(undefined);
  const db = getDb();
  // 项目删掉会级联带走 agent_tasks；通知与积分流水挂在用户上，跟着用户走
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(owner, { name, kind: 'website' })).id;
}

/** 项目频道上的事件，按发生顺序 */
function projectEvents(projectId: string): RealtimeEvent[] {
  return captured.filter((item) => item.channel === channels.project(projectId)).map((item) => item.event);
}

function notificationEvents(): RealtimeEvent[] {
  return captured.filter((item) => item.channel === channels.user(owner)).map((item) => item.event);
}

describe('§112 多步编排的执行方', () => {
  it('四步全绿：计划落库、任务行 succeeded、事件按顺序、一条通知、扣一次点', async () => {
    const projectId = await newProject('编排全绿');
    const result = await runReadinessCheck({ projectId, actorId: owner, goal: '上架前检查一下' });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    expect(result.status).toBe('succeeded');
    expect(result.error).toBeNull();
    expect(result.steps.map((step) => [step.id, step.status])).toEqual([
      ['context', 'done'],
      ['seo-audit', 'done'],
      ['qa-audit', 'done'],
      ['report', 'done'],
    ]);
    // 汇总那一步真的产出了结论（形状由 ReadinessReportSchema 管）
    expect(result.report).not.toBeNull();
    expect(result.report!.upstream.map((item) => item.id)).toEqual(['context', 'seo-audit', 'qa-audit']);

    const [row] = await getDb().select().from(agentTasks).where(eq(agentTasks.id, result.taskId)).limit(1);
    expect(row?.status).toBe('succeeded');
    // §160：计划由确定性配方生成 → capability 如实记 demo
    expect(row?.capability).toBe('demo');
    expect(row?.error).toBeNull();
    expect(row?.finishedAt).not.toBeNull();
    const planned = row!.plan as AgentPlan;
    expect(planned.tasks.map((task) => task.status)).toEqual(['done', 'done', 'done', 'done']);

    // 刷新后读到的是库里那一份，不是内存里的
    const view = await latestPlannedTask(projectId, owner);
    expect(view?.taskId).toBe(result.taskId);
    expect(view?.status).toBe('succeeded');
    expect(view?.capability).toBe('demo');
    expect((view?.result as { steps?: unknown[] })?.steps).toHaveLength(4);

    const events = projectEvents(projectId);
    // 计划事件只有一条，而且排在第一步开始之前（库里是权威，事件只是加速器）
    const planIndex = events.findIndex((event) => event.type === 'agent.plan');
    const firstStepIndex = events.findIndex((event) => event.type === 'agent.step');
    expect(planIndex).toBeGreaterThanOrEqual(0);
    expect(planIndex).toBeLessThan(firstStepIndex);
    expect(events.filter((event) => event.type === 'agent.plan')).toHaveLength(1);

    const stepTrace = events
      .filter((event) => event.type === 'agent.step')
      .map((event) => `${event.stepId}:${event.status}`);
    expect(stepTrace).toEqual([
      'context:started',
      'context:completed',
      'seo-audit:started',
      'seo-audit:completed',
      'qa-audit:started',
      'qa-audit:completed',
      'report:started',
      'report:completed',
    ]);
    // 计划一条 + 每步开始/完成各一条
    expect(events.filter((event) => event.type === 'agent.activity')).toHaveLength(9);

    // §163 的真实起点与收尾：只有 0 与 1 两个真信号，不编中间刻度
    const progress = events.filter((event) => event.type === 'generation.progress');
    expect(progress.map((event) => event.progress)).toEqual([0, 1]);
    expect(progress.every((event) => event.kind === 'agent')).toBe(true);

    const [note] = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.dedupeKey, `agent:${result.taskId}`));
    expect(note?.kind).toBe('agent');
    expect(note?.title).toContain('多步 Agent 任务完成');
    expect(note?.title).toContain('DEMO 规划');
    expect(note?.title).toContain('4/4 步');
    const pushed = notificationEvents().filter((event) => event.type === 'notification');
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.level).toBe('success');

    const ledger = await getDb().select().from(creditLedger).where(eq(creditLedger.taskId, result.taskId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.delta).toBeLessThan(0);
  });

  it('一步失败：依赖它的步是 skipped 不是 failed、任务行 failed、通知按 error 说、不扣点', async () => {
    const projectId = await newProject('编排失败传播');
    const result = await runReadinessCheck({
      projectId,
      actorId: owner,
      goal: '这次门禁会炸',
      // 注入点只给测试用（§159：没跑过的不算做完，所以这条链路必须真跑一遍）
      runners: {
        'qa-audit': async () => {
          throw new Error('探针：门禁故意炸了');
        },
      },
    });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('探针：门禁故意炸了');
    expect(result.report).toBeNull();
    expect(result.steps.map((step) => [step.id, step.status])).toEqual([
      ['context', 'done'],
      ['seo-audit', 'done'],
      ['qa-audit', 'failed'],
      ['report', 'skipped'],
    ]);
    const skipped = result.steps.find((step) => step.id === 'report')!;
    expect(skipped.because).toEqual(['qa-audit']);
    expect(skipped.summary).toContain('没有跑');
    expect(skipped.error).toBeUndefined();

    const [row] = await getDb().select().from(agentTasks).where(eq(agentTasks.id, result.taskId)).limit(1);
    expect(row?.status).toBe('failed');
    expect(row?.error).toContain('探针');
    expect((row!.plan as AgentPlan).tasks.map((task) => task.status)).toEqual(['done', 'done', 'failed', 'skipped']);

    const events = projectEvents(projectId);
    const stepTrace = events
      .filter((event) => event.type === 'agent.step')
      .map((event) => `${event.stepId}:${event.status}`);
    // 被跳过的那一步从没开始过，所以一条 agent.step 都不该有它；对照：另外三步都有
    expect(stepTrace).toEqual([
      'context:started',
      'context:completed',
      'seo-audit:started',
      'seo-audit:completed',
      'qa-audit:started',
      'qa-audit:failed',
    ]);
    expect(stepTrace.some((line) => line.startsWith('report:'))).toBe(false);
    // 跳过只发一条活动说明，说明"被谁牵连"
    const skipActivity = events.filter(
      (event): event is Extract<RealtimeEvent, { type: 'agent.activity' }> =>
        event.type === 'agent.activity' && event.activity.stage === 'report',
    );
    expect(skipActivity).toHaveLength(1);
    expect(skipActivity[0]!.activity.summary).toContain('qa-audit');

    const [note] = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.dedupeKey, `agent:${result.taskId}`));
    expect(note?.title).toContain('多步 Agent 任务失败');
    expect(note?.title).toContain('1 步失败');
    expect(note?.title).toContain('1 步被跳过');
    expect(note?.body).toContain('探针');
    const pushed = notificationEvents().filter((event) => event.type === 'notification');
    expect(pushed).toHaveLength(1);
    // 失败要说成 error，不能和成功一样是绿的
    expect(pushed[0]!.level).toBe('error');

    const ledger = await getDb().select().from(creditLedger).where(eq(creditLedger.taskId, result.taskId));
    expect(ledger).toHaveLength(0);
  });

  it('项目读不到就整份拒收（404），账本里不留行', async () => {
    const ghost = crypto.randomUUID();
    const result = await runReadinessCheck({ projectId: ghost, actorId: owner, goal: '读不到的项目' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe('no-document');
    expect(result.refusal.status).toBe(404);
    const rows = await getDb().select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.projectId, ghost));
    expect(rows).toHaveLength(0);
  });

  it('名册里缺一个 Agent：整份拒收并说清缺谁，账本里同样不留行', async () => {
    const projectId = await newProject('编排缺能力');
    const db = getDb();
    // §73：能力由名册说了算。把 seo 那一行停用，等于"这一步没有人做"——
    // 窗口要短，收尾一定要还原，否则别的用例会看见一份缺人的名册
    await db.update(agents).set({ enabled: false }).where(eq(agents.key, 'seo'));
    try {
      const result = await runReadinessCheck({ projectId, actorId: owner, goal: '名册缺人' });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('名册里缺人，这一步却跑起来了');
      expect(result.refusal.code).toBe('capability');
      expect(result.refusal.message).toContain('seo');
      const rows = await db.select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.projectId, projectId));
      expect(rows).toHaveLength(0);
    } finally {
      await db.update(agents).set({ enabled: true }).where(eq(agents.key, 'seo'));
    }
    // 自检：名册恢复成原样，后面的用例与别的文件才不会被这条用例的现场影响
    const restored = await db.select({ key: agents.key }).from(agents).where(eq(agents.enabled, true));
    expect(restored.length).toBeGreaterThanOrEqual(13);
  });

  it('断在半路的 running 行读的时候收敛成 failed；没到期 / 有作业号的都不动', async () => {
    const projectId = await newProject('编排收敛');
    const db = getDb();
    const staleAt = new Date(Date.now() - STALE_RUN_MS - 60_000);
    const base = {
      projectId,
      agentKey: 'product',
      status: 'running' as const,
      capability: 'demo' as const,
      createdById: owner,
      plan: { goal: '收敛探针' } as never,
      input: {} as never,
    };

    const [old] = await db
      .insert(agentTasks)
      .values({ ...base, startedAt: staleAt })
      .returning({ id: agentTasks.id });
    expect(await convergeStaleRun(old!.id)).toBe(true);
    const [afterOld] = await db.select().from(agentTasks).where(eq(agentTasks.id, old!.id)).limit(1);
    expect(afterOld?.status).toBe('failed');
    expect(afterOld?.error).toContain('没有跑完');
    expect(afterOld?.finishedAt).not.toBeNull();
    // 收敛是失败终态，所以不扣点
    expect(await db.select().from(creditLedger).where(eq(creditLedger.taskId, old!.id))).toHaveLength(0);

    const [fresh] = await db
      .insert(agentTasks)
      .values({ ...base, startedAt: new Date() })
      .returning({ id: agentTasks.id });
    expect(await convergeStaleRun(fresh!.id)).toBe(false);
    const [afterFresh] = await db.select().from(agentTasks).where(eq(agentTasks.id, fresh!.id)).limit(1);
    expect(afterFresh?.status).toBe('running');

    const [withJob] = await db
      .insert(agentTasks)
      .values({ ...base, startedAt: staleAt, providerJobId: 'job_probe' })
      .returning({ id: agentTasks.id });
    expect(await convergeStaleRun(withJob!.id)).toBe(false);
    const [afterJob] = await db.select().from(agentTasks).where(eq(agentTasks.id, withJob!.id)).limit(1);
    expect(afterJob?.status).toBe('running');

    // 三条探针行都在同一个项目里，清理跟着项目走
    const ids = await db
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .where(inArray(agentTasks.id, [old!.id, fresh!.id, withJob!.id]));
    expect(ids).toHaveLength(3);
  });
});
