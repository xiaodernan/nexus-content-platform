import { initialState, step, type SimInput, type SimState } from "./sim";
import type { GamePlan } from "./play";

/**
 * §53 的可确定那一半：不启动浏览器、不靠人拿键盘试，就把这份设计跑几遍，
 * 回答"按这些走法能不能通、要多久、在哪死"。
 *
 * 为什么用脚本而不是"AI 玩"：脚本是确定的，所以"这一版比上一版难"这种话才有意义。
 * 需要模型的自动改法（§53 的 Fix 那一格）不在这里，那是 §52 编排的事。
 *
 * 三条限度：
 * - 策略是**有限的几种走法**，不是穷举。"这些走法都通不了"不等于"没人能通"，
 *   报告里就是这么写的；反过来"有一条通了"也不等于"好上手"。
 * - 带随机性的游走用**定种子**的线性同余：同一份计划两次跑出来的报告逐字节相同，
 *   否则一次红无从复现。
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

export function runPolicy(plan: GamePlan, policy: PolicyKey, seconds = 60, seed = 7): PlaytestRun {
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

export function playtest(plan: GamePlan, policies: readonly PolicyKey[] = ["idle", "beeline", "flee", "wander"]): PlaytestReport {
  const runs = policies.map((policy) => runPolicy(plan, policy));
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

  return {
    runs,
    winnableBy,
    diedFrom,
    findings,
    limits: [
      "策略是有限的四种走法，不是穷举：0 种通关不等于不可能，1 种通关也不等于好上手。",
      "随机游走用的是定种子（默认 7），所以同一份设计两次报告逐字段相同；换种子就是换一次抽样，不是换一套规则。",
      "时间上限 60 秒：到点没结束只记「跑到时间上限」，不写成失败。",
    ],
  };
}
