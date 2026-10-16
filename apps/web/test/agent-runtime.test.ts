import { describe, expect, it } from 'vitest';
import { AgentPlanSchema, type AgentPlan } from '@nexus/schemas';
import {
  AgentRunRequestSchema,
  AgentRunViewSchema,
  GOAL_MAX,
  MAX_PLAN_STEPS,
  READINESS_STEPS,
  ReadinessReportSchema,
  STEP_KINDS,
  StepReportSchema,
  blockedIds,
  buildReadinessPlan,
  handoffOf,
  progressOf,
  readyIds,
  stepSpec,
  validatePlan,
  verdictOf,
  withStatus,
} from '../src/lib/agent-runtime';

/**
 * §112 编排的纯规则层。
 *
 * 这一层不碰库也不碰网络，所以这里断言的是"计划本身对不对"：配方里每一步都有真执行方、
 * 依赖顺序能推出下一步、失败会往下传、终态判定不会把 skipped 说成成功。
 * 真库那一半（计划落库、事件顺序、通知与扣点）在 agent-orchestration.integration.test.ts。
 */

/**
 * `scripts/db-seed.mts` 里那三位的名册能力（只抄用到的那几条）。
 * 纯层用它挡住"计划要求了一条名册里根本没有的能力"——那种计划开跑就会被拒，
 * 而拒的理由应该在第 0 毫秒就看得见。真库那一份由集成用例核对。
 */
const SEEDED_CAPABILITIES: Record<string, string[]> = {
  product: ['project.read', 'plan.write'],
  seo: ['code.read', 'content.write'],
  qa: ['browser.read', 'test.run'],
  game: ['game.write'],
};

const planWith = (tasks: AgentPlan['tasks']): AgentPlan => ({ ...buildReadinessPlan('测试'), tasks, dependencies: [] });

describe('计划配方（§25）', () => {
  const plan = buildReadinessPlan('上架前把这些东西都过一遍');

  it('每一种步骤都有真执行方，产物不重复，且每一步要求的能力都在名册里声明过', () => {
    expect(plan.tasks.map((task) => task.id)).toEqual([...STEP_KINDS]);
    for (const task of plan.tasks) {
      const spec = stepSpec(task.id);
      expect(spec, `${task.id} 没有执行方`).not.toBe(null);
      expect(spec!.agentName).toBe(task.agent);
      expect(task.dependsOn).toEqual([...spec!.dependsOn]);
      expect(task.artifact).toBe(spec!.artifact);
      expect(SEEDED_CAPABILITIES[spec!.agentKey], `${spec!.agentKey} 不在这一份镜像里`).toBeDefined();
      expect(SEEDED_CAPABILITIES[spec!.agentKey]).toContain(spec!.requires);
    }
    // 产物名两两不同：交接时要靠它说清"这一步拿的是谁的什么东西"
    const artifacts = READINESS_STEPS.map((spec) => spec.artifact);
    expect(new Set(artifacts).size).toBe(artifacts.length);
  });

  it('通过 §25 契约，并且依赖表与任务里的 dependsOn 是同一份', () => {
    const parsed = AgentPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
    expect(validatePlan(plan)).toEqual([]);
    const flat = plan.tasks.flatMap((task) => task.dependsOn.map((dep) => [dep, task.id]));
    expect(plan.dependencies).toEqual(flat);
  });

  it('三份检查与三份草稿互不依赖，只有汇总和吃上游草稿的那几步吃别人', () => {
    const deps = Object.fromEntries(plan.tasks.map((task) => [task.id, task.dependsOn]));
    // 汇总要三份检查；Combat Design 要 Game Agent 的那份草稿、Level Design 要 Combat 的那份——
    // 后两格都不自己编一份设计。从配方读出来写回去，不是抄一份字面量：
    // 加了步骤时这一条会跟着要新的形状，而不是悄悄放行。
    const fromSpec = Object.fromEntries(READINESS_STEPS.map((spec) => [spec.kind, [...spec.dependsOn]]));
    expect(deps).toEqual(fromSpec);
    expect(deps['combat']).toEqual(['game']);
    expect(deps['level']).toEqual(['combat']);
    // 试玩与投影接的是同一份：链条末端那份（数值调过、位置也摆好了）
    expect(deps['playtest']).toEqual(['level']);
    expect(deps['code']).toEqual(['level']);
    expect(Object.entries(deps).filter(([, list]) => list.length > 0).map(([id]) => id).sort()).toEqual([
      'code',
      'combat',
      'level',
      'playtest',
      'report',
    ]);
    // playtest 与 code 是**兄弟**而不是串起来的：投影不读试玩报告，
    // 所以配方里不能让 code 依赖 playtest——那条箭头没有数据可交接（依赖必须真的用上）。
    expect(deps['code']).not.toContain('playtest');
    expect(deps['playtest']).not.toContain('code');
  });

  it('goal 进计划标题：空白有兜底，超长截到上限', () => {
    expect(buildReadinessPlan('   ').goal).toBe('上架前检查');
    expect(buildReadinessPlan('x'.repeat(GOAL_MAX + 50)).goal).toHaveLength(GOAL_MAX);
  });

  it('风险与验收都写成了能读的句子（§25 要求计划里带这两样）', () => {
    expect(plan.risks.length).toBeGreaterThan(0);
    expect(plan.validation.length).toBeGreaterThan(0);
    expect(plan.constraints.length).toBeGreaterThan(0);
  });
});

describe('开跑之前的自检（validatePlan）', () => {
  const codes = (plan: AgentPlan): string[] => validatePlan(plan).map((problem) => problem.code);

  it('没有执行方的步骤整份拒收：跑到一半才发现没人做更糟', () => {
    const plan = planWith([
      { id: 'context', title: 'x', agent: 'Product Agent', status: 'pending', dependsOn: [] },
      { id: 'teleport', title: '瞬移', agent: 'Nobody', status: 'pending', dependsOn: [] },
    ]);
    expect(codes(plan)).toContain('unknown-step');
  });

  it('重复 id / 缺依赖 / 依赖自己 / 成环 各有各的错', () => {
    expect(codes(planWith([
      { id: 'context', title: 'a', agent: 'Product Agent', status: 'pending', dependsOn: [] },
      { id: 'context', title: 'b', agent: 'Product Agent', status: 'pending', dependsOn: [] },
    ]))).toContain('duplicate-id');

    expect(codes(planWith([{ id: 'report', title: 'r', agent: 'Product Agent', status: 'pending', dependsOn: ['nowhere'] }]))).toContain('missing-dep');
    expect(codes(planWith([{ id: 'report', title: 'r', agent: 'Product Agent', status: 'pending', dependsOn: ['report'] }]))).toContain('self-dep');
    expect(codes(planWith([
      { id: 'context', title: 'a', agent: 'Product Agent', status: 'pending', dependsOn: ['qa-audit'] },
      { id: 'qa-audit', title: 'b', agent: 'QA Agent', status: 'pending', dependsOn: ['context'] },
    ]))).toContain('cycle');
  });

  it('空计划与超长计划都不跑', () => {
    expect(codes(planWith([]))).toContain('empty');
    const many: AgentPlan['tasks'] = Array.from({ length: MAX_PLAN_STEPS + 1 }, (_, i) => ({
      id: 'context',
      title: `第 ${i} 步`,
      agent: 'Product Agent',
      status: 'pending',
      dependsOn: [],
    }));
    expect(codes(planWith(many))).toContain('too-many-steps');
  });
});

describe('就绪与失败传播（§112 的调度）', () => {
  it('先跑三个互不依赖的检查，全部完成了才有汇总；两份草稿也是串起来的', () => {
    let plan = buildReadinessPlan('检查');
    // combat 吃 game 的草稿，所以一开始不能就绪——这一行同时钉住"这一格不自己编一份设计"
    expect(readyIds(plan)).toEqual(['context', 'seo-audit', 'qa-audit', 'game']);
    plan = withStatus(plan, 'context', 'done');
    expect(readyIds(plan)).toEqual(['seo-audit', 'qa-audit', 'game']);
    plan = withStatus(withStatus(plan, 'seo-audit', 'done'), 'qa-audit', 'done');
    expect(readyIds(plan)).toEqual(['report', 'game']);
    plan = withStatus(plan, 'game', 'done');
    expect(readyIds(plan)).toEqual(['report', 'combat']);
    plan = withStatus(withStatus(plan, 'report', 'done'), 'combat', 'done');
    expect(readyIds(plan)).toEqual(['level']);
    // level 落定之后一次就绪两格：试玩与投影都只依赖它，所以是同一批。
    // 批内的顺序跟的是**配方里的声明序**（playtest 写在 code 前面），不是执行完再排——
    // 界面与事件读的都是这个顺序，"顺序稳定才能重跑一次结果一样"说的就是这一行。
    plan = withStatus(plan, 'level', 'done');
    expect(readyIds(plan)).toEqual(['playtest', 'code']);
  });

  it('上游那份草稿没留成：吃它的 combat/level/playtest/code 一格一格被牵连，三份检查照旧各跑各的', () => {
    let plan = buildReadinessPlan('检查');
    plan = withStatus(withStatus(withStatus(withStatus(plan, 'context', 'done'), 'seo-audit', 'done'), 'qa-audit', 'done'), 'game', 'failed');
    // game 自己失败不牵连三份检查（它们互不依赖），只带走吃它草稿的 combat
    expect(blockedIds(plan)).toEqual([{ id: 'combat', because: ['game'] }]);
    expect(readyIds(plan)).toEqual(['report']);
    // combat 被牵连跳过之后，吃 combat 草稿的 level 也跟着被牵连
    plan = withStatus(withStatus(withStatus(plan, 'report', 'done'), 'combat', 'skipped'), 'level', 'skipped');
    // 再往下还有两格：level 没跑成，吃它草稿的 playtest 与 code 都不能装作"我可以凭空跑一份/投影一份"。
    // 两格在同一轮被点名，因为它们是兄弟而不是串起来的——这一行钉的就是那个形状。
    expect(blockedIds(plan)).toEqual([
      { id: 'playtest', because: ['level'] },
      { id: 'code', because: ['level'] },
    ]);
    plan = withStatus(withStatus(plan, 'playtest', 'skipped'), 'code', 'skipped');
    expect(verdictOf(plan)).toEqual({ finished: true, ok: false, reason: '1 步失败，4 步因上游失败被跳过' });
  });

  it('试玩那一格自己炸了：投影不该被它带走（它们只共享 level 那份草稿）', () => {
    // 这一条是上一节的反向对照。`code` 依赖的是 level 而不是 playtest，
    // 所以试玩失败只带走它自己——少了这一条，"把 playtest 也串进链尾"那种改法
    // 在上面的用例里同样是绿的（那里 level 失败会把两格一起带走，分不清谁依赖谁）。
    let plan = buildReadinessPlan('检查');
    for (const id of ['context', 'seo-audit', 'qa-audit', 'report', 'game', 'combat', 'level']) plan = withStatus(plan, id, 'done');
    plan = withStatus(plan, 'playtest', 'failed');
    // playtest 失败没牵连任何人：剩下的 code 依赖的 level 是 done
    expect(blockedIds(plan)).toEqual([]);
    expect(readyIds(plan)).toEqual(['code']);
    plan = withStatus(plan, 'code', 'done');
    expect(verdictOf(plan)).toEqual({ finished: true, ok: false, reason: '1 步失败' });
  });

  it('改状态返回新计划：旧的那一份不动（计划是 jsonb，就地改会让读到的历史跟着变）', () => {
    const before = buildReadinessPlan('检查');
    const after = withStatus(before, 'context', 'done');
    expect(before.tasks.find((task) => task.id === 'context')?.status).toBe('pending');
    expect(after.tasks.find((task) => task.id === 'context')?.status).toBe('done');
    expect(before).not.toBe(after);
  });

  it('上游失败，依赖它的那步是 skipped 并写着被谁牵连（不是 failed：它没跑过）', () => {
    let plan = buildReadinessPlan('检查');
    plan = withStatus(withStatus(withStatus(plan, 'context', 'done'), 'qa-audit', 'done'), 'seo-audit', 'failed');
    expect(blockedIds(plan)).toEqual([{ id: 'report', because: ['seo-audit'] }]);
    expect(readyIds(plan)).toEqual(['game']);

    plan = withStatus(plan, 'report', 'skipped');
    // `game` 与那三份检查互不依赖（上面 readyIds 那一条就是在证这件事），
    // 所以 seo-audit 失败**不会**把它带走——它还是 pending。
    // 这一行原本假设"把 report 标成 skipped 之后全都落定了"，那是四步时代的事；
    // 要断言"全部落定之后的账"，就得把这一步也推到终态，而不是把 pending 改成 0 硬凑。
    // combat（§52 链第二格）依赖 game、不依赖那三份检查，所以它同样落成 done；
    // level（第三格）依赖 combat，跟着落成 done；playtest 与 code（第四、五格）都只依赖 level，也落成 done。
    for (const id of ['game', 'combat', 'level', 'playtest', 'code']) plan = withStatus(plan, id, 'done');
    expect(progressOf(plan)).toEqual({ total: 9, pending: 0, running: 0, done: 7, failed: 1, skipped: 1 });
  });

  it('终态判定：有跳过就不算成功，原因里失败与跳过都要说', () => {
    let plan = buildReadinessPlan('检查');
    expect(verdictOf(plan)).toEqual({ finished: false, ok: false, reason: null });
    for (const id of ['context', 'seo-audit', 'qa-audit', 'report', 'game', 'combat', 'level', 'playtest', 'code']) plan = withStatus(plan, id, 'done');
    expect(verdictOf(plan)).toEqual({ finished: true, ok: true, reason: null });

    // 终态才谈得上"为什么不成"：还有步骤没跑完之前，reason 必须是 null
    const early = withStatus(buildReadinessPlan('检查'), 'qa-audit', 'failed');
    expect(verdictOf(early)).toEqual({ finished: false, ok: false, reason: null });

    // 只有被跳过、没有一步真的失败：跑起来今天到不了这个形状（跳过一定是被失败牵连的），
    // 但"不会把 skipped 说成成功"是这一层的承诺，所以手工造一份来钉住它。
    let onlySkipped = buildReadinessPlan('检查');
    for (const id of ['context', 'seo-audit', 'qa-audit']) onlySkipped = withStatus(onlySkipped, id, 'done');
    // report 与 game 没有真的失败上游却标成 skipped，是手工造的终态；combat 依赖 game，跟着被牵连跳过
    for (const id of ['report', 'game', 'combat', 'level', 'playtest', 'code']) onlySkipped = withStatus(onlySkipped, id, 'skipped');
    expect(verdictOf(onlySkipped)).toEqual({
      finished: true,
      ok: false,
      reason: '6 步因上游失败被跳过',
    });
  });
});

describe('§113 Agent Handoff', () => {
  it('每一步只拿到自己声明依赖的那几份产物', () => {
    const plan = buildReadinessPlan('检查');
    expect(handoffOf(plan, 'report')).toEqual([
      { from: 'context', artifact: 'research_notes' },
      { from: 'seo-audit', artifact: 'seo_notes' },
      { from: 'qa-audit', artifact: 'qa_report' },
    ]);
    expect(handoffOf(plan, 'context')).toEqual([]);
    expect(handoffOf(plan, '不存在的步骤')).toEqual([]);
    // §52 那条链的第二格：它拿的是上一格那份草稿，交接单上只该有这一条
    expect(handoffOf(plan, 'combat')).toEqual([{ from: 'game', artifact: 'game_spec' }]);
    // 最后一格接的是链条末端：交接单上写的是"我从 level 拿 level_layout"，
    // 而不是把整条链的产物都塞过来（那等于没有交接）
    expect(handoffOf(plan, 'code')).toEqual([{ from: 'level', artifact: 'level_layout' }]);
    // 试玩那一格拿的是同一份东西：两兄弟各自的交接单都只有一条，且都指向 level——
    // 交接单上出现的名字就是这一步真能读到的那一份，多一条都没有（那等于没有交接）
    expect(handoffOf(plan, 'playtest')).toEqual([{ from: 'level', artifact: 'level_layout' }]);
  });
});

describe('报文契约', () => {
  it('步骤结论的形状：状态是那五个之一，计数只能是数字', () => {
    const ok = StepReportSchema.safeParse({
      id: 'qa-audit',
      title: '跑发布门禁',
      agent: 'QA Agent',
      agentKey: 'qa',
      status: 'done',
      summary: '门禁通过',
      artifact: 'qa_report',
      counts: { blockers: 0 },
      notes: [],
      durationMs: 12,
    });
    expect(ok.success).toBe(true);
    const good = ok.success ? ok.data : null;
    expect(good).not.toBeNull();
    // 状态只能是那五个之一；计数只能是数字——两样都由契约挡在落库之前
    expect(StepReportSchema.safeParse({ ...good!, status: 'skipped-by-us' }).success).toBe(false);
    expect(StepReportSchema.safeParse({ ...good!, counts: { blockers: '0' } }).success).toBe(false);
  });

  it('界面那一份：没有计划时 plan 是 null（不是编一份空计划）', () => {
    const run = {
      taskId: 't-1',
      projectId: 'p-1',
      projectName: null,
      status: 'running',
      capability: 'demo',
      error: null,
      plan: null,
      steps: [],
      report: null,
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-09-29T00:00:00.000Z',
    };
    expect(AgentRunViewSchema.safeParse(run).success).toBe(true);
    expect(AgentRunViewSchema.safeParse({ ...run, capability: 'maybe' }).success).toBe(false);
  });

  it('汇总结论：待办数必须是数字，上游摘要要带状态', () => {
    expect(ReadinessReportSchema.safeParse({ actionable: 2, notes: ['缺简介'], upstream: [] }).success).toBe(true);
    expect(ReadinessReportSchema.safeParse({ actionable: '2', notes: [], upstream: [] }).success).toBe(false);
    expect(
      ReadinessReportSchema.safeParse({ actionable: 0, notes: [], upstream: [{ id: 'context', status: 'nope', summary: '', artifact: null }] })
        .success,
    ).toBe(false);
  });

  it('启动请求：goal 缺省是空串，超长被拒（它是计划标题，不是提示词）', () => {
    expect(AgentRunRequestSchema.parse({}).goal).toBe('');
    expect(AgentRunRequestSchema.parse({ goal: '  检查  ' }).goal).toBe('检查');
    expect(AgentRunRequestSchema.safeParse({ goal: 'x'.repeat(GOAL_MAX + 1) }).success).toBe(false);
  });
});
