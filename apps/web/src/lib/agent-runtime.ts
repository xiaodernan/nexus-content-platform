import { z } from 'zod';
import { AgentPlanSchema, GameDocumentSchema, type AgentPlan } from '@nexus/schemas';

/**
 * §112 / §25 / §113 编排的**纯规则层**：一个计划能不能跑、下一步该轮到谁、某一步失败之后
 * 谁被牵连、相邻两步之间交接什么。这里不碰库、不碰网络，所以每一条判断都能被逐条钉住——
 * 与 §164 的 `notify-plan.ts`、§168 的 `visit-meter.ts` 同一层。
 *
 * 四条纪律，全都是"不说谎"那一类：
 *
 * 1. **没有执行方的步骤不许进计划**。`STEP_KINDS` 里每一种都必须在执行器注册表里有一条真实现
 *    （`server/agent/runtime.ts`）。"计划里有、跑的时候跳过"就是 §159 禁止的那种空话，
 *    所以计划在**开跑之前**按注册表校验（`validatePlan`），未知步骤整份拒收，
 *    而不是跑到一半才发现没人做。
 *    注册表那侧是 `Record<StepKind, Runner>`：**"加一个种类忘了加执行方"是编译错误**，
 *    不靠这里的校验兜——校验只在运行时兜住"计划被人手改过"那种情况。
 * 2. **失败要往下传，不能装作还能跑**。依赖里有失败/跳过，这一步是 `skipped` 并带上被谁牵连——
 *    不是 `failed`：它自己根本没跑过，说它失败是另一种谎。
 *    反过来说：**一条有依赖的步骤必须真的用上那个依赖**。§52 那条链后两格（combat / level）
 *    拿的是上一步留在结论里的草稿，拿不到就整步失败，绝不自己编一份"差不多的"设计来改——
 *    那样这一步跑出来的数值与上一步就没关系了，计划里的依赖箭头成了一句装饰。
 * 3. **状态只有一个真值**。每一步的 `status` 只由这里改，界面与实时事件都读它；
 *    不存在"事件里说完成、计划里还写着 pending"的第二份状态。
 * 4. **计划是给用户看的**（§25）：标题写的是这件事做什么，不是内部函数名。
 */

export type PlanTask = AgentPlan['tasks'][number];

/** 今天真的有执行方的步骤种类。加一种就必须同时加一个真执行方，否则 UI 会列出跑不了的步骤 */
export const STEP_KINDS = ['context', 'seo-audit', 'qa-audit', 'report', 'game', 'combat', 'level', 'playtest', 'code'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export interface StepSpec {
  kind: StepKind;
  /** 名册里的 key；执行前会用它核对名册声明的能力（§73 的口径：能力由名册说了算） */
  agentKey: string;
  /** 名册里的显示名。写进计划里给用户看，不许临时编一个 */
  agentName: string;
  title: string;
  /** 这一步要求执行方声明过的能力。名册里没有这条 = 这一步不能跑 */
  requires: string;
  artifact: string;
  dependsOn: StepKind[];
}

/**
 * 「上架前检查」这份配方。它是**确定性规则**，不是模型规划出来的——
 * 所以整条作业的 capability 记 `demo`（§160），界面上带 DEMO 标识，
 * 而每一步真正算出来的东西（结构、门禁、覆盖面）是真读数，不是编的。
 *
 * 九种步骤各自的真实执行方：结构盘点读本项目自己的库；SEO 检查读项目元信息与设计正文；
 * 门禁就是发布时用的同一个 `analyzeHealth`（§179 那一份，不另算一套分）；汇总是前三者的产物；
 * Game Agent 那一步给的是 §52 的**确定性草稿**（`agent-game-draft.ts` 那张表），
 * 紧跟其后的 combat 那一步（§52 链的第二格）拿上一步的草稿跑 `tuneCombat`，产出**调过数值的那一份草稿**；
 * 再后面的 level 那一步（§52 链的第三格）拿 combat 的草稿跑 `designLevel`，产出**位置已写成设计值的那一份草稿**；
 * playtest（第四格）拿 level 那份草稿跑 §53 的 `playtestRpg`——四种固定走法、定种子，
 * 报的是"几种通关、几种中途倒下、几种跑到时间上限"，**它不改设计也不产草稿**（所以接受入口仍是三个按钮）；
 * 最后一格 code 拿 level 那份草稿跑 `generateGameCode`，产出的**不是草稿而是投影**：
 * 它只把"这份设计投影出来是几份文件、多少字节、哪几条限度"报进这一步的结论里，
 * 既不落库也不在这里下载（下载走游戏面板那一格，那里吃的是库里那一份设计）。
 * 前三份草稿都随步骤结论存在任务行里，**都不写进项目**——要进项目得由用户点「接受」那一下（见 ADR-0035）。
 */
export const READINESS_STEPS: readonly StepSpec[] = [
  {
    kind: 'context',
    agentKey: 'product',
    agentName: 'Product Agent',
    title: '盘点项目现状：页面 / 节点 / 语料 / 发布版本',
    requires: 'project.read',
    artifact: 'research_notes',
    dependsOn: [],
  },
  {
    kind: 'seo-audit',
    agentKey: 'seo',
    agentName: 'SEO Agent',
    title: '检查上架要用的元信息：标题 / 简介 / 可索引的正文',
    requires: 'code.read',
    artifact: 'seo_notes',
    dependsOn: [],
  },
  {
    kind: 'qa-audit',
    agentKey: 'qa',
    agentName: 'QA Agent',
    title: '跑发布门禁：结构 / 对比度 / 点击目标 / 性能',
    requires: 'test.run',
    artifact: 'qa_report',
    dependsOn: [],
  },
  {
    kind: 'report',
    agentKey: 'product',
    agentName: 'Product Agent',
    title: '汇总成一份结论与待办',
    requires: 'plan.write',
    artifact: 'agent_plan',
    dependsOn: ['context', 'seo-audit', 'qa-audit'],
  },
  {
    kind: 'game',
    agentKey: 'game',
    agentName: 'Game Agent',
    title: '编一份 RPG 原型草稿：确定性配方，存在这一步里（不写进项目）',
    requires: 'game.write',
    artifact: 'game_spec',
    dependsOn: [],
  },
  {
    // §52 那条链的第二格：吃上一步的草稿，产出**另一份草稿**（调过数值的那一份）。
    // 依赖必须有：没有草稿就没有可调的设计，而这一格不自己编一份草稿。
    kind: 'combat',
    agentKey: 'game',
    agentName: 'Game Agent',
    title: '把草稿的战斗数值调进目标带：写死的规则与阈值，产物仍是草稿',
    requires: 'game.write',
    artifact: 'combat_spec',
    dependsOn: ['game'],
  },
  {
    // §52 那条链的第三格：吃第二格那份**调过数值的**草稿，把布局写成文档里的坐标。
    // 依赖写 combat 而不是 game：这一格要改的是"数值已经落进目标带"的那一份位置，
    // 接错了源头就等于把中间一格的成果丢掉——所以拿不到 combat 的草稿时这一步直接失败。
    kind: 'level',
    agentKey: 'game',
    agentName: 'Game Agent',
    title: '把草稿的位置写成设计值并按四条几何目标摆开：只改坐标，产物仍是草稿',
    requires: 'game.write',
    artifact: 'level_layout',
    dependsOn: ['combat'],
  },
  {
    // §52 链的第四格（§53 的那四种走法接到这里）：吃 level 那份**数值调过、位置也摆好了**的草稿，
    // 用四种固定走法各跑一遍，只把读数报进这一步的结论。
    // 为什么交给 QA Agent 而不是 Game Agent：这一格不产设计、不改设计，它做的是"跑一遍看结果"，
    // 名册里 QA 声明的能力就是 `test.run`（§73：能力由名册说了算，所以这一步要的能力必须是名册里真有的那一条）。
    // 依赖写 level：试玩要说的是"链条末端那份玩起来怎么样"，拿第一格那份原始草稿跑出来的数
    // 与上面 game 那一步就重复了，而重复的是一份**已经不是最终形态**的设计。
    kind: 'playtest',
    agentKey: 'qa',
    agentName: 'QA Agent',
    title: '把链条末端那份草稿用四种固定走法各跑一遍：只报能不能通关与在哪倒下，不改设计、不产草稿',
    requires: 'test.run',
    artifact: 'playtest_report',
    dependsOn: ['level'],
  },
  {
    // §52 那条链的最后一格：吃 level 那份摆过位置的草稿，把它投影成一份拿得走的产物。
    // 这一格的产物**不是草稿**（它不改设计，只是同一份设计的另一个样子），所以它不留 `draft`：
    // 接受入口因此仍然只有三个按钮，缺省那一份仍是链条末端那份草稿。
    // 依赖写 level 而不是 game：投影的要害是"位置与数值都落定了之后这份产物长什么样"。
    // 它与 playtest 是**同一批就绪的兄弟**（都只依赖 level），不是串在一起的：
    // 投影不读试玩报告，所以试玩这一步失败不该把这份产物也带走——那条依赖箭头没有数据可交接。
    kind: 'code',
    agentKey: 'game',
    agentName: 'Game Agent',
    title: '把摆过位置的草稿投影成一份自包含产物：只报几份文件与多少字节，产物不落库',
    requires: 'game.write',
    artifact: 'game_code',
    dependsOn: ['level'],
  },
];

/** 名册里 max_steps 最大是 24（Coding Agent）；一份计划超过它就该拆成多次作业而不是硬塞 */
export const MAX_PLAN_STEPS = 24;

/** 目标最长 200 字：它是计划里的一句话标题，不是提示词本体（提示词在 provider 那侧装配） */
export const GOAL_MAX = 200;

/**
 * 步骤状态。与 `AgentPlanSchema` 里那个 enum 是同一组取值：计划是跨端合同（`packages/schemas`），
 * 这里把它写出来是给界面侧的报文校验用；两边一旦不一致，`withStatus` 那里过不了类型检查。
 */
export const STEP_STATUSES = ['pending', 'running', 'done', 'failed', 'skipped'] as const;
export const StepStatusSchema = z.enum(STEP_STATUSES);
export type StepStatus = z.infer<typeof StepStatusSchema>;

/**
 * 一步跑完留下的东西（§26 / §113）。形状定在这里而不是散在服务端：界面读回来的是同一份，
 * 两边各写一遍就会漂。`counts` 是给面板直接印的读数（几页、几项不达标），`notes` 是要动手的发现。
 */
export const StepReportSchema = z.object({
  id: z.string(),
  title: z.string(),
  agent: z.string(),
  agentKey: z.string(),
  status: StepStatusSchema,
  summary: z.string(),
  artifact: z.string().nullable(),
  counts: z.record(z.string(), z.number()),
  notes: z.array(z.string()),
  durationMs: z.number(),
  /** 被牵连而跳过时：被哪几步牵连 */
  because: z.array(z.string()).optional(),
  /** 失败的那一步：这句话就是原因 */
  error: z.string().optional(),
  /** §113 交接：这一步拿了谁的东西 */
  handedOff: z.array(z.object({ from: z.string(), artifact: z.string().nullable() })).optional(),
  /**
   * §52 那一步的**产物本身**：一份还没写进项目的游戏草稿。
   *
   * 为什么要进报文而不是只留在内存：这一片的主张是"跑完留下的账对不对"（§112），
   * 而草稿是这一步唯一说得出的账。它随 `result.steps` 存进任务行，
   * 于是刷新之后还在、别的实例也读得到，接受入口才有东西可接。
   * 形状直接用 `GameDocumentSchema`（同一份 zod 定义，跨端不重写一遍）。
   */
  draft: GameDocumentSchema.optional(),
});
export type StepReport = z.infer<typeof StepReportSchema>;

/** 汇总那一步的结论：作业的终态结论就是它（待办清单 + 上游摘要） */
export const ReadinessReportSchema = z.object({
  actionable: z.number(),
  notes: z.array(z.string()),
  upstream: z.array(
    z.object({ id: z.string(), status: StepStatusSchema, summary: z.string(), artifact: z.string().nullable() }),
  ),
});
export type ReadinessReport = z.infer<typeof ReadinessReportSchema>;

/** 启动一次编排的请求。今天只有一个目标字符串，其余由服务端按配方决定 */
export const AgentRunRequestSchema = z.object({ goal: z.string().trim().max(GOAL_MAX).default('') });
export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;

/**
 * 界面看到的那一份（GET 与 POST 返回同一个形状）。
 *
 * 为什么 POST 也走这个形状：跑完之后的权威状态**在库里的那一行**，不在响应体里。
 * 两个入口读同一条路径（`latestPlannedTask`），"刷新之后看到的东西与提交时返回的不同"这件事
 * 就结构性地不可能发生。
 */
export const AgentRunViewSchema = z.object({
  taskId: z.string(),
  projectId: z.string(),
  projectName: z.string().nullable(),
  status: z.string(),
  capability: z.enum(['real', 'demo', 'unavailable']).nullable(),
  error: z.string().nullable(),
  /** §25 的计划；null = 这一行没有计划（读回来照实说，不编一份） */
  plan: AgentPlanSchema.nullable(),
  /** 终态里那几步的结论；还在跑就是空数组 */
  steps: z.array(StepReportSchema),
  report: ReadinessReportSchema.nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AgentRunView = z.infer<typeof AgentRunViewSchema>;

/** 两个入口（GET / POST）共用的响应信封。客户端拿这一份校验，不合契约就不往界面上画 */
export const AgentRunResponseSchema = z.object({ ok: z.literal(true), run: AgentRunViewSchema.nullable() });
export type AgentRunResponse = z.infer<typeof AgentRunResponseSchema>;

/**
 * §52 接受入口的请求体：**只有任务 id，最多加一个步骤 id**。
 *
 * 为什么草稿不在体里：那等于让客户端把任意一份游戏文档贴进来写进项目，而这一片的卖点恰恰是
 * "接受的是这一步真跑出来的那一份"。草稿从任务行读出来（`plannedTask` → `steps[].draft`），
 * 归属、项目、有没有这一步都由服务端判。
 *
 * 为什么要 `stepId`：§52 那条链现在有三步会留草稿（game 的原始草稿、combat 调过数值的那一份、
 * level 把位置写成设计值的那一份），界面必须说得清用户接的是哪一步。缺省不传 =
 * **取这份任务里最后一份留了草稿的步骤**，那是链条的末端产物（数值调过、位置也摆好了的那一份），
 * 与"用户看到面板最下面那份就点它"读到的东西一致。
 * 传了就必须是这一步真跑过并留下草稿，否则拒收——不猜、不退回别的步骤去拿一份"差不多的"。
 */
export const AgentDraftAcceptRequestSchema = z.object({
  taskId: z.string().min(1).max(128),
  /** 想接受哪一步留下的草稿；缺省取最后一个留草稿的步骤。上限与步骤 id 的来源（STEP_KINDS）同宽 */
  stepId: z.string().min(1).max(64).optional(),
});
export type AgentDraftAcceptRequest = z.infer<typeof AgentDraftAcceptRequestSchema>;

/** 接受成功后的响应：写进库的那一份原样带回去（id 是库里的行 id，不是草稿自带的临时值） */
export const AgentDraftAcceptResponseSchema = z.object({ ok: z.literal(true), document: GameDocumentSchema });
export type AgentDraftAcceptResponse = z.infer<typeof AgentDraftAcceptResponseSchema>;

export function stepSpec(kind: string): StepSpec | null {
  return READINESS_STEPS.find((spec) => spec.kind === kind) ?? null;
}

/** §25：复杂任务先生成计划。今天这份计划的形状由配方定，goal 只改标题那一句 */
export function buildReadinessPlan(goal: string): AgentPlan {
  const text = goal.trim().slice(0, GOAL_MAX);
  return {
    goal: text || '上架前检查',
    constraints: [
      '只读：这一轮不改设计模型、不发布、不花额度以外的东西',
      '每一步的结论都必须来自本机真的算得出来的东西（§159）',
    ],
    tasks: READINESS_STEPS.map((spec) => ({
      id: spec.kind,
      title: spec.title,
      agent: spec.agentName,
      status: 'pending' as StepStatus,
      dependsOn: [...spec.dependsOn],
      artifact: spec.artifact,
    })),
    dependencies: READINESS_STEPS.flatMap((spec) => spec.dependsOn.map((dep) => [dep, spec.kind] as [string, string])),
    risks: [
      '本机没有真 provider：计划由确定性配方生成，不是模型规划（§160 的 DEMO 标识）',
      '门禁里没测的项一律是"未评估"，不能被读成通过（§178/§159）',
    ],
    validation: ['每一步都有真执行方', '失败会往下传并停在计划里', '结论能在 /studio 的 Agent 面板上复看'],
  };
}

export type PlanProblemCode = 'empty' | 'too-many-steps' | 'unknown-step' | 'duplicate-id' | 'missing-dep' | 'self-dep' | 'cycle';

export interface PlanProblem {
  code: PlanProblemCode;
  message: string;
}

/**
 * 开跑之前把计划整份验一遍。**任何一条不过就不跑**：半跑的计划比没跑更糟——
 * 用户会以为剩下的步骤也在做。
 */
export function validatePlan(plan: AgentPlan): PlanProblem[] {
  const problems: PlanProblem[] = [];
  const tasks = plan.tasks;
  if (tasks.length === 0) problems.push({ code: 'empty', message: '计划里一个步骤都没有' });
  if (tasks.length > MAX_PLAN_STEPS) {
    problems.push({ code: 'too-many-steps', message: `计划有 ${tasks.length} 步，超过一次作业的上限 ${MAX_PLAN_STEPS} 步` });
  }
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) problems.push({ code: 'duplicate-id', message: `步骤 id 重复：${task.id}` });
    ids.add(task.id);
    if (!stepSpec(task.id)) problems.push({ code: 'unknown-step', message: `这一步没有执行方：${task.id}（${task.title}）` });
  }
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (dep === task.id) problems.push({ code: 'self-dep', message: `${task.id} 依赖自己` });
      else if (!ids.has(dep)) problems.push({ code: 'missing-dep', message: `${task.id} 依赖的 ${dep} 不在计划里` });
    }
  }
  // 环：计划一旦成环就没有"就绪"的步骤，作业会静默地什么都不做
  const state = new Map<string, 'visiting' | 'done'>();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const walk = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      problems.push({ code: 'cycle', message: `步骤依赖成环：${[...path, id].join(' → ')}` });
      return;
    }
    state.set(id, 'visiting');
    for (const dep of byId.get(id)?.dependsOn ?? []) if (byId.has(dep)) walk(dep, [...path, id]);
    state.set(id, 'done');
  };
  for (const task of tasks) walk(task.id, []);
  return problems;
}

export interface PlanProgress {
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  skipped: number;
}

export function progressOf(plan: AgentPlan): PlanProgress {
  const progress: PlanProgress = { total: plan.tasks.length, pending: 0, running: 0, done: 0, failed: 0, skipped: 0 };
  for (const task of plan.tasks) progress[task.status] += 1;
  return progress;
}

/** 依赖全部完成、自己还没跑的步骤，按计划里的顺序 —— 顺序稳定才能"重跑一次结果一样" */
export function readyIds(plan: AgentPlan): string[] {
  const status = new Map(plan.tasks.map((task) => [task.id, task.status]));
  return plan.tasks
    .filter((task) => task.status === 'pending' && task.dependsOn.every((dep) => status.get(dep) === 'done'))
    .map((task) => task.id);
}

/**
 * 被牵连的步骤：自己没跑，但某条依赖已经失败/跳过。返回"被谁牵连"，因为界面上要说得出来
 * —— 只说"跳过了"，用户会以为是我们自己不想做。
 */
export function blockedIds(plan: AgentPlan): { id: string; because: string[] }[] {
  const status = new Map(plan.tasks.map((task) => [task.id, task.status]));
  const out: { id: string; because: string[] }[] = [];
  for (const task of plan.tasks) {
    if (task.status !== 'pending') continue;
    const because = task.dependsOn.filter((dep) => {
      const state = status.get(dep);
      return state === 'failed' || state === 'skipped';
    });
    if (because.length) out.push({ id: task.id, because });
  }
  return out;
}

/** 改一步的状态，返回新计划（计划是 jsonb，就地改会让"上一次读到的那份"跟着变） */
export function withStatus(plan: AgentPlan, id: string, status: StepStatus): AgentPlan {
  return { ...plan, tasks: plan.tasks.map((task) => (task.id === id ? { ...task, status } : task)) };
}

export interface PlanVerdict {
  /** 没有 pending / running 了：作业该收尾 */
  finished: boolean;
  /** 每一步都 done —— 有 skipped 也不算成功，那是"没做完" */
  ok: boolean;
  reason: string | null;
}

export function verdictOf(plan: AgentPlan): PlanVerdict {
  const progress = progressOf(plan);
  const finished = progress.pending === 0 && progress.running === 0;
  if (!finished) return { finished: false, ok: false, reason: null };
  if (progress.failed === 0 && progress.skipped === 0) return { finished: true, ok: true, reason: null };
  const parts: string[] = [];
  if (progress.failed) parts.push(`${progress.failed} 步失败`);
  if (progress.skipped) parts.push(`${progress.skipped} 步因上游失败被跳过`);
  return { finished: true, ok: false, reason: parts.join('，') };
}

/**
 * §113 Agent Handoff：这一步能拿到的东西 = 它依赖的那几步的产物名 + 对方的结论摘要。
 * 只给**自己声明依赖**的那几步：把整份项目上下文塞给每一步，等于没有交接。
 */
export function handoffOf(plan: AgentPlan, id: string): { from: string; artifact: string | null }[] {
  const task = plan.tasks.find((item) => item.id === id);
  if (!task) return [];
  return task.dependsOn.map((dep) => {
    const upstream = plan.tasks.find((item) => item.id === dep);
    return { from: dep, artifact: upstream?.artifact ?? null };
  });
}
