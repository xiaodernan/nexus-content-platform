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
};

const planWith = (tasks: AgentPlan['tasks']): AgentPlan => ({ ...buildReadinessPlan('测试'), tasks, dependencies: [] });

describe('计划配方（§25）', () => {
  const plan = buildReadinessPlan('上架前把这些东西都过一遍');

  it('四步都有真执行方，产物不重复，且每一步要求的能力都在名册里声明过', () => {
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

  it('只有汇总那一步依赖别人：三份检查各自独立，才能各查各的', () => {
    const deps = Object.fromEntries(plan.tasks.map((task) => [task.id, task.dependsOn]));
    expect(deps).toEqual({ context: [], 'seo-audit': [], 'qa-audit': [], report: ['context', 'seo-audit', 'qa-audit'] });
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
  it('先跑三个互不依赖的检查，全部完成了才有汇总', () => {
    let plan = buildReadinessPlan('检查');
    expect(readyIds(plan)).toEqual(['context', 'seo-audit', 'qa-audit']);
    plan = withStatus(plan, 'context', 'done');
    expect(readyIds(plan)).toEqual(['seo-audit', 'qa-audit']);
    plan = withStatus(withStatus(plan, 'seo-audit', 'done'), 'qa-audit', 'done');
    expect(readyIds(plan)).toEqual(['report']);
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
    expect(readyIds(plan)).toEqual([]);

    plan = withStatus(plan, 'report', 'skipped');
    expect(progressOf(plan)).toEqual({ total: 4, pending: 0, running: 0, done: 2, failed: 1, skipped: 1 });
  });

  it('终态判定：有跳过就不算成功，原因里失败与跳过都要说', () => {
    let plan = buildReadinessPlan('检查');
    expect(verdictOf(plan)).toEqual({ finished: false, ok: false, reason: null });
    for (const id of ['context', 'seo-audit', 'qa-audit', 'report']) plan = withStatus(plan, id, 'done');
    expect(verdictOf(plan)).toEqual({ finished: true, ok: true, reason: null });

    // 终态才谈得上"为什么不成"：还有步骤没跑完之前，reason 必须是 null
    const early = withStatus(buildReadinessPlan('检查'), 'qa-audit', 'failed');
    expect(verdictOf(early)).toEqual({ finished: false, ok: false, reason: null });

    // 跑到终态、有失败也有被牵连的跳过 → 两件事都要说
    const failed = withStatus(
      withStatus(withStatus(withStatus(buildReadinessPlan('检查'), 'context', 'done'), 'seo-audit', 'done'),
        'qa-audit',
        'failed',
      ),
      'report',
      'skipped',
    );
    expect(verdictOf(failed)).toEqual({
      finished: true,
      ok: false,
      reason: '1 步失败，1 步因上游失败被跳过',
    });

    // 只有被跳过、没有一步真的失败：跑起来今天到不了这个形状（跳过一定是被失败牵连的），
    // 但"不会把 skipped 说成成功"是这一层的承诺，所以手工造一份来钉住它。
    const onlySkipped = withStatus(
      withStatus(withStatus(withStatus(buildReadinessPlan('检查'), 'context', 'done'), 'seo-audit', 'done'),
        'qa-audit',
        'done',
      ),
      'report',
      'skipped',
    );
    expect(verdictOf(onlySkipped)).toEqual({
      finished: true,
      ok: false,
      reason: '1 步因上游失败被跳过',
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
