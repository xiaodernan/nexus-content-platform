import { initialState, step, type SimInput, type SimState } from "./sim";
import type { GamePlan } from "./play";
import { initialRpgState, rpgStep, type RpgPlan } from "./rpg";
import type { StoryPlan } from "./story";

/**
 * §53 的可确定那一半：不启动浏览器、不靠人拿键盘试，就把这份设计跑几遍，
 * 回答"按这些走法能不能通、要多久、在哪死"。
 *
 * 覆盖两条管线（与 `compileForKind` 的分派一一对应，§51 的八种类型都有了着落）：
 * - topdown 那五种（2D / 2.5D / 3D / 探索 / 解谜）：`playtest`，四种空间走法跑 `sim.step`；
 * - RPG 原型：`playtestRpg`，同样四种走法但跑 `rpgStep`——经验、升级与等级门参与判定，
 *   不是只跑底层战斗（用底层 step 跑 RPG 就会得出"任务过了"而门其实扣着的假报告）；
 * - 对话管线（互动故事 / 视觉小说）：`playtestStory`。这里**没有"走法"可言**——
 *   四种空间走法对着一段对话什么都不是，能确定回答的是"点不点得到"：
 *   按引用连线算可达、停点与空正文数出来。发现毛病（§53 的 Detect bugs）要浏览器与模型，
 *   那两格不在这个文件里。
 *
 * 为什么用脚本而不是"AI 玩"：脚本是确定的，所以"这一版比上一版难"这种话才有意义。
 * 需要模型的自动改法（§53 的 Fix 那一格）不在这里，那是 §52 编排的事。
 *
 * 三条限度：
 * - 策略是**有限的几种走法**，不是穷举。"这些走法都通不了"不等于"没人能通"，
 *   报告里就是这么写的；反过来"有一条通了"也不等于"好上手"。
 * - 带随机性的游走用**定种子**的线性同余：同一份计划两次跑出来的报告逐字节相同，
 *   否则一次红无从复现。种子是**入参**（默认 `PLAYTEST_DEFAULT_SEED`），而每一份报告都把自己
 *   实际用的那个数带在 `seed` 字段里——界面上"跑的种子"与"显示的种子"因此不可能各说一套。
 * - 只读 `step` 的结果，不改规则。这里若出现"为了让报告好看而调整判定"，
 *   整份报告就失去意义。
 */

export type PolicyKey = "idle" | "beeline" | "flee" | "wander";

export const POLICY_LABELS: Record<PolicyKey, string> = {
  idle: "站着不动",
  beeline: "冲向最近的敌人并挥击",
  flee: "一直躲开最近的敌人",
  wander: "定种子随机游走",
};

/**
 * 随机游走的那条抽样从哪个数起。它是**默认值**而不是常量：`playtest` / `playtestRpg` 收 seed 入参，
 * 换种子=换一次抽样（规则与数值都不动，所以两份报告可以并排放），而这个默认值保证
 * "谁都没填种子"的那一路（试玩页第一次打开、编排链的每一格、combat/level 那两格的自评级）逐次可比。
 */
export const PLAYTEST_DEFAULT_SEED = 7;

/** 四种走法的固定清单：界面要用同一份清单时读这里，不在面板里再抄一遍数组 */
export const PLAYTEST_POLICIES: readonly PolicyKey[] = ["idle", "beeline", "flee", "wander"];

/**
 * 传进来的种子先取整再用。`lcg` 对 0 与负数有回落，但对 NaN 没有：NaN 会一路染到坐标上，
 * 那份报告就成了一份读数全 NaN 的谎。落回默认值而不是报错，是因为这个入参来自输入框——
 * 清空输入框拿到的是 NaN，而用户看到的应当是"这一次跑的是默认种子"，不是白屏。
 */
export function effectiveSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) : PLAYTEST_DEFAULT_SEED;
}

export interface PlaytestRun {
  policy: PolicyKey;
  label: string;
  status: SimState["status"];
  seconds: number;
  damageTaken: number;
  damageDealt: number;
  pickups: number;
  questsDone: number;
  /** 结束时玩家站在哪：报告里"走到哪了"是可核对的，也用来证明随机确实参与了走法 */
  endX: number;
  endY: number;
  outcome: string | null;
  /** 跑到时间上限还没结束：不是"赢不了"，是"这些走法里它一直没结束" */
  timedOut: boolean;
}

export interface PlaytestReport {
  runs: PlaytestRun[];
  /** 有几种走法能通关（0 种不等于不可能，见文件头） */
  winnableBy: number;
  diedFrom: number;
  findings: string[];
  /** 报告本身的限度，界面要一起显示 */
  limits: string[];
  /**
   * 这一份报告**实际用的**种子（不是输入框里那个数）：NaN 之类的输入在这一步已经落回默认值，
   * 所以界面显示的是这里的数，而不是自己再去读一遍控件。
   */
  seed: number;
}

/** 定种子线性同余：只用来决定游走方向，不碰任何判定 */
function lcg(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function nearest(state: SimState, plan: GamePlan): { x: number; y: number } | null {
  const alive = plan.enemies
    .map((enemy) => state.enemies.find((s) => s.id === enemy.id))
    .filter((sim): sim is NonNullable<typeof sim> => Boolean(sim?.active));
  if (!alive.length) return null;
  return alive.reduce((best, other) =>
    Math.hypot(best.x - state.px, best.y - state.py) <= Math.hypot(other.x - state.px, other.y - state.py) ? best : other,
  );
}

/**
 * 一次跑法的输入来源。随机游走**每 0.4 秒换一次方向**而不是每帧换：
 * 每帧换向的话位移是"走两步退一步"，20 秒下来人还在原地——那种走法测不出任何东西。
 */
function makePolicySource(policy: PolicyKey, plan: GamePlan, rand: () => number) {
  let heading = 0;
  let nextTurn = 0;
  return (state: SimState): SimInput => {
    const target = nearest(state, plan);
    if (policy === "idle" || (!target && policy !== "wander")) return { dx: 0, dy: 0, attack: false };
    if (policy === "wander") {
      if (state.t >= nextTurn) {
        heading = rand() * Math.PI * 2;
        nextTurn = state.t + 0.4;
      }
      return { dx: Math.cos(heading), dy: Math.sin(heading), attack: true };
    }
    const dx = target!.x - state.px;
    const dy = target!.y - state.py;
    if (policy === "beeline") return { dx, dy, attack: true };
    return { dx: -dx, dy: -dy, attack: false }; // flee
  };
}

/** 一次跑法的时间上限（秒）：到点没结束就是 timedOut，不是失败。限度那句话从这个数拼出来 */
export const PLAYTEST_SECONDS = 60;

export function runPolicy(plan: GamePlan, policy: PolicyKey, seconds = PLAYTEST_SECONDS, seed = PLAYTEST_DEFAULT_SEED): PlaytestRun {
  const tick = 1 / 60;
  const inputOf = makePolicySource(policy, plan, lcg(seed));
  let state = initialState(plan);
  let timedOut = true;
  for (let elapsed = 0; elapsed < seconds; elapsed += tick) {
    state = step(plan, state, inputOf(state), tick);
    if (state.status !== "playing") {
      timedOut = false;
      break;
    }
  }
  return {
    policy,
    label: POLICY_LABELS[policy],
    status: state.status,
    seconds: Math.round(state.t * 10) / 10,
    damageTaken: state.counters.damageTaken,
    damageDealt: state.counters.damageDealt,
    pickups: state.counters.pickups,
    questsDone: Object.keys(state.questDone).length,
    endX: Math.round(state.px * 10) / 10,
    endY: Math.round(state.py * 10) / 10,
    outcome: state.outcome,
    timedOut,
  };
}

/** 每份报告都自带的限度：RPG 的报告也从这三条起算（界面不用另写一套解释） */
export const PLAYTEST_BASE_LIMITS = [
  "策略是有限的四种走法，不是穷举：0 种通关不等于不可能，1 种通关也不等于好上手。",
  `随机游走用的是定种子（默认 ${PLAYTEST_DEFAULT_SEED}），所以同一份设计两次报告逐字段相同；换种子就是换一次抽样，不是换一套规则。`,
  `时间上限 ${PLAYTEST_SECONDS} 秒：到点没结束只记「跑到时间上限」，不写成失败。`,
] as const;

/** 基础总结：四种走法跑完之后"通没通、有什么毛病"——2D 与 RPG 共用这一份口径 */
function summarize(plan: GamePlan, runs: PlaytestRun[]): {
  winnableBy: number;
  diedFrom: number;
  findings: string[];
} {
  const winnableBy = runs.filter((run) => run.status === "won").length;
  const diedFrom = runs.filter((run) => run.status === "lost").length;
  const judgeable = plan.quests.filter((quest) => quest.judgeable).length;

  const findings: string[] = [];
  if (!plan.playable) findings.push(`这份设计跑不起来：${plan.blockers.join("；") || "原因未列出"}`);
  else if (judgeable === 0) findings.push("没有任何可判定的完成条件，所以这几种走法都不会「通关」——不是难度问题，是任务没连上敌人或物品。");
  else if (winnableBy === 0) {
    findings.push(
      `${runs.length} 种走法里 0 种通关（${diedFrom} 种中途倒下，${runs.length - diedFrom} 种跑到时间上限）。` +
        "这不等于没人能通，但这几种最直接的走法都通不了。",
    );
  } else findings.push(`${runs.length} 种走法里有 ${winnableBy} 种通关，最快 ${Math.min(...runs.filter((r) => r.status === "won").map((r) => r.seconds))} 秒。`);

  const player = plan.player;
  if (player && player.damage === 0) findings.push("玩家没有伤害来源：任何「打倒敌人」类的任务条件在这几种走法里都满足不了。");
  if (runs.some((run) => run.policy === "idle" && run.status === "lost")) {
    findings.push("站着不动就会死：敌人的察觉半径或伤害至少有一项高到「不操作也活不过一会儿」。");
  }
  return { winnableBy, diedFrom, findings };
}

/**
 * 界面旁边那句"这次用的是哪个种子"。它住在模型层而不是两个面板里各写一遍，
 * 是因为这句话的**真值来源必须是报告**：跑完之后输入框还能改，
 * 拿控件里的数当结论就会显示一个没跑过的种子（同一句话在 2D 与 RPG 两个面板上还得各对一次账）。
 */
export function playtestSeedNote(seed: number): string {
  return seed === PLAYTEST_DEFAULT_SEED
    ? `本次用的种子 ${seed}，就是默认那一个：同一份设计再点一次，每个字段都一样。`
    : `本次用的种子 ${seed}，不是默认的 ${PLAYTEST_DEFAULT_SEED}：换种子就是换一次抽样，规则与数值一个字都没动。`;
}

export function playtest(
  plan: GamePlan,
  policies: readonly PolicyKey[] = PLAYTEST_POLICIES,
  seed = PLAYTEST_DEFAULT_SEED,
): PlaytestReport {
  const used = effectiveSeed(seed);
  const runs = policies.map((policy) => runPolicy(plan, policy, PLAYTEST_SECONDS, used));
  const { winnableBy, diedFrom, findings } = summarize(plan, runs);
  return {
    runs,
    winnableBy,
    diedFrom,
    findings,
    limits: [...PLAYTEST_BASE_LIMITS],
    seed: used,
  };
}

/** RPG 的一次跑法：基础读数与 2D 同一份，外加成长读数（等级/经验/过了门的任务） */
export interface RpgPlaytestRun extends PlaytestRun {
  level: number;
  xp: number;
  /** 过了等级门的带门任务名：没到级的完成被 rpgStep 扣住，不许出现在这份清单里 */
  gatedPassed: string[];
}

export interface RpgPlaytestReport extends PlaytestReport {
  runs: RpgPlaytestRun[];
  /** 这几种走法到达过的最高等级（一场没升级就是 1——同样是事实） */
  maxLevel: number;
}

/** 一条带等级门的任务在这一帧之前怎么都不该出现在这里：gate 由 rpgStep 扣，这里只读结果 */
function runPolicyRpg(plan: RpgPlan, policy: PolicyKey, seconds = PLAYTEST_SECONDS, seed = PLAYTEST_DEFAULT_SEED): RpgPlaytestRun {
  const tick = 1 / 60;
  const inputOf = makePolicySource(policy, plan.base, lcg(seed));
  const gated = plan.quests.filter((quest) => quest.requiredLevel > 1);
  let state = initialRpgState(plan);
  let timedOut = true;
  for (let elapsed = 0; elapsed < seconds; elapsed += tick) {
    state = rpgStep(plan, state, inputOf(state.base), tick);
    if (state.base.status !== "playing") {
      timedOut = false;
      break;
    }
  }
  return {
    policy,
    label: POLICY_LABELS[policy],
    status: state.base.status,
    seconds: Math.round(state.base.t * 10) / 10,
    damageTaken: state.base.counters.damageTaken,
    damageDealt: state.base.counters.damageDealt,
    pickups: state.base.counters.pickups,
    questsDone: Object.keys(state.base.questDone).length,
    endX: Math.round(state.base.px * 10) / 10,
    endY: Math.round(state.base.py * 10) / 10,
    outcome: state.base.outcome,
    timedOut,
    level: state.level,
    xp: state.xp,
    gatedPassed: gated.filter((quest) => state.base.questDone[quest.id] !== undefined).map((quest) => quest.name),
  };
}

export function playtestRpg(
  plan: RpgPlan,
  policies: readonly PolicyKey[] = PLAYTEST_POLICIES,
  seed = PLAYTEST_DEFAULT_SEED,
): RpgPlaytestReport {
  const used = effectiveSeed(seed);
  const runs = policies.map((policy) => runPolicyRpg(plan, policy, PLAYTEST_SECONDS, used));
  const { winnableBy, diedFrom, findings } = summarize(plan.base, runs);
  const maxLevel = Math.max(...runs.map((run) => run.level));

  const defaulted = plan.enemyXp.filter((enemy) => enemy.from === "default");
  if (defaulted.length) {
    findings.push(
      `${defaulted.length} 个敌人的经验用的是投影兜底值（作者没写 xpReward）：报告里升到的等级有兜底经验在内，这里不拆分两部分。`,
    );
  }
  const gated = plan.quests.filter((quest) => quest.requiredLevel > 1);
  if (gated.length) {
    const cleared = new Set(runs.flatMap((run) => run.gatedPassed));
    const never = gated.filter((quest) => !cleared.has(quest.name));
    if (never.length) {
      findings.push(
        `带等级门的任务这几种走法一次都没过门：${never
          .map((quest) => `「${quest.name}」要 ${quest.requiredLevel} 级`)
          .join("、")}（跑完时最高 ${maxLevel} 级）。等级不够、还是条件本来就没满足，报告分不开这两种。`,
      );
    }
  }

  return {
    runs,
    winnableBy,
    diedFrom,
    findings,
    maxLevel,
    seed: used,
    limits: [
      ...PLAYTEST_BASE_LIMITS,
      `跑的是 rpgStep——与 HUD、手动试玩同一个函数：经验、升级与等级门都参与判定，不是只跑底层战斗。`,
      `升级曲线是投影常量（下一级要 ${plan.xpBase} + (等级-1)×${plan.xpStep}）：等级高低有这条曲线的份，不是作者数值单独决定的。`,
    ],
  };
}

/** 对话管线的报告：没有"走法"，数的是按引用连线走不走得到 */
export interface StoryPlaytestReport {
  startId: string | null;
  total: number;
  /** 从起点沿选择可达的段数（成环不展开：环里每段只算一次） */
  reachable: number;
  /** 走不到的段落名（报告里点名，不只报个数） */
  unreachableNames: string[];
  /** 可达且没有下一段的：能停下的地方 */
  reachableEndings: number;
  /** 可达但正文为空的：走到会显示「作者没写正文」 */
  reachableEmptyText: number;
  findings: string[];
  limits: string[];
}

export function playtestStory(plan: StoryPlan): StoryPlaytestReport {
  const byId = new Map(plan.beats.map((beat) => [beat.id, beat]));
  const seen = new Set<string>();
  if (plan.playable && plan.startId) {
    const queue = [plan.startId];
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      // 排进来的 id 可能已经不在段落表里（改过的计划：startId 指着删掉的那一段）。
      // 不认它就不能算"可达"——`seen.add(id)` 之前先查，否则 `reachable` 会把一段不存在的对话数进去。
      const beat = byId.get(id);
      if (!beat) continue;
      seen.add(id);
      for (const choice of beat.choices) {
        if (byId.has(choice.to) && !seen.has(choice.to)) queue.push(choice.to);
      }
    }
  }

  const unreachable = plan.beats.filter((beat) => !seen.has(beat.id));
  const reachableEndings = plan.beats.filter((beat) => seen.has(beat.id) && beat.ending).length;
  const reachableEmptyText = plan.beats.filter((beat) => seen.has(beat.id) && beat.textEmpty).length;

  const findings: string[] = [];
  if (!plan.playable) {
    findings.push(`这份设计跑不起来：${plan.blockers.join("；") || "原因未列出"}`);
  } else {
    if (unreachable.length) {
      const names = unreachable.slice(0, 3).map((beat) => `「${beat.name}」`);
      const more = unreachable.length > 3 ? ` 等 ${unreachable.length} 段` : "";
      findings.push(
        `${seen.size}/${plan.beats.length} 段从起点可达：选择连不到的段落播放器永远不会显示（${names.join("、")}${more}）。`,
      );
    } else {
      findings.push(`从起点全部可达（${plan.beats.length} 段）：每一段都有一条选择路线通到。`);
    }
    if (reachableEndings > 0) {
      findings.push(`能停下的段落 ${reachableEndings} 段：走到那里就没有下一段了。`);
    } else {
      findings.push("从起点走到的每一段都有下一段：没有一条路线会停——环之外没有出口（连不到的段落里可能有停点）。");
    }
    if (reachableEmptyText > 0) {
      findings.push(`${reachableEmptyText} 段可达但正文为空：走到会显示「作者没写正文」，与播放器同一句话（不是加载失败）。`);
    }
  }

  return {
    startId: plan.startId,
    total: plan.beats.length,
    reachable: seen.size,
    unreachableNames: unreachable.map((beat) => beat.name),
    reachableEndings,
    reachableEmptyText,
    findings,
    limits: [
      "按引用连线算可达性：数的是「连不连得到」，不是「玩家会不会点、文案有没有问题」——发现毛病那一步（§53 的 Detect bugs）要浏览器与模型，这里没有。",
      "成环不展开：环里每段只算一次，报告不数「绕了几圈」。",
      "没有随机成分：同一份计划两次报告逐字段相同。",
    ],
  };
}
