import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import {
  combatGoals,
  compileRpg,
  CODEGEN_LIMITS,
  generateGameCode,
  levelGoals,
  PLAYTEST_DEFAULT_SEED,
  playtestRpg,
  POSITION_STAT_KEYS,
  type GameDocument,
} from '@nexus/game-model';
import type { AgentPlan, RealtimeEvent } from '@nexus/schemas';
import { runReadinessCheck } from '../src/server/agent/runtime';
import { gameDraft } from '../src/lib/agent-game-draft';
import { STALE_RUN_MS, convergeStaleRun, latestPlannedTask } from '../src/server/domain/agent-tasks';
import { countGames } from '../src/server/domain/games';
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
 *
 * §52 那条链的五格在这层各有自己的用例：combat 与 level 拿不到上游草稿时**明说**（不另编一份设计），
 * 拿到了一份但那份**开不了场**（没有玩家）时**一轮没调**、达标条数按那份文档重跑一遍算出来。
 * 后一条的用意是"这一步不许自己给自己打分"：全绿那份的达标条数恰好等于总条数，
 * 于是"把总数当成达标的条数"那种谎在那条用例里是隐形的——只有跑不起来的那份能看见它。
 * level 还多一条只属于它的用例：**除了坐标与时间戳，它交回来的那份必须与 combat 那份逐键相等**，
 * 因为这一格的限度写的正是"数值一个都不动"，而这句话只有拿上一格当分母才测得出来。
 *
 * 第四格（playtest）在这一层钉的是"这份报告跑的是哪一份草稿"：`winnableBy / diedFrom / maxLevel /
 * seed / findings / limits` 全部由测试自己拿**库里那份 level 草稿**再跑一遍 `playtestRpg` 对出来
 * （summary 与 counts 同出一次调用，只比这两处等于自证自成），限度那六句要逐句在原样出现在 notes 里——
 * 少了它们，"0 种通关"就会被读成"这设计没人能通"。它同样**不留草稿、不写库**。
 *
 * 第五格（code）在这一层要钉住的是三件只有真跑一遍才看得到的事：它报的字节数与文件数**由测试自己
 * 重新投影一遍来对**（否则"投影出 8 个文件"这种话在任务行里自证自成）；它**不产草稿**（产了就会出现
 * 第四份可接受的东西，而接受入口的缺省值会变成这一格）；它**不写库**（整条链跑完项目里仍是零份游戏）。
 */

interface Captured {
  channel: string;
  event: RealtimeEvent;
}

let captured: Captured[] = [];
const bus: RealtimeBus = {
  publish: (channel, event) => captured.push({ channel, event }),
  subscribe: () => () => undefined,
  closeChannel: () => undefined,
  subscriberCount: () => 0,
  stats: () => ({ driver: 'in-process', instance: 'test-double', subscriberCount: 0, wireReady: null, wireErrorCount: null }),
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

/**
 * 归一化掉「这一格允许改的东西」：x / y 两个数值键，以及写值时被盖上的时间戳。
 * §52 链第三格（level）自称"只改坐标"，所以比对两份草稿时把坐标与时间戳摘掉，
 * 剩下的必须逐键相等——留着坐标比就测不到它有没有顺手改数值，留着时间戳比就永远不相等。
 */
function withoutPositions(document: GameDocument) {
  return {
    ...document,
    updatedAt: '',
    entities: document.entities.map((entity) => ({
      ...entity,
      updatedAt: '',
      stats: Object.fromEntries(
        Object.entries(entity.stats ?? {}).filter(([key]) => key !== POSITION_STAT_KEYS.x && key !== POSITION_STAT_KEYS.y),
      ),
    })),
  };
}

/** 文档里写了完整一对坐标的实体数：这一格的产物就是这个数，所以它必须由投影自己判，不能靠步骤自己报 */
function authoredPositions(document: GameDocument): number {
  return document.entities.filter((entity) =>
    [POSITION_STAT_KEYS.x, POSITION_STAT_KEYS.y].every((key) => Number.isFinite(entity.stats?.[key])),
  ).length;
}

describe('§112 多步编排的执行方', () => {
  it('九步全绿：计划落库、任务行 succeeded、事件按顺序、一条通知、扣一次点', async () => {
    const projectId = await newProject('编排全绿');
    const result = await runReadinessCheck({ projectId, actorId: owner, goal: '上架前检查一下' });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    expect(result.status).toBe('succeeded');
    expect(result.error).toBeNull();
    expect(result.steps.map((step) => [step.id, step.status])).toEqual([
      ['context', 'done'],
      ['seo-audit', 'done'],
      ['qa-audit', 'done'],
      // `game` 与那三份检查互不依赖，所以它在同一批里跑，且位置在 report 之前（steps 是执行序）
      ['game', 'done'],
      ['report', 'done'],
      // combat（§52 链第二格）依赖 game：与 report 同批就绪，按声明序排在 report 之后
      ['combat', 'done'],
      // level（第三格）依赖 combat：上一批落定后才就绪
      ['level', 'done'],
      // playtest 与 code（第四、五格）只依赖 level，所以是**同一批的两兄弟**，
      // 批内按配方声明序：playtest 写在 code 前面
      ['playtest', 'done'],
      ['code', 'done'],
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
    expect(planned.tasks.map((task) => task.status)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
      'done',
      'done',
      'done',
      'done',
    ]);

    // 刷新后读到的是库里那一份，不是内存里的
    const view = await latestPlannedTask(projectId, owner);
    expect(view?.taskId).toBe(result.taskId);
    expect(view?.status).toBe('succeeded');
    expect(view?.capability).toBe('demo');
    /**
     * 库里那一步的份数钉的是配方的步数，与计划里那份的行数互为对照：
     * 只钉其中一个的话，"计划少一步、结论照着计划数"那种错就没人接住。
     */
    expect((view?.result as { steps?: unknown[] })?.steps).toHaveLength(9);
    expect((view?.result as { steps?: unknown[] })?.steps).toHaveLength(planned.tasks.length);
    /**
     * §52：草稿随这一步落进任务行，所以刷新之后还在——接受入口才有东西可接。
     * 同时这一句是"只读"的另一半：跑一次检查**不**等于往项目里写了一份游戏设计，
     * 落地只能由用户点那一下（`POST /api/projects/<id>/agent/draft`）。
     */
    const gameRow = (view?.result as { steps?: { id: string; draft?: unknown }[] } | null)?.steps?.find(
      (step) => step.id === 'game',
    );
    expect(gameRow?.draft, '草稿没随步骤结论落库，接受入口没有东西可接').toBeTruthy();
    expect((gameRow?.draft as { entities: unknown[] }).entities.length).toBeGreaterThan(0);
    expect(await countGames(projectId), '只读作业把草稿写进了项目').toBe(0);

    /**
     * §52 链第二格：库里那一步也带着一份草稿，而且**不是上游那一份**——
     * 这一句是"调过数值"的唯一库内证据。如果 combat 只是把 game 的东西抄一遍，
     * 这里会红；如果只是没跑，上面那条 steps 顺序早就红了。
     */
    const combatRow = result.steps.find((step) => step.id === 'combat')!;
    expect(combatRow.draft, 'combat 这一步没留下草稿').toBeTruthy();
    expect(JSON.stringify(combatRow.draft)).not.toBe(JSON.stringify(gameRow!.draft));
    // 计数只能是数字（契约挡着），而"达标几条/共几条"这一对要真在计数里，
    // 界面那一句"${goalsMet}/${goalsTotal}"才不是面板自己编的
    expect(Object.values(combatRow.counts).every((value) => typeof value === 'number')).toBe(true);
    const goalsMet = combatRow.counts['goalsMet'];
    const goalsTotal = combatRow.counts['goalsTotal'];
    expect(goalsMet, '计数里该有达标条数').toBeTypeOf('number');
    expect(goalsTotal, '计数里该有目标总条数').toBeTypeOf('number');
    expect(goalsTotal!).toBeGreaterThan(0);
    expect(goalsMet!).toBeGreaterThanOrEqual(0);
    expect(goalsMet!).toBeLessThanOrEqual(goalsTotal!);
    // 调过之后与上游那份不是同一张数值表——这是"这一格真的动了数值"的库内证据
    expect(combatRow.summary).toContain(`${goalsMet}/${goalsTotal}`);
    // **这一步不许自己给自己打分**：那两条读数从库里那份草稿重算一遍。
    // 只比 summary 与 counts 的话，两处都是同一次计算的输出，报什么都是自洽的。
    const recomputed = combatGoals(playtestRpg(compileRpg(combatRow.draft as GameDocument)));
    expect(recomputed.filter((goal) => goal.achieved).length).toBe(goalsMet!);
    expect(recomputed.length).toBe(goalsTotal!);
    expect(combatRow.notes.join('')).toContain('没有真 provider');

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
      // `game` 与那三份检查一批，跑在汇总之前
      'game:started',
      'game:completed',
      'report:started',
      'report:completed',
      'combat:started',
      'combat:completed',
      'level:started',
      'level:completed',
      'playtest:started',
      'playtest:completed',
      'code:started',
      'code:completed',
    ]);
    // 计划一条 + 每步开始/完成各一条。总数从这一步真跑出来的步数数，不把 17 写死：
    // 写死的版本在配方加一步时会红得没有信息量，而这一条要钉的是"每一步都被说了两次"。
    expect(events.filter((event) => event.type === 'agent.activity')).toHaveLength(1 + 2 * result.steps.length);

    // §163 + §112：起点 0、每步一格（已到终态的步数 / 总步数）、收尾 1。
    // 中间那几格不是插值——每一步跑完都真的推一次，所以这里能逐格数出来。
    const progress = events.filter((event) => event.type === 'generation.progress');
    // 每步一格 = 已到终态步数 / 计划步数。步数从计划里数，不把档位写死——
    // 写死 0.2/0.4… 的版本在配方加一步时会假绿（旧档位凑得上的是下界不是这一档）。
    const stepCount = result.steps.length;
    expect(progress.map((event) => event.progress)).toEqual([
      0,
      ...result.steps.map((_, index) => (index + 1) / stepCount),
      1,
    ]);
    expect(progress.every((event) => event.kind === 'agent')).toBe(true);
    // 每一格说的是哪一步：进度条上只有数字的话，用户不知道那四分之一是什么换来的。
    // 标题从库里那一份计划取，不在这里重抄——重抄会把这条断言变成对我抄写的测试。
    // **按执行序**（`result.steps`）而不是计划序：`game` 与那三份检查互不依赖，
    // 声明上排在 report 之后、执行上排在它之前，进度刻度跟的是执行。
    const titleOf = new Map(planned.tasks.map((task) => [task.id, task.title]));
    expect(progress.map((event) => event.message)).toEqual([
      '已提交',
      ...result.steps.map((step, index) => `第 ${index + 1}/${result.steps.length} 步：${titleOf.get(step.id)}`),
      '完成',
    ]);
    // 刻度单调不减：作业跑完后进度条倒回去是最刺眼的一种错
    const ticks = progress.map((event) => event.progress);
    expect(ticks.every((value, index) => index === 0 || value >= ticks[index - 1]!)).toBe(true);

    const [note] = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.dedupeKey, `agent:${result.taskId}`));
    expect(note?.kind).toBe('agent');
    expect(note?.title).toContain('多步 Agent 任务完成');
    expect(note?.title).toContain('DEMO 规划');
    expect(note?.title).toContain(`${stepCount}/${stepCount} 步`);
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
      // qa-audit 炸了，但 `game` 不依赖它，所以照跑且是 done——**失败没有扩散到无关的那一步**，
      // 这正是这一条要证的（依赖它的 report 才是 skipped）
      ['game', 'done'],
      // combat 只依赖 game，所以 qa-audit 炸了它也照跑：失败没有横向扩散的第二处证据
      ['combat', 'done'],
      // level 只依赖 combat，同样照跑
      ['level', 'done'],
      // playtest 只依赖 level，也照跑：失败到 report 为止，链上那四格与它都不沾
      ['playtest', 'done'],
      // code 只依赖 level，也照跑
      ['code', 'done'],
      ['report', 'skipped'],
    ]);
    const skipped = result.steps.find((step) => step.id === 'report')!;
    expect(skipped.because).toEqual(['qa-audit']);
    expect(skipped.summary).toContain('没有跑');
    expect(skipped.error).toBeUndefined();

    const [row] = await getDb().select().from(agentTasks).where(eq(agentTasks.id, result.taskId)).limit(1);
    expect(row?.status).toBe('failed');
    expect(row?.error).toContain('探针');
    const planned = row!.plan as AgentPlan;
    // 这一份是**计划里的顺序**（声明序），与上面 steps 的执行序不同：
    // 计划里 game 排在 report 之后，执行时它和那三份检查一批跑完
    expect(planned.tasks.map((task) => task.status)).toEqual([
      'done',
      'done',
      'failed',
      'skipped',
      'done',
      'done',
      'done',
      'done',
      'done',
    ]);

    const events = projectEvents(projectId);
    const stepTrace = events
      .filter((event) => event.type === 'agent.step')
      .map((event) => `${event.stepId}:${event.status}`);
    // 被跳过的那一步从没开始过，所以一条 agent.step 都不该有它；对照：其余几步都有
    expect(stepTrace).toEqual([
      'context:started',
      'context:completed',
      'seo-audit:started',
      'seo-audit:completed',
      'qa-audit:started',
      'qa-audit:failed',
      // `game` 不依赖 qa-audit，所以它照跑完——失败**没有扩散到无关的那一步**
      'game:started',
      'game:completed',
      // combat 只依赖 game，同样照跑完；只有 report 被牵连跳过
      'combat:started',
      'combat:completed',
      'level:started',
      'level:completed',
      'playtest:started',
      'playtest:completed',
      'code:started',
      'code:completed',
    ]);
    expect(stepTrace.some((line) => line.startsWith('report:'))).toBe(false);
    // 跳过只发一条活动说明，说明"被谁牵连"
    const skipActivity = events.filter(
      (event): event is Extract<RealtimeEvent, { type: 'agent.activity' }> =>
        event.type === 'agent.activity' && event.activity.stage === 'report',
    );
    expect(skipActivity).toHaveLength(1);
    expect(skipActivity[0]!.activity.summary).toContain('qa-audit');

    // §163 × §112：skipped 那一档不推进度——那一步什么都没做，算进分子就是把"没跑"报成"跑完了"。
    // 这里三条刻度对应的正是三个真跑到终态的步（失败也算到终态），第四条是任务行的收尾
    const progress = events.filter((event) => event.type === 'generation.progress');
    const settledTasks = planned.tasks.filter((task) => task.status !== 'skipped');
    // 刻度按"真跑到终态的步数 / 计划步数"，档位从计划里数而不是写死
    expect(progress.map((event) => event.progress)).toEqual([
      0,
      ...settledTasks.map((_, index) => (index + 1) / planned.tasks.length),
      1,
    ]);
    expect(progress.map((event) => event.message)).toEqual([
      '已提交',
      ...settledTasks.map((task, index) => `第 ${index + 1}/${planned.tasks.length} 步：${task.title}`),
      `失败：${row!.error}`,
    ]);
    // 对照：被跳过的那一步的名字，一条进度里都没出现
    const skippedTitle = planned.tasks.find((task) => task.status === 'skipped')!.title;
    expect(progress.some((event) => (event.message ?? '').includes(skippedTitle))).toBe(false);

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

  it('上游那一步没产出草稿：combat 自己是 failed，并且说的是"没拿到草稿"而不是崩在半路', async () => {
    // combat 这一格的底线是**不自己编一份设计**：没有可调的东西就明说，而不是硬凑一份进任务行。
    // 注入的 game runner 返回一份合法但没有 draft 的结论——依赖满足（game 是 done），
    // 所以 combat 真的被调度起来，然后撞在这个守卫上。这条用例证明的是守卫本身，
    // 而不是"上游失败所以它没跑"那种形状（那种形状上面已经有一条了）。
    const projectId = await newProject('编排缺上游草稿');
    const result = await runReadinessCheck({
      projectId,
      actorId: owner,
      goal: '这一步没有草稿可接',
      runners: {
        game: async () => ({ summary: '探针：这一步不产草稿', counts: { entities: 0 }, notes: [] }),
      },
    });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    const combat = result.steps.find((step) => step.id === 'combat')!;
    expect(combat.status).toBe('failed');
    // 话要说清缺的是谁的东西：只写"跑不起来"的话，用户分不清是这一格坏了还是上游坏了
    expect(combat.error).toContain('上游草稿');
    expect(combat.error).toContain('game');
    // 对照：这一格没有留下任何产物——守卫不是"崩之前已经写好了一半"
    expect(combat.draft).toBeUndefined();
    // 三份检查与汇总都不受牵连：这一步失败是这一格自己的事
    expect(result.steps.find((step) => step.id === 'report')?.status).toBe('done');
    // 任务行整体是 failed：产物链断在中间不能报成成功（§159）
    expect(result.status).toBe('failed');
    expect(await countGames(projectId)).toBe(0);
  });

  it('上游那份本身开不了场：一轮没调、0 处改动，达标条数照实说而不是报成总数', async () => {
    // 这一格还有一个更常见的失败：**有草稿，但那份草稿跑不起来**（没有玩家实体）。
    // 这时 tuneCombat 一条数值都不会动，达标条数小于总条数——
    // 这条用例存在的理由就是这个"小于"：如果 fixture 也能凑到 5/5，那"把总数当成达标的条数"
    // 这种谎就没人看得见（上面那条全绿用例里 goalsMet 与 goalsTotal 相等，正测不到它）。
    const projectId = await newProject('编排上游跑不起来');
    const source = gameDraft({ goal: '把玩家那一格拿掉', at: '2020-01-01T00:00:00.000Z', seed: 'task-no-player' });
    const playerless: GameDocument = { ...source, entities: source.entities.filter((entity) => entity.kind !== 'player') };
    const result = await runReadinessCheck({
      projectId,
      actorId: owner,
      goal: '这份设计开不了场',
      runners: {
        game: async () => ({
          summary: '探针：交一份跑不起来的草稿',
          counts: { entities: playerless.entities.length },
          notes: [],
          draft: playerless,
        }),
      },
    });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    const combat = result.steps.find((step) => step.id === 'combat')!;
    // 这一格没崩：把"没调成"说清楚就算完成了——它不该替上游编一个玩家出来
    expect(combat.status).toBe('done');
    const recomputed = combatGoals(playtestRpg(compileRpg(combat.draft as GameDocument)));
    const met = recomputed.filter((goal) => goal.achieved).length;
    expect(met, '这条用例的 fixture 必须真的达不到全部目标，否则它什么也测不到').toBeLessThan(recomputed.length);
    expect(combat.counts.goalsMet).toBe(met);
    expect(combat.counts.goalsTotal).toBe(recomputed.length);
    expect(combat.summary).toContain(`${met}/${recomputed.length}`);
    // 一轮没调要说成一轮没调：写成"调过 7 轮、保留 21 处"就是把没做的事报成做了
    expect(combat.counts.rounds).toBe(0);
    expect(combat.counts.kept).toBe(0);
    // 为什么没调要写在结论里，而且点名的是那份文档的毛病，不是这一格自己的
    expect(combat.notes.join('')).toContain('玩家');
    // 文档原样交回：这一步没偷偷改数值（两份都比的是库里读回来的那一份，键序归一化同一套）
    expect(JSON.stringify(combat.draft)).toBe(JSON.stringify(result.steps.find((step) => step.id === 'game')!.draft));
    expect(await countGames(projectId)).toBe(0);
  });

  it('第三格的守卫：combat 完成了但没留草稿，level 失败并点名"没拿到 combat 的草稿"', async () => {
    // 这一格的底线和上一格同一条：没有要摆的设计就不摆——绝不"照着配方现编一份再来这一步"。
    // 注入的 combat 返回一份**合法但没有 draft** 的结论，所以依赖是满足的（combat 是 done），
    // level 真的被调度起来，然后撞在守卫上。上面那条已经钉过"上游失败所以它没跑"那种形状，
    // 这一条钉的是守卫本身。
    const projectId = await newProject('编排第三格缺上游');
    const result = await runReadinessCheck({
      projectId,
      actorId: owner,
      goal: '这一格没有草稿可摆',
      runners: {
        combat: async () => ({ summary: '探针：这一步不产草稿', counts: { entities: 0 }, notes: [] }),
      },
    });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    const level = result.steps.find((step) => step.id === 'level')!;
    expect(level.status).toBe('failed');
    // 缺的是谁的东西要说清：只写"跑不起来"，用户分不清是这一格坏了还是上游坏了
    expect(level.error).toContain('上游草稿');
    expect(level.error).toContain('combat');
    // 守卫不是"崩之前已经写好了半份"：这一步既没留草稿，也没留下任何自报的读数
    expect(level.draft).toBeUndefined();
    expect(level.counts).toEqual({});
    expect(level.notes).toEqual([]);
    // 链上其余各步不受牵连：game 那份草稿照在，汇总照跑（这一格失败是这一格自己的事）
    expect(result.steps.find((step) => step.id === 'game')?.draft).toBeDefined();
    expect(result.steps.find((step) => step.id === 'report')?.status).toBe('done');
    expect(result.status).toBe('failed');
    expect(await countGames(projectId)).toBe(0);
  });

  it('第三格吃的真是上一格那份：除了坐标与时间戳，两份草稿逐键相等', async () => {
    // 「只改坐标」这句声明只有拿 combat 那份当分母才测得出来：
    // 和最初那份比就看不见数值格与布局格各自动过什么，而这一格的限度写的正是"数值一个都不动"。
    const projectId = await newProject('编排第三格只改坐标');
    const result = await runReadinessCheck({ projectId, actorId: owner, goal: '把位置摆开' });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    const combat = result.steps.find((step) => step.id === 'combat')!;
    const level = result.steps.find((step) => step.id === 'level')!;
    expect(combat.status).toBe('done');
    expect(level.status).toBe('done');
    const combatDoc = combat.draft as GameDocument;
    const levelDoc = level.draft as GameDocument;
    // 摘掉 x/y 与时间戳之后两份必须完全相同：这一格不许顺手改生命、伤害、冷却或引用图
    expect(withoutPositions(levelDoc)).toEqual(withoutPositions(combatDoc));
    expect(levelDoc.entities.length, '实体增减不是这一格的事').toBe(combatDoc.entities.length);
    // 分母也得证明这份草稿原本真没坐标：否则"逐键相等"会因为两边都没坐标而空转
    expect(authoredPositions(combatDoc), '上游那份本来不该有作者写的坐标').toBe(0);
    expect(authoredPositions(levelDoc)).toBe(level.counts.layoutAuthored);
    expect(level.counts.layoutAuthored).toBeGreaterThan(0);
    // 站内说的是"场上几个位置写在文档里"，那个数来自这一步真跑出来的产物，不是配方里的常数
    expect(level.summary).toContain(`${level.counts.layoutAuthored}`);
    expect(await countGames(projectId)).toBe(0);
  });

  it('第三格的达标条数按存进任务行的那份重算：跑不起来时一轮没摆、条数照实说', async () => {
    // 与上一格同一条纪律：这一步不许自己给自己打分。全绿那份的达标条数恰好等于总条数，
    // 于是"把总数当成达标的条数"那种谎在那条用例里隐形——只有跑不起来的那份能看见它。
    const projectId = await newProject('编排第三格上游跑不起来');
    const source = gameDraft({ goal: '把玩家那一格拿掉', at: '2020-01-01T00:00:00.000Z', seed: 'task-level-no-player' });
    const playerless: GameDocument = { ...source, entities: source.entities.filter((entity) => entity.kind !== 'player') };
    const result = await runReadinessCheck({
      projectId,
      actorId: owner,
      goal: '这份设计没有出生点',
      runners: {
        game: async () => ({
          summary: '探针：交一份跑不起来的草稿',
          counts: { entities: playerless.entities.length },
          notes: [],
          draft: playerless,
        }),
      },
    });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    const level = result.steps.find((step) => step.id === 'level')!;
    // 没有玩家就没有出生点，"离敌人多远""脚下压着什么"全部失去意义——但这一格不该崩
    expect(level.status).toBe('done');
    const recomputed = levelGoals(compileRpg(level.draft as GameDocument).base, level.draft as GameDocument);
    const met = recomputed.filter((goal) => goal.achieved).length;
    expect(met, '这条用例的 fixture 必须真的达不到全部布局目标，否则它什么也测不到').toBeLessThan(recomputed.length);
    expect(level.counts.goalsMet).toBe(met);
    expect(level.counts.goalsTotal).toBe(recomputed.length);
    expect(level.summary).toContain(`${met}/${recomputed.length}`);
    // 没摆过要说成没摆过：写成"摆过 3 轮、保留 5 处"就是把没做的事报成做了
    expect(level.counts.rounds).toBe(0);
    expect(level.counts.kept).toBe(0);
    expect(level.counts.authoredMoves).toBe(0);
    expect(level.counts.shiftedMoves).toBe(0);
    expect(authoredPositions(level.draft as GameDocument)).toBe(0);
    // 为什么没摆要写在结论里，点名的是那份文档的毛病，不是这一格自己的
    expect(level.notes.join('')).toContain('玩家');
    // 文档原样交回：这一格没偷偷给谁补一个出生点
    expect(JSON.stringify(level.draft)).toBe(JSON.stringify(result.steps.find((step) => step.id === 'combat')!.draft));
    // 上一格的成绩没被弄坏，也没被冒领：进来的与结束时达标条数相等，且按这份文档重算一遍对得上
    expect(level.counts.combatMetBefore).toBe(level.counts.combatMetAfter);
    expect(level.counts.combatMetAfter).toBe(
      combatGoals(playtestRpg(compileRpg(level.draft as GameDocument))).filter((goal) => goal.achieved).length,
    );
    expect(await countGames(projectId)).toBe(0);
  });

  it('第三格分开报"原样写成坐标"与"真挪了个体"：上游摆过的位置不冒领、不抹掉', async () => {
    // 真链跑出来的是 5 处 author、0 处 shift、场上 5 个带坐标的——三个数两两相等，
    // 于是"把 kept 当成 author 数""把 author 数当成场上带坐标的数""把 shift 印成 author"这三种谎
    // 在那份上都没有可观测后果。这里给上游一份**已经带两个坐标**的草稿：
    // 一个摆在玩家脚下（必须被真挪，shift 才有独证），一个按投影此刻的位置原样写下
    // （这一格不该再动它，于是"场上带坐标的"比"本格动过的"多，kept 与 metric 分得开）。
    const projectId = await newProject('编排第三格分开报数');
    const source = gameDraft({ goal: '把一件东西摆到玩家脚下', at: '2020-01-01T00:00:00.000Z', seed: 'task-level-mixed' });
    const base = compileRpg(source).base;
    expect(base.player, '这份 fixture 要有玩家才有出生点').not.toBeNull();
    const movable = [...base.enemies, ...base.items, ...base.npcs];
    expect(movable.length, '这份 fixture 至少要有两个可摆位置的个体').toBeGreaterThanOrEqual(2);
    const [piled, already] = [movable[0]!, movable[1]!];
    const seeded: GameDocument = {
      ...source,
      entities: source.entities.map((entity) => {
        if (entity.id === piled.id) {
          return { ...entity, stats: { ...entity.stats, [POSITION_STAT_KEYS.x]: base.player!.x, [POSITION_STAT_KEYS.y]: base.player!.y } };
        }
        if (entity.id === already.id) {
          return { ...entity, stats: { ...entity.stats, [POSITION_STAT_KEYS.x]: already.x, [POSITION_STAT_KEYS.y]: already.y } };
        }
        return entity;
      }),
    };
    const result = await runReadinessCheck({
      projectId,
      actorId: owner,
      goal: '把位置摆开',
      runners: {
        game: async () => ({
          summary: '探针：交一份已经摆过两个位置、其中一个压着出生点的草稿',
          counts: { entities: seeded.entities.length },
          notes: [],
          draft: seeded,
        }),
      },
    });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    const level = result.steps.find((step) => step.id === 'level')!;
    expect(level.status).toBe('done');
    // counts 是按名字取的读数表：这里要做算术，所以每一格都取成"必然是数"，
    // 少了哪一格就直接点名，而不是拿 undefined 参加运算
    const count = (key: string): number => {
      const value = level.counts[key];
      if (typeof value !== 'number') throw new Error(`这一步的 counts 里没有 ${key}：${JSON.stringify(level.counts)}`);
      return value;
    };
    // 压着出生点那一个必须被真挪：否则 shift 这一栏永远是 0，这条 fixture 什么也没测到
    expect(count('shiftedMoves'), '压着出生点那一个必须被真挪').toBeGreaterThan(0);
    // 上游摆过的那两个不算本格的 author 数（其中一个还被真挪了），所以 author 严格小于 kept
    expect(count('authoredMoves'), '上游摆过的位置不该被冒领成本格写的').toBeLessThan(count('kept'));
    expect(count('authoredMoves') + count('shiftedMoves')).toBe(count('kept'));
    // 场上带坐标的比本格动过的多：那一个是原样写下来的，这一格既没重算它也没抹掉它
    expect(count('layoutAuthored')).toBeGreaterThan(count('kept'));
    expect(authoredPositions(level.draft as GameDocument)).toBe(count('layoutAuthored'));
    // 界面上那两个数各自读自己的 counts，不是模板里抄了同一个变量
    expect(level.summary).toContain(`${count('authoredMoves')} 处原样写成坐标、${count('shiftedMoves')} 处真挪`);
    expect(await countGames(projectId)).toBe(0);
  });

  it('第五格投影的是链末端那份：读数由测试自己重跑一遍生成器对出来，而且这一格不留草稿', async () => {
    // 这一格的账只有两句"投影出几份文件、多少字节"，而那两个数最容易自证自成：
    // summary 与 counts 同出 `generateGameCode` 的**同一次调用**，报什么都是自洽的。
    // 所以这里把库里那份 level 草稿拿来**再投影一遍**，用另一次调用的结果当分母。
    const projectId = await newProject('编排第五格投影');
    const result = await runReadinessCheck({ projectId, actorId: owner, goal: '把这份设计变成能拿走的东西' });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    const level = result.steps.find((step) => step.id === 'level')!;
    const code = result.steps.find((step) => step.id === 'code')!;
    expect(level.status).toBe('done');
    expect(code.status).toBe('done');
    const projection = generateGameCode(level.draft as GameDocument);
    expect(code.counts.files).toBe(projection.files.length);
    expect(code.counts.bytes).toBe(projection.bytes);
    expect(code.counts.entities).toBe((level.draft as GameDocument).entities.length);
    expect(code.counts.findings).toBe(projection.notes.length);
    expect(code.counts.limits).toBe(CODEGEN_LIMITS.length);
    // 自报的那句话里那两个数与 counts 同源，而界面读的是这句话——对不上就是面板在编
    expect(code.summary).toContain(`${projection.files.length} 份`);
    expect(code.summary).toContain(`${projection.bytes} 字节`);
    // 同一份设计两次投影字节相同：这一格不需要真 provider，也不带时钟
    expect(JSON.stringify(generateGameCode(level.draft as GameDocument).files)).toBe(JSON.stringify(projection.files));
    // 限度是**随产物一起念出来**的那四句，不是这一步自己新写的；少一句界面上就少一句实话
    expect(code.notes.filter((note) => CODEGEN_LIMITS.includes(note))).toHaveLength(CODEGEN_LIMITS.length);
    expect(code.notes.join('')).toContain('没有真 provider');
    expect(code.notes.join('')).toContain('不写库');
    /**
     * 这一格**不产草稿**：它是投影，不是链上又一份"可接受的设计"。
     * 产了就会出现第四份可接的东西，而接受入口的缺省档位（最后一个留草稿的步骤）会悄悄从 level 挪到投影上。
     */
    expect(code.draft, 'code 这一步不该留草稿：接受入口会把缺省档位挪到投影上').toBeUndefined();
    expect(await countGames(projectId), '投影把产物写进了项目').toBe(0);
  });

  it('level 完成了但没留草稿：试玩格与投影格各自失败，点名"没拿到上游草稿"且不带任何读数', async () => {
    // 链上前两格的底线到这里成了**两兄弟各自的**底线：没有可试玩/可投影的设计就明说，
    // 绝不现编一份再跑——现编的那一份与 level 的成果没关系，计划里那两条依赖箭头就成了装饰。
    // 注入的 level 返回一份**合法但没有 draft** 的结论，所以依赖是满足的（level 是 done），
    // playtest 与 code 真的都被调度起来，然后各自撞在自己的守卫上；
    // 上面那条已经钉过"上游失败所以它没跑"那种形状。
    const projectId = await newProject('编排第四五格缺上游');
    const result = await runReadinessCheck({
      projectId,
      actorId: owner,
      goal: '这一格没有东西可试玩、也没东西可投影',
      runners: {
        level: async () => ({ summary: '探针：这一步不产草稿', counts: { entities: 0 }, notes: [] }),
      },
    });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    // 两兄弟都在：少一格的话，"配方里忘了接 playtest"这种改法这里看不见
    const playtest = result.steps.find((step) => step.id === 'playtest')!;
    const code = result.steps.find((step) => step.id === 'code')!;
    expect(playtest.status).toBe('failed');
    expect(code.status).toBe('failed');
    for (const [label, step] of [
      ['playtest', playtest],
      ['code', code],
    ] as const) {
      expect(step.error, `${label} 没说清缺的是谁的东西`).toContain('上游草稿');
      expect(step.error).toContain('level');
      // 守卫不是"崩之前已经跑好了一半"：这两格既没留草稿，也没留下任何自报的读数
      expect(step.draft).toBeUndefined();
      expect(step.counts).toEqual({});
      expect(step.notes).toEqual([]);
    }
    // 一份没跑出来的报告不能带任何读数：`{}` 而不是 `{ won: 0, lost: 0 }`——
    // 后者会把"没跑"印成"四种走法一种都没通"，那是 §53 文件头明令禁止的那种读法
    expect(Object.keys(playtest.counts)).toEqual([]);
    // 链上其余各步不受牵连：combat 那份草稿照在，汇总照跑（这两格失败是它们自己的事）
    expect(result.steps.find((step) => step.id === 'combat')?.draft).toBeDefined();
    expect(result.steps.find((step) => step.id === 'report')?.status).toBe('done');
    expect(result.status).toBe('failed');
    expect(await countGames(projectId)).toBe(0);
  });

  it('第四格的账：试玩报告跑的是库里那份 level 草稿，读数由测试自己再跑一遍对出来', async () => {
    // 与 code 那一格同一条纪律：`summary` 与 `counts` 同出一次 `playtestRpg` 的调用，
    // 只比这两处等于自证自成。这里拿**库里读回来的那份 level 草稿**重新编译、重新跑一遍四种走法，
    // 用另一次调用的结果当分母——对不上就说明这一格跑的不是它声称的那份设计。
    const projectId = await newProject('编排第四格试玩');
    const result = await runReadinessCheck({ projectId, actorId: owner, goal: '看看这份最终形态玩起来怎么样' });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    const level = result.steps.find((step) => step.id === 'level')!;
    const playtest = result.steps.find((step) => step.id === 'playtest')!;
    expect(level.status).toBe('done');
    expect(playtest.status).toBe('done');

    const report = playtestRpg(compileRpg(level.draft as GameDocument));
    const unfinished = report.runs.filter((run) => run.status === 'playing').length;
    expect(playtest.counts.policies).toBe(report.runs.length);
    expect(playtest.counts.won).toBe(report.winnableBy);
    expect(playtest.counts.lost).toBe(report.diedFrom);
    expect(playtest.counts.unfinished).toBe(unfinished);
    expect(playtest.counts.maxLevel).toBe(report.maxLevel);
    expect(playtest.counts.seed).toBe(report.seed);
    expect(playtest.counts.findings).toBe(report.findings.length);
    expect(playtest.counts.limits).toBe(report.limits.length);
    // 走法数是四种，不是"这一份恰好跑了几种"：清单由 `PLAYTEST_POLICIES` 说了算
    expect(report.runs.length).toBe(4);
    // 通没通的那一句在自报的读数里，且与 counts 同源——界面印的是这句话
    expect(playtest.summary).toContain(`${report.winnableBy}/${report.runs.length} 种通关`);
    expect(playtest.summary).toContain(`定种子 ${report.seed}`);

    /**
     * 限度六句**逐句原样**在 notes 里。这一句是本格存在的理由：
     * 少了"0 种通关不等于不可能"那句，页面上一个 `0 种通关` 就会被读成"这设计没人能通"。
     * 用 includes 逐句数而不是数 notes 总长——总数能凑上，句子能被改写。
     */
    expect(playtest.notes.filter((note) => report.limits.includes(note))).toHaveLength(report.limits.length);
    expect(playtest.notes.join('')).toContain('不等于不可能');
    expect(playtest.notes.join('')).toContain('rpgStep');
    expect(playtest.notes.join('')).toContain('没有真 provider');
    // 发现也逐句带上来（不改写、不合并）：那几句里有点名的毛病，折成一句就丢了名字
    expect(playtest.notes.filter((note) => report.findings.includes(note))).toHaveLength(report.findings.length);

    // 种子用的是默认值：这一格要的是可比，换一次抽样仍留在试玩页那一格
    expect(playtest.counts.seed).toBe(PLAYTEST_DEFAULT_SEED);

    /**
     * 这一格**不产草稿**：它一个字都不改设计。产了就会出现第四份可接的东西，
     * 而接受入口的缺省档位（最后一个留草稿的步骤）会悄悄从 level 挪到这份报告上。
     */
    expect(playtest.draft, 'playtest 这一步不该留草稿：接受入口会把缺省档位挪到报告上').toBeUndefined();
    // 缺省档位仍在 level：把这份任务行按"最后一个留草稿的步骤"数一遍，答案必须是 level
    const draftSteps = result.steps.filter((step) => step.draft).map((step) => step.id);
    expect(draftSteps).toEqual(['game', 'combat', 'level']);
    expect(await countGames(projectId), '试玩把报告写进了项目').toBe(0);
  });

  it('第三格炸了：吃它草稿的**两格**都是 skipped 不是 failed，牵连点名的正是 level', async () => {
    // 纯层（`agent-runtime.test.ts`）算得出 `blockedIds`，但**主循环真的**按它把这两格标成 skipped、
    // 一条 `agent.step` 都不发、进度分子少算它们两格——只有打真库才看得见。
    // 形状也不能只看"有没有"：skipped 的 playtest / code 与 failed 的 level 是两种话，混着说就是谎。
    // 这里一次带走两格正是它们那对兄弟关系的结果：两条依赖箭头都指向 level，
    // 而 `because` 各自都只写 level（不写"被 playtest 牵连"——playtest 也没完成，但它不是它们任何一格的依赖）。
    const projectId = await newProject('编排第四五格被牵连');
    const result = await runReadinessCheck({
      projectId,
      actorId: owner,
      goal: '第三格故意炸，看后面两格怎么说',
      runners: {
        level: async () => {
          throw new Error('探针：第三格故意炸了');
        },
      },
    });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('探针：第三格故意炸了');
    for (const id of ['playtest', 'code'] as const) {
      const step = result.steps.find((item) => item.id === id)!;
      expect(step.status).toBe('skipped');
      expect(step.because).toEqual(['level']);
      expect(step.summary).toContain('没有跑');
      expect(step.error, `${id} 自己根本没跑过，说它失败是另一种谎`).toBeUndefined();
      // 没跑过就没有产物、也没有自报的读数：一份 skipped 的试玩报告带着 `{ won: 0 }`
      // 会被读成"跑了，一种都没通"
      expect(step.draft).toBeUndefined();
      expect(step.counts).toEqual({});
    }

    const [row] = await getDb().select().from(agentTasks).where(eq(agentTasks.id, result.taskId)).limit(1);
    const planned = row!.plan as AgentPlan;
    expect(planned.tasks.map((task) => [task.id, task.status])).toEqual([
      ['context', 'done'],
      ['seo-audit', 'done'],
      ['qa-audit', 'done'],
      ['report', 'done'],
      ['game', 'done'],
      ['combat', 'done'],
      ['level', 'failed'],
      ['playtest', 'skipped'],
      ['code', 'skipped'],
    ]);

    const events = projectEvents(projectId);
    const stepTrace = events
      .filter((event) => event.type === 'agent.step')
      .map((event) => `${event.stepId}:${event.status}`);
    // 被牵连的那两步从没开始过，所以一条 agent.step 都不该有它们；
    // 对照：其余七步都发了 started（level 那条后面还跟着 failed，不是只有 started）
    expect(stepTrace.filter((line) => line.startsWith('code:'))).toHaveLength(0);
    expect(stepTrace.filter((line) => line.startsWith('playtest:'))).toHaveLength(0);
    expect(stepTrace.filter((line) => line.endsWith(':started'))).toHaveLength(7);
    expect(stepTrace).toContain('level:failed');

    // 跳过只发一条活动说明，而且说的是被谁牵连——只写"跳过了"用户会以为是我们不想做
    for (const stage of ['playtest', 'code'] as const) {
      const skipActivity = events.filter(
        (event): event is Extract<RealtimeEvent, { type: 'agent.activity' }> =>
          event.type === 'agent.activity' && event.activity.stage === stage,
      );
      expect(skipActivity, `${stage} 那一格被说了不止一次`).toHaveLength(1);
      expect(skipActivity[0]!.activity.summary).toContain('level');
    }

    // §163：skipped 那一档不推进度——分子只有真跑到终态的那七步，分母仍是计划里的九步
    const progress = events.filter((event) => event.type === 'generation.progress');
    const settledTasks = planned.tasks.filter((task) => task.status !== 'skipped');
    expect(settledTasks, '被牵连的那两步不该算进分子').toHaveLength(7);
    expect(progress.map((event) => event.progress)).toEqual([
      0,
      ...settledTasks.map((_, index) => (index + 1) / planned.tasks.length),
      1,
    ]);
    // 对照：被跳过的那两步的名字，一条进度里都没出现
    for (const id of ['playtest', 'code'] as const) {
      const skippedTitle = planned.tasks.find((task) => task.id === id)!.title;
      expect(progress.some((event) => (event.message ?? '').includes(skippedTitle))).toBe(false);
    }

    const [note] = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.dedupeKey, `agent:${result.taskId}`));
    expect(note?.title).toContain('多步 Agent 任务失败');
    expect(note?.title).toContain('1 步失败');
    expect(note?.title).toContain('2 步被跳过');
    // 失败不扣点：链断在末端也一样，产物没交出去就不能收钱
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
