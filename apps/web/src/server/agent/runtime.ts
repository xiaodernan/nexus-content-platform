import { and, eq, isNull } from 'drizzle-orm';
import { AgentPlanSchema, type AgentActivity, type AgentPlan, type RealtimeEvent } from '@nexus/schemas';
import { analyzeHealth, type DesignDocument, type HealthReport } from '@nexus/design-model';
import {
  COMBAT_DESIGN_LIMITS,
  COMBAT_GOAL_ORDER,
  COMBAT_LEVERS,
  compileRpg,
  playtestRpg,
  tuneCombat,
  type CombatGoalId,
  type CombatGoalReading,
  type GameDocument,
} from '@nexus/game-model';
import { GAME_DRAFT_NOT_LANDED_NOTE, gameDraft } from '@/lib/agent-game-draft';
import {
  GOAL_MAX,
  buildReadinessPlan,
  blockedIds,
  handoffOf,
  progressOf,
  readyIds,
  ReadinessReportSchema,
  stepSpec,
  validatePlan,
  verdictOf,
  withStatus,
  type StepKind,
  type ReadinessReport,
  type StepReport,
} from '@/lib/agent-runtime';
import { channels, getRealtimeBus } from '../realtime/bus';
import { getDb } from '../db/client';
import { projects } from '../db/schema';
import { loadRoster } from '../domain/agents';
import { finishTask, publishTaskProgress, recordPlan, startTask } from '../domain/agent-tasks';
import { refusalForRun } from '../domain/credit-ledger';
import { knowledgeStats } from '../domain/knowledge';
import { emit } from '../domain/notifications';
import { getPublication } from '../domain/publish';
import { loadDocument } from '../domain/projects';

/**
 * §112 编排的**执行方**：把一份计划（§25）一步一步跑完，而每一步都是本机真的算得出来的东西。
 *
 * 为什么在 web 层而不是 ai-service：每一步的产物都要落业务库、要发实时事件、要写任务账本与通知，
 * 这几样都是 web 这一侧的职责（ARCHITECTURE.md 的边界：AI Service 不写业务库）。模型的活儿
 * （真规划、真生成）将来还是走 provider；这里管的是"谁在什么时候做什么、做完留下什么"。
 *
 * 六条纪律：
 *
 * 1. **跑之前先验计划，整份不合格就不跑**（`validatePlan`）。半跑的计划比没跑更糟：用户会以为
 *    剩下的几步也在做。
 * 2. **名册说了算**（§73 同一个口径）。每一步声明它要求的能力，开跑前拿名册核对；名册里没有这个
 *    Agent、或它没声明这条能力，整份作业拒收并说清缺什么。
 * 3. **这一轮只读**。今天这五步都不改设计文档、不发布、不生成像素，也不往游戏库写东西——
 *    §52 那一步编出来的草稿只存在这一条作业里（`result.steps[].draft`），要进项目得由用户在
 *    接受入口点那一下（ADR-0035）。所以这里没有 §150 的可撤销事务要记，也不可能把工作区改坏。
 *    将来加会改模型的步骤时，那一步必须自己走 Command（§150）
 *    并把撤销凭证带回来，不许在这里直接写库。
 * 4. **失败往下传**。某一步失败之后，依赖它的步骤是 `skipped` 并写着"被谁牵连"——不是 failed：
 *    它们根本没跑过。
 * 5. **事件是加速器，库是权威**（ADR-0010 后果第 4 条）。每一步推事件，同时把计划写回
 *    `agent_tasks.plan`；界面刷新后读的是库，不是事件。
 * 6. **拒收发生在建任务行之前**。一条从没跑起来的作业不该在账本里留一行（同 §134 的额度拒绝：
 *    "我点了但什么都没发生"与"跑了、失败了"是两件事）。
 *
 * DEMO 的边界（§160）：这份计划由确定性配方生成，不是模型规划——所以整条作业记 `capability: 'demo'`，
 * 通知标题里写"DEMO 规划"；而每一步的读数（页数、门禁分、语料块数）是真的。
 */

/** 编排作业挂在 Product Agent 名下：它的职责就是"把一句话需求整理成目标 / 约束 / 任务 / 验收"（§24） */
export const ORCHESTRATOR_AGENT_KEY = 'product';

/** 计划从哪来：今天只有确定性配方，所以是 demo；接上模型规划后这里才可能变 real */
export const PLANNER: 'real' | 'demo' = 'demo';

export type OrchestrationRefusalCode = 'no-document' | 'roster-empty' | 'capability' | 'credits' | 'invalid-plan';

export interface OrchestrationRefusal {
  code: OrchestrationRefusalCode;
  status: number;
  message: string;
}

export type OrchestrationResult =
  | { ok: false; refusal: OrchestrationRefusal }
  | {
      ok: true;
      taskId: string;
      status: 'succeeded' | 'failed';
      plan: AgentPlan;
      error: string | null;
      steps: StepReport[];
      /** 汇总那一步的结论；没跑到就是 null */
      report: ReadinessReport | null;
      durationMs: number;
    };

interface ProjectFacts {
  projectName: string;
  description: string | null;
  publication: { version: number; visibility: string; moderation: string } | null;
  knowledge: { total: number; bySource: Record<string, number>; vectorized: number };
}

interface StepContext {
  projectId: string;
  taskId: string;
  goal: string;
  document: DesignDocument;
  facts: ProjectFacts;
  /** §113 交接：自己声明依赖的那几步的结论 */
  upstream: StepReport[];
}

interface StepOutcome {
  summary: string;
  counts: Record<string, number>;
  notes: string[];
  /** 只有汇总那一步会返回它：作业的终态结论。别的步骤的产物已经在 counts / notes 里 */
  data?: ReadinessReport;
  /**
   * 只有 §52 那一步会返回它：一份**还没写进项目**的游戏草稿。
   * 它跟着步骤结论进任务行，接受入口才有东西可接（ADR-0035）。
   */
  draft?: GameDocument;
}

type Runner = (ctx: StepContext) => Promise<StepOutcome>;

/** 节点总数：现场数，不存第二份（同 §188 的 v1 详情接口一个口径） */
function countNodes(document: DesignDocument): number {
  return document.pages.reduce((sum, page) => sum + Object.keys(page.nodes ?? {}).length, 0);
}

/**
 * 结构 / 语料 / 发布状态盘点。全是本项目自己的读数：页面、节点、语料块数、发布版本。
 * 语料为空的来源要单独说一句——"索引是空的"与"这个来源没有内容"是两件事。
 */
const contextStep: Runner = async (ctx) => {
  const pages = ctx.document.pages.length;
  const nodes = countNodes(ctx.document);
  const tokens = ctx.document.tokens.length;
  const chunks = ctx.facts.knowledge.total;
  const bySource = Object.entries(ctx.facts.knowledge.bySource).sort((a, b) => b[1] - a[1]);
  const notes = bySource.map(([source, count]) => `语料 ${source}：${count} 块`);
  if (!chunks) notes.push('语料库是空的：世界 / 角色 / 分镜 / 游戏 / 正文都还没有被索引过');
  notes.push(
    ctx.facts.publication
      ? `发布中：第 ${ctx.facts.publication.version} 版（${ctx.facts.publication.visibility}）`
      : '还没发布过：没有公开版本可对照',
  );
  return {
    summary: `${pages} 页 / ${nodes} 个节点 / ${tokens} 个 token · 语料 ${chunks} 块（有向量 ${ctx.facts.knowledge.vectorized} 块）`,
    counts: { pages, nodes, tokens, knowledgeChunks: chunks, vectorized: ctx.facts.knowledge.vectorized },
    notes,
  };
};

/**
 * 上架要用的元信息：标题、简介、可索引的正文、发布状态。看的是"别人能不能搜到你"，
 * 缺什么就说什么——不补一句"SEO 很好"（§159）。
 */
const seoStep: Runner = async (ctx) => {
  const title = ctx.document.name.trim();
  const description = (ctx.facts.description ?? '').trim();
  const textNodes = ctx.document.pages.reduce(
    (sum, page) =>
      sum + Object.values(page.nodes ?? {}).filter((node) => node.type === 'text' && (node.text ?? '').trim().length > 0).length,
    0,
  );
  const notes: string[] = [];
  let missing = 0;
  if (!description) {
    missing += 1;
    notes.push('没有项目简介：og:description 与搜索摘要只能退到"从快照文字里摘一句"');
  }
  if (!title) {
    missing += 1;
    notes.push('设计文档没有名字：页面标题与 og:title 会少一段');
  }
  if (title.length > 60) notes.push(`标题 ${title.length} 字：搜索结果里通常会被截断`);
  if (textNodes === 0) {
    missing += 1;
    notes.push('一页里都没有非空文本节点：公开页上没有可索引的正文');
  }
  notes.push(ctx.facts.publication ? `已发布第 ${ctx.facts.publication.version} 版：sitemap 里有它` : '还没发布过：sitemap 里暂时没有这个项目');
  return {
    summary: missing ? `${missing} 项上架元信息还没准备好（共查 4 项）` : '上架元信息齐备（标题 / 简介 / 正文 / 发布状态）',
    counts: { checks: 4, missing, textNodes },
    notes,
  };
};

/**
 * 发布门禁。用的是**发布时同一个** `analyzeHealth`（§179）——不另算一套分，
 * 否则界面上的分与挡下发布的分迟早对不上。
 */
const qaStep: Runner = async (ctx) => {
  const report: HealthReport = analyzeHealth(ctx.document);
  const gating = report.checks.filter((check) => check.gating);
  const fail = gating.filter((check) => check.state === 'fail');
  const notRun = report.checks.filter((check) => check.state === 'not-run');
  const findings = report.checks.reduce((sum, check) => sum + check.findings.length + check.omitted, 0);
  const notes = [
    ...report.blockers.map((blocker) => `挡发布：${blocker}`),
    ...(notRun.length ? [`没测的项：${notRun.map((check) => check.label).join('、')}（不当作通过）`] : []),
  ];
  return {
    summary: report.passed
      ? `门禁通过（${gating.length} 项参与判定 · 发现 ${findings} 条）`
      : `门禁未通过：${fail.length} 项不达标 · 挡发布原因 ${report.blockers.length} 条`,
    counts: { gating: gating.length, fail: fail.length, notRun: notRun.length, blockers: report.blockers.length, findings },
    notes,
    // 逐行的分与状态不往这里搬：健康面板（§178）已经按同一份 `analyzeHealth` 画了，
    // 搬一份过来就有两个地方会漂；这一步只交代"挡住了什么"
  };
};

/**
 * 汇总。它**只读上游那几步的结论**（§113 的 handoff），自己不去重新查一遍库——
 * 重新查就有第二种算法，两处结论不一致时没人知道该信哪个。
 */
const reportStep: Runner = async (ctx) => {
  const upstream = ctx.upstream;
  if (!upstream.length) throw new Error('汇总这一步没有拿到任何上游结论：它的依赖没跑过或没交接过来');
  const notes: string[] = [];
  let actionable = 0;
  for (const step of upstream) {
    if (step.status !== 'done') {
      actionable += 1;
      notes.push(`${step.title}：没有完成（${step.error ?? (step.because?.length ? `被 ${step.because.join('、')} 牵连` : '未给出原因')}）`);
      continue;
    }
    for (const note of step.notes) {
      // 只把"要动手的"写进结论：几页几个节点那种事实在各自那一步里已经说过了
      if (/挡发布|没有|还没|未|缺|空|不达标/.test(note)) {
        actionable += 1;
        notes.push(note);
      }
    }
  }
  const top = notes.slice(0, 12);
  // 结论的形状由 `ReadinessReportSchema` 定：在这里校验一次，坏掉的结论就不会先落库再被读出来
  const data = ReadinessReportSchema.parse({
    actionable,
    notes: top,
    upstream: upstream.map((step) => ({ id: step.id, status: step.status, summary: step.summary, artifact: step.artifact })),
  });
  return {
    summary: actionable
      ? `读出 ${actionable} 条待办：上架前该动的东西都在这儿`
      : '检查那几步全绿：结构、语料、元信息、门禁都没读出待办（这一步只做汇总，不含 §52 那份草稿）',
    counts: { upstream: upstream.length, actionable },
    notes: top,
    data,
  };
};

/**
 * 执行器注册表。`Record<StepKind, Runner>` 是**编译期**的保证：纯层里加一种步骤种类，
 * 这里不加一个真实现就过不了类型检查——"计划里有、跑的时候没人做"因此不会发生。
 */
/**
 * §52 Game Agent：编一份**确定性配方给的** RPG 原型草稿，并把它随这一步的结论存进任务行。
 *
 * 三件事必须分开，这一片的全部道理都在这个分开里：
 * - **编草稿**：这一步做的，纯函数，不碰库；
 * - **草稿存在哪**：任务行的 `result.steps[].draft`，所以刷新之后还在、别的实例也读得到；
 * - **谁把它变成项目里的真值**：用户在 Agent 面板点那一下「接受进项目」，走 `/agent/draft` 那个入口——
 *   只有那里才写库。上一版在这里写着"该文档已可在 Game Studio 试玩"而库里一行没写，
 *   那就是 §159 禁止的假交付（措辞与真相反对不上）。
 *
 * 画面上说的数是跑出来的：`compileRpg` 与 `playtestRpg` 就是试玩页与 HUD 用的那两个函数，
 * 所以"四种脚本走法里有几种通关"是 §53 那份报告的读数，不是估的。
 * 报告自带的限度也一起带上来——只报"2 种通关"会被读成"这设计好上手"。
 */
const gameStep: Runner = async (ctx) => {
  const document = gameDraft({ goal: ctx.goal, at: new Date().toISOString(), seed: ctx.taskId });
  const plan = compileRpg(document);
  const playtest = playtestRpg(plan);
  const enemies = plan.enemyXp.length;
  const authored = plan.enemyXp.filter((enemy) => enemy.from === 'design').length;
  const player = plan.base.player;
  return {
    summary: `编出 ${document.entities.length} 个实体的 RPG 原型草稿（${enemies} 个敌人 / ${plan.quests.length} 条任务）；四种脚本走法里 ${playtest.winnableBy} 种通关`,
    counts: {
      entities: document.entities.length,
      enemies,
      quests: plan.quests.length,
      triggers: plan.base.triggers.length,
      xpFromDesign: authored,
      policies: playtest.runs.length,
      won: playtest.winnableBy,
      lost: playtest.diedFrom,
    },
    notes: [
      GAME_DRAFT_NOT_LANDED_NOTE,
      `配方表决定数值，目标文本只改了标题（现在是「${document.name}」）——这一轮没有真 provider 参与（§160）。`,
      `玩家伤害 ${player?.damage ?? 0}（来源是引用到玩家的那把武器，provenance=${player?.provenance.damage ?? '无'}）、触及 ${player?.reach ?? 0} 像素；` +
        `经验来源 ${authored}/${enemies} 个敌人写了 xpReward。`,
      `四种脚本走法（定种子 7，跑的是 rpgStep）：${playtest.runs.map((run) => `${run.label} ${run.seconds} 秒→${run.status === 'won' ? '通关' : run.status === 'lost' ? '倒下' : '没结束'}`).join('、')}`,
      `这份报告的限度：${playtest.limits[0] ?? ''}`,
      '接受进项目之后它是项目里的一份普通游戏文档：能改、能试玩、进 §49 语料；撤销走 §150 那套 Command，不靠这一步。',
    ],
    draft: document,
  };
};

/** 一条目标的读数：目标清单由 game-model 给，这里只按 id 取，不自己再算一份指标 */
function readingOf(goals: CombatGoalReading[], id: CombatGoalId): CombatGoalReading | null {
  return goals.find((goal) => goal.id === id) ?? null;
}

/**
 * §52 链的第二格 Combat Design：拿上一步（game）留下的那份草稿，按**写死的规则**把战斗数值调进目标带。
 *
 * 与第一格同一条纪律：产物**还是草稿**，存在这一步自己的结论里，不写项目（ADR-0035）。
 * 为什么这一步里没有"AI 判断"：`tuneCombat` 是 game-model 里的纯函数，五条目标的阈值、
 * 七条杠杆与上下界全部写死在 `COMBAT_RULES` / `COMBAT_LEVERS`（那边不读时钟、不碰库），
 * 所以 `at` 由这一层给——同一份草稿两次跑出来的数值表逐键相同，只有时间戳跟着这一次跑动走。
 * 读数也不是估的：每一轮改完都重跑 §53 那份定种子报告（四种走法、rpgStep）。
 *
 * 拿不到上游草稿就直接失败，**不自己编一份设计来"调"**：那一步没跑成，这一步就没东西可改，
 * 计划里它会标 failed、下游标 skipped（纪律第 4 条）。
 */
const combatStep: Runner = async (ctx) => {
  const source = ctx.upstream.find((step) => step.id === 'game')?.draft;
  if (!source) {
    throw new Error('combat 这一步没拿到上游草稿（game 那一步没留下 draft）：没有可调的设计，这一格不另编一份');
  }
  const tuning = tuneCombat(source, { at: new Date().toISOString() });
  const reverted = tuning.rounds.filter((round) => !round.kept);
  const met = tuning.goals.filter((goal) => goal.achieved).length;
  const fastestBefore = readingOf(tuning.beforeGoals, 'fight-length')?.metric ?? 0;
  const fastestAfter = readingOf(tuning.goals, 'fight-length')?.metric ?? 0;
  const costBefore = readingOf(tuning.beforeGoals, 'winner-pays')?.metric ?? 0;
  const costAfter = readingOf(tuning.goals, 'winner-pays')?.metric ?? 0;
  return {
    summary:
      `按写死的规则调过 ${tuning.rounds.length} 轮、保留 ${tuning.adjustments.length} 处数值改动：` +
      `${met}/${tuning.goals.length} 条目标达标（最快通关 ${fastestBefore}→${fastestAfter} 秒，` +
      `赢家最少挨的从 ${costBefore}→${costAfter} 点）`,
    counts: {
      entities: tuning.document.entities.length,
      rounds: tuning.rounds.length,
      kept: tuning.adjustments.length,
      reverted: reverted.length,
      goalsMet: met,
      goalsTotal: tuning.goals.length,
      fastestSecondsBefore: fastestBefore,
      fastestSeconds: fastestAfter,
      winnerCostBefore: costBefore,
      winnerCost: costAfter,
    },
    notes: [
      GAME_DRAFT_NOT_LANDED_NOTE,
      `这一步没有真 provider：目标带（${COMBAT_GOAL_ORDER.length} 条）与杠杆（${COMBAT_LEVERS.length} 条）、` +
        `上下界全部是 game-model 里写死的常量（COMBAT_RULES / COMBAT_LEVERS），改的是数值不是规则（§160）。`,
      ...tuning.notes,
      COMBAT_DESIGN_LIMITS[2] ?? '',
      '接受进来的可以是这一份（调过的），也可以是上面那一步那份原始草稿——两个按钮各接各的，点了才会写进项目。',
    ].filter(Boolean),
    draft: tuning.document,
  };
};

const RUNNERS: Record<StepKind, Runner> = {
  context: contextStep,
  'seo-audit': seoStep,
  'qa-audit': qaStep,
  report: reportStep,
  game: gameStep,
  combat: combatStep,
};

function publish(projectId: string, event: RealtimeEvent): void {
  getRealtimeBus().publish(channels.project(projectId), event);
}

function activity(
  stage: string,
  status: AgentActivity['status'],
  summary: string,
  counts?: Record<string, number>,
  artifactRef?: string,
): AgentActivity {
  return {
    stage,
    status,
    summary: summary.slice(0, 400),
    ...(counts ? { counts } : {}),
    ...(artifactRef ? { artifactRef } : {}),
    at: new Date().toISOString(),
  };
}

async function collectFacts(projectId: string, document: DesignDocument): Promise<ProjectFacts> {
  const [knowledge, publication, row] = await Promise.all([
    knowledgeStats(projectId),
    getPublication(projectId),
    getDb()
      .select({ name: projects.name, description: projects.description })
      .from(projects)
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
      .limit(1),
  ]);
  return {
    // 项目名以库里那一行为准（文档名会被保存路径同步过去），简介只在库里
    projectName: row[0]?.name ?? document.name,
    description: row[0]?.description ?? null,
    publication: publication
      ? { version: publication.version, visibility: publication.visibility, moderation: publication.moderation }
      : null,
    knowledge,
  };
}

/** 成功时的正文：一句能读的结论（门禁过没过、有几条待办），不写"一切正常"那种没人能核对的话 */
function summarizeOk(reports: StepReport[], report: ReadinessReport | null): string {
  const counts = reports.find((step) => step.id === 'qa-audit')?.counts ?? {};
  const actionable = report ? report.actionable : null;
  const parts = [`${reports.filter((step) => step.status === 'done').length}/${reports.length} 步完成`];
  if (typeof counts.blockers === 'number' && counts.blockers > 0) parts.push(`门禁挡发布 ${counts.blockers} 条`);
  if (typeof counts.fail === 'number' && counts.fail > 0) parts.push(`${counts.fail} 项不达标`);
  if (actionable !== null) parts.push(`待办 ${actionable} 条`);
  return parts.join(' · ');
}

/**
 * 跑一次「上架前检查」。
 *
 * 拒收（refusal）发生在**建任务行之前**：一条从没跑起来的作业不该在账本里留一行
 * （同 §134 额度拒绝那个口径——"我点了但什么都没发生"与"跑了、失败了"是两件事）。
 */
export async function runReadinessCheck(input: {
  projectId: string;
  actorId: string;
  goal: string;
  /**
   * 替换某几步的执行方。**只给测试用**：注入一个会抛错的执行方，才能把"失败往下传"那条链路
   * （计划里标 failed → 依赖它的那步标 skipped → 任务行落 failed → 通知说失败）真的跑一遍。
   * §159 的口径：没跑过的不算做完。生产路径不传它。
   */
  runners?: Partial<Record<StepKind, Runner>>;
}): Promise<OrchestrationResult> {
  const goal = input.goal.trim().slice(0, GOAL_MAX);

  const document = await loadDocument(input.projectId);
  if (!document) {
    return {
      ok: false,
      refusal: { code: 'no-document', status: 404, message: '这个项目读不到设计文档：它可能已被删除，或不属于当前账号' },
    };
  }

  const roster = await loadRoster();
  if (!roster.length) {
    return {
      ok: false,
      refusal: {
        code: 'roster-empty',
        status: 409,
        message: 'Agent 名册是空的（跑一次 npm run db:seed 才会播种）：没有名册就不知道每一步该交给谁，也不该假装有人在做',
      },
    };
  }

  const parsed = AgentPlanSchema.safeParse(buildReadinessPlan(goal));
  if (!parsed.success) {
    return {
      ok: false,
      refusal: {
        code: 'invalid-plan',
        status: 500,
        message: `内部计划不符合 §25 契约：${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`,
      },
    };
  }
  let plan = parsed.data;

  const problems = validatePlan(plan);
  if (problems.length) {
    return {
      ok: false,
      refusal: { code: 'invalid-plan', status: 500, message: `计划没有通过自检：${problems.map((problem) => problem.message).join('；')}` },
    };
  }

  // §73：能力由名册说了算。缺一个 Agent、或它没声明这条能力，整份作业拒收并说清缺什么
  for (const task of plan.tasks) {
    const spec = stepSpec(task.id);
    if (!spec) continue; // validatePlan 已经挡过，这里只是类型收窄
    const entry = roster.find((agent) => agent.key === spec.agentKey);
    if (!entry) {
      return {
        ok: false,
        refusal: { code: 'capability', status: 409, message: `名册里没有 ${spec.agentKey}（「${task.title}」需要的那个 Agent），这一步没有人做` },
      };
    }
    if (!entry.capabilities.includes(spec.requires)) {
      return {
        ok: false,
        refusal: {
          code: 'capability',
          status: 409,
          message: `${entry.name} 的名册能力里没有 ${spec.requires}，所以「${task.title}」这一步不能跑（§73：能力由名册说了算）`,
        },
      };
    }
  }

  const refusal = await refusalForRun(input.actorId, ORCHESTRATOR_AGENT_KEY);
  if (refusal) return { ok: false, refusal: { code: 'credits', status: 429, message: refusal } };

  const facts = await collectFacts(input.projectId, document);
  const started = await startTask({
    projectId: input.projectId,
    agentKey: ORCHESTRATOR_AGENT_KEY,
    createdById: input.actorId,
    capability: PLANNER,
    input: { goal, orchestrated: true, planner: PLANNER, steps: plan.tasks.map((task) => task.id) },
  });
  const taskId = started.id;
  const startedAtMs = Date.now();

  await recordPlan(taskId, plan);
  publish(input.projectId, { type: 'agent.plan', projectId: input.projectId, taskId, plan });
  publish(input.projectId, {
    type: 'agent.activity',
    projectId: input.projectId,
    taskId,
    activity: activity(
      'plan',
      'info',
      `计划已就绪：${plan.tasks.length} 步（${PLANNER === 'demo' ? 'DEMO 规划' : '模型规划'}）`,
      { steps: plan.tasks.length },
    ),
  });

  const reports: StepReport[] = [];
  let lastReport: ReadinessReport | null = null;
  const reportOf = (id: string): StepReport | undefined => reports.find((item) => item.id === id);

  /**
   * §163 说的"有真来源才推进度"：这一格的分子分母都从 `plan` 那一份数出来（`progressOf`），
   * 分子是**已到终态**的步数（done + failed），分母是计划里的总步数。
   * 只有真的跑过的那一步会走到这里——被牵连跳过的那一步在主循环里标状态，不发这一条，
   * 因为它什么都没做，算一格等于把"没跑"报成"跑完了四分之一"。
   * 只能在 `withStatus` 之后调用，否则这一格说的还是上一步的数。
   */
  const publishStepProgress = (stepTitle: string): void => {
    const counts = progressOf(plan);
    const settled = counts.done + counts.failed;
    publishTaskProgress(input.projectId, taskId, settled / counts.total, `第 ${settled}/${counts.total} 步：${stepTitle}`);
  };

  const runOne = async (id: string): Promise<void> => {
    const task = plan.tasks.find((item) => item.id === id);
    const spec = stepSpec(id);
    if (!task || !spec) throw new Error(`计划里的这一步没有执行方：${id}`);
    const runner = input.runners?.[spec.kind] ?? RUNNERS[spec.kind];
    const handedOff = handoffOf(plan, id);
    const base: StepReport = {
      id,
      title: task.title,
      agent: task.agent,
      agentKey: spec.agentKey,
      status: 'running',
      summary: '',
      artifact: task.artifact ?? null,
      counts: {},
      notes: [],
      durationMs: 0,
      ...(handedOff.length ? { handedOff } : {}),
    };
    const startedAt = Date.now();
    publish(input.projectId, {
      type: 'agent.step',
      projectId: input.projectId,
      taskId,
      stepId: id,
      status: 'started',
      summary: `${task.title}（${task.agent}）`,
    });
    publish(input.projectId, {
      type: 'agent.activity',
      projectId: input.projectId,
      taskId,
      activity: activity(spec.kind, 'started', `${task.agent} 开始：${task.title}`),
    });

    try {
      const outcome = await runner({
        projectId: input.projectId,
        taskId,
        goal,
        document,
        facts,
        upstream: task.dependsOn
          .map((dep) => reportOf(dep))
          .filter((item): item is StepReport => Boolean(item)),
      });
      reports.push({
        ...base,
        status: 'done',
        summary: outcome.summary,
        counts: outcome.counts,
        notes: outcome.notes,
        durationMs: Date.now() - startedAt,
        // 草稿只在这一步有：它是"这一步跑完留下的东西"，不是项目里的真值（§52 × ADR-0035）
        ...(outcome.draft ? { draft: outcome.draft } : {}),
      });
      plan = withStatus(plan, id, 'done');
      publish(input.projectId, { type: 'agent.step', projectId: input.projectId, taskId, stepId: id, status: 'completed', summary: outcome.summary });
      publish(input.projectId, {
        type: 'agent.activity',
        projectId: input.projectId,
        taskId,
        activity: activity(spec.kind, 'completed', `${task.agent}：${outcome.summary}`, outcome.counts, task.artifact),
      });
      publishStepProgress(task.title);
      if (outcome.data) lastReport = outcome.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reports.push({ ...base, status: 'failed', summary: message, durationMs: Date.now() - startedAt, error: message });
      plan = withStatus(plan, id, 'failed');
      publish(input.projectId, { type: 'agent.step', projectId: input.projectId, taskId, stepId: id, status: 'failed', summary: message });
      publish(input.projectId, {
        type: 'agent.activity',
        projectId: input.projectId,
        taskId,
        activity: activity(spec.kind, 'failed', `${task.agent} 失败：${message}`),
      });
      publishStepProgress(task.title);
    }
    await recordPlan(taskId, plan);
  };

  // 主循环：先跑所有"依赖都完成"的步骤；没有就绪的就看剩下的是不是被牵连了。
  // 两个分支每轮都至少让一个 pending 走到终态，所以一定会退出。
  for (;;) {
    const ready = readyIds(plan);
    if (ready.length) {
      for (const id of ready) await runOne(id);
      continue;
    }
    const blocked = blockedIds(plan);
    if (!blocked.length) break;
    for (const item of blocked) {
      const task = plan.tasks.find((entry) => entry.id === item.id);
      const spec = stepSpec(item.id);
      reports.push({
        id: item.id,
        title: task?.title ?? item.id,
        agent: task?.agent ?? '（名册里没有）',
        agentKey: spec?.agentKey ?? '',
        status: 'skipped',
        summary: `没有跑：上游 ${item.because.join('、')} 没有完成`,
        artifact: task?.artifact ?? null,
        counts: {},
        notes: [],
        durationMs: 0,
        because: item.because,
      });
      plan = withStatus(plan, item.id, 'skipped');
      // 跳过不发 agent.step（它从没开始过，发一条"失败"就是假的），只发一条活动说明
      publish(input.projectId, {
        type: 'agent.activity',
        projectId: input.projectId,
        taskId,
        activity: activity(item.id, 'info', `跳过：上游 ${item.because.join('、')} 没有完成`),
      });
    }
    await recordPlan(taskId, plan);
  }

  const progress = progressOf(plan);
  const verdict = verdictOf(plan);
  const failedReport = reports.find((step) => step.status === 'failed');
  const error = verdict.ok ? null : (failedReport?.error ?? verdict.reason ?? '作业没有跑完，也没有给出原因');
  const durationMs = Date.now() - startedAtMs;

  await finishTask(
    taskId,
    verdict.ok
      ? { ok: true, result: { goal, planner: PLANNER, steps: reports, report: lastReport, progress } }
      : { ok: false, error: error ?? '编排失败' },
  );

  await emit({
    kind: 'agent',
    recipientId: input.actorId,
    projectId: input.projectId,
    projectName: facts.projectName,
    taskId,
    planner: PLANNER,
    ok: verdict.ok,
    durationMs,
    steps: { total: progress.total, done: progress.done, failed: progress.failed, skipped: progress.skipped },
    detail: verdict.ok ? summarizeOk(reports, lastReport) : error,
  });

  return { ok: true, taskId, status: verdict.ok ? 'succeeded' : 'failed', plan, error, steps: reports, report: lastReport, durationMs };
}
