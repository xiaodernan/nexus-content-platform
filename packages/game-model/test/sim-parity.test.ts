import { describe, expect, it } from "vitest";
import {
  ACTOR_RADIUS,
  ARENA,
  EVENT_CAP,
  MAX_FRAME_SECONDS,
  SIM_NO_PLAYER_OUTCOME,
  XP_PER_KILL_FALLBACK,
  compileGame,
  compileRpg,
  generateGameCode,
  initialRpgState,
  rpgStep,
  rpgSummary,
  simSummary,
  initialState,
  step,
  validateGame,
  xpToNext,
  type GameDocument,
  type GameEntityKind,
  type GameKind,
  type GamePlan,
  type RpgPlan,
  type RpgState,
  type SimState,
} from "../src/index";
import {
  artifactFile,
  canon,
  fieldDiff,
  framesFor,
  loadArtifactEngine,
  replay,
  shippedPlan,
  type ArtifactView,
  type Directive,
  type Frame,
  type Harness,
  type ReplayTrace,
} from "./support/artifact-vm";

/**
 * §85 第十五片：把上一片对 story 链做的那扇门**扩到另外两条链**。
 *
 * 上一片收尾时照实写着"还欠的那半"：`topdown` 与 `rpg` 只有浏览器 scripted 见证
 * （`scripts/game-code-parity.mts`，要 Chrome、要人记得跑）+ 一道"数字由同一处供给"的静态闸。
 * 静态闸证明的是 `RULES.contactCooldown` 这些数**抄自** `sim.ts`，**不证明两边算术相同**——
 * `sim.ts` 的 `step` 改了接触判定而产物 `NexusSim.step` 没跟上，`npm test` 今天照样全绿。
 *
 * 而这两条链的转写同样是**纯逻辑**（`engineSource` 里 `NexusSim` / `NexusRpg` 那一段
 * 一次 `document` / `window` 都不碰——这一句从第十六片起不再只是我量的，`codegen.test.ts` 有一条
 * 静态闸钉着，三条链各扫十个浏览器词），所以它们和 `NexusStory` 一样
 * 能在 `node:vm` 里跑。这一片就是把 `sim.ts` / `rpg.ts` 与产物那两段转写在同一串帧输入下
 * 逐步对账，搬进 `npm test`。
 *
 * 与 story 那一片同一条纪律：**输入流由模型那侧算出来后原样重放给产物**（见 support 里那句注释）。
 * 各算各的会自己把分叉抹平——那是假的绿。
 *
 * 第十六片补的是这一扇门自己的**账本**：上一片收尾时照实在 ROADMAP 里写着"门有牙，但没人知道它
 * 咬到了哪些格子"。十五条线两两比对能全绿，也可以同时**一条规则都没走过**——比如触及里那一记
 * 武器射程，此前的每一条线玩家手里都是空手（`reach = 0`），把它整个抹掉门照样绿。这一句不是推测：
 * 把第十五片那一份 19 条取回工作区，在**模型与转写两侧同时**删掉那一串射程后复跑，仍是 19 全绿
 * （两侧一起错，逐步对账结构上就看不见——读数记在 `docs/EVALUATION.md` 第十六片）。
 * 所以这一片把 `sim.ts` / `rpg.ts` 里每一条
 * 带分支的规则列成清单，逐条写成"过程里出现过这一格"的谓词，读的是 `trace.history`（逐帧的模型状态，
 * 不是只有 `final`），并要求**清单上每一条都至少被一次逐步对账踩过**。没踩到就红，红得指名道姓。
 */

const AT = "2026-01-01T00:00:00.000Z";

interface Spec {
  id: string;
  kind: GameEntityKind;
  name: string;
  stats?: Record<string, number>;
  refs?: { to: string; role?: string }[];
}

function level(name: string, kind: GameKind, specs: Spec[]): GameDocument {
  const document = {
    id: `game_${name}`,
    projectId: null,
    name,
    summary: "为模型↔转写对账摆的战场",
    kind,
    entities: specs.map((spec) => ({
      id: spec.id,
      kind: spec.kind,
      name: spec.name,
      notes: `说明：${spec.name}`,
      tags: ["sim-parity"],
      stats: { ...spec.stats },
      refs: (spec.refs ?? []).map((ref, index) => ({ id: `${spec.id}-ref-${index}`, to: ref.to, role: ref.role ?? "" })),
      updatedAt: AT,
    })),
    createdAt: AT,
    updatedAt: AT,
  } as unknown as GameDocument;
  const issues = validateGame(document);
  if (issues.length) throw new Error(`测试底稿结构校验没过：${issues.map((issue) => issue.message).join("；")}`);
  return document;
}

/** 玩家的伤害读 `attackPower`（不是 `damage`——那个键是敌人用的），投影不替设计编攻击力 */
const PLAYER = { id: "p1", kind: "player" as GameEntityKind, name: "主角", stats: { health: 1000, speed: 300, attackPower: 5, x: 100, y: 100 } };

const simHarness: Harness<SimState, GamePlan> = {
  initial: (plan) => initialState(plan),
  step: (plan, state, input, dt) => step(plan, state, input, dt),
  summary: (_plan, state) => simSummary(state),
  playerAt: (state) => ({ x: state.px, y: state.py }),
  actorAt: (state, _plan, id) => {
    for (const list of [state.enemies, state.items, state.triggers]) {
      const found = list.find((actor) => actor.id === id);
      if (found) return { x: found.x, y: found.y };
    }
    return null;
  },
  eventsAt: (state) => state.events,
};

const rpgHarness: Harness<RpgState, RpgPlan> = {
  initial: (plan) => initialRpgState(plan),
  step: (plan, state, input, dt) => rpgStep(plan, state, input, dt),
  summary: (plan, state) => rpgSummary(plan, state),
  playerAt: (state) => ({ x: state.base.px, y: state.base.py }),
  actorAt: (state, _plan, id) => {
    for (const list of [state.base.enemies, state.base.items, state.base.triggers]) {
      const found = list.find((actor) => actor.id === id);
      if (found) return { x: found.x, y: found.y };
    }
    return null;
  },
  eventsAt: (state) => state.base.events,
};

/** 一跑到底：底稿 → 投影 → 产物 → 逐帧对账。连底稿的投影与那串帧一起交出来，规则清单读的是过程 */
function parity<TState, TPlan>(
  document: GameDocument,
  plan: TPlan,
  harness: Harness<TState, TPlan>,
  engineName: string,
  directives: Directive[],
): { plan: TPlan; frames: Frame[]; trace: ReplayTrace<TState> } {
  const output = generateGameCode(document);
  const engine = loadArtifactEngine<ArtifactView<TState>>(output, engineName);
  const frames = framesFor(harness, plan, directives);
  return { plan, frames, trace: replay(engineName, harness, plan, shippedPlan(output), engine, frames) };
}

interface Case<TState, TPlan> {
  name: string;
  /** 这一串输入用的投影（规则清单要按它读"这一格的判定半径是几"，不手数） */
  plan: TPlan;
  /** 喂给两边重放的那串帧输入：负 dt、跳秒这些规则要的是"确实喂过"而不是"看起来像" */
  frames: Frame[];
  trace: ReplayTrace<TState>;
  /** 这一串输入该走到哪一格；没走到就是空转，比了个寂寞 */
  reached: (final: TState) => string | null;
  /**
   * 这条声称的是"一步都不动"（开局就被拒绝的那一种）。默认那条"状态必须真的动过"的空转闸
   * 对它正好是反的——它的空转形状就是不动。所以下面按这个标记换一句断言，而不是把闸放宽。
   */
  frozen?: boolean;
}

function expectCase<TState>(c: Case<TState, unknown>): void {
  expect(c.trace.divergence, `${c.name}：模型与产物分叉`).toBeNull();
  expect(c.trace.frames, `${c.name}：一帧都没跑`).toBeGreaterThan(0);
  if (c.frozen) {
    expect(c.trace.moved, `${c.name}：这一条声称"被拒绝之后一步都不动"，可模型那侧的状态动过了`).toBe(false);
  } else {
    expect(c.trace.moved, `${c.name}：状态从没动过，对账是空转`).toBe(true);
  }
  expect(c.reached(c.trace.final), `${c.name}：这串输入没走到它声称的那一格`).toBeNull();
}

const walkTo = (to: string, frames: number, dt = 0.05, attack = false): Directive => ({ op: "walk", to, frames, dt, attack });
const idleFor = (frames: number, dt = 0.05, attack = false): Directive => ({ op: "idle", frames, dt, attack });

/**
 * 第十六片的账本：一次逐步对账跑完之后，"这一串里到底走过哪一格"要能被问出来。
 * 读的是 `trace.history`（逐帧的模型状态），不是 `final`——冷却挡住的那一帧、丢最旧事件的那一帧、
 * 夹住边界的那一帧，都只存在于过程里。
 * `radius` / `reach` 是从投影里带出来的判定尺寸：谓词不许手数这两个数。
 */
interface SimView {
  name: string;
  plan: GamePlan;
  frames: Frame[];
  h: SimState[];
  radius: number;
  reach: number;
}
interface RpgView {
  name: string;
  plan: RpgPlan;
  frames: Frame[];
  h: RpgState[];
}

function simRuns(cases: readonly Case<SimState, GamePlan>[]): SimView[] {
  return cases.map((c) => ({
    name: c.name,
    plan: c.plan,
    frames: c.frames,
    h: c.trace.history,
    radius: c.plan.player?.radius ?? 0,
    reach: c.plan.player?.reach ?? 0,
  }));
}
function rpgRuns(cases: readonly Case<RpgState, RpgPlan>[]): RpgView[] {
  return cases.map((c) => ({ name: c.name, plan: c.plan, frames: c.frames, h: c.trace.history }));
}

interface RuleRow<TView> {
  /** 说的是 `sim.ts` / `rpg.ts` 里的哪一条规则，红的时候照着这句话去找那一行 */
  rule: string;
  seen: (r: TView) => boolean;
}

/** 逐帧比着写谓词的那几把小尺子：都从状态里算，不手数 */
const gapOf = (s: SimState, x: number, y: number): number => Math.hypot(s.px - x, s.py - y);
const eventTexts = (h: SimState[]): string => h.flatMap((s) => s.events.map((e) => e.text)).join("｜");
const rpgEventTexts = (h: RpgState[]): string => h.flatMap((s) => s.base.events.map((e) => e.text)).join("｜");

/** 每次真正踩到机关的时刻：`counters.triggersFired` 由不涨变涨的那一帧 */
function fireTimes(r: SimView): number[] {
  const out: number[] = [];
  for (let i = 1; i < r.h.length; i += 1) {
    if (r.h[i]!.counters.triggersFired > r.h[i - 1]!.counters.triggersFired) out.push(r.h[i]!.t);
  }
  return out;
}

/**
 * `readyAt = t + Math.max(cooldown, delay, 1)` 的三个分支各钉一行：
 * 只有那一个数**严格**最大，间隔等于它才算归它决定（并列时说不清是谁在起作用）。
 * 下一帧才结算，所以间隔只会落在 `[chosen, chosen + dt)`，不会更早。
 */
function reArmBy(r: SimView, which: "cooldown" | "delay" | "floor"): boolean {
  const t = r.plan.triggers[0];
  if (!t) return false;
  const chosen = which === "cooldown" ? t.cooldown : which === "delay" ? t.delay : 1;
  const others = which === "cooldown" ? [t.delay, 1] : which === "delay" ? [t.cooldown, 1] : [t.cooldown, t.delay];
  if (chosen <= Math.max(...others)) return false;
  const at = fireTimes(r);
  const dt = r.frames[0]?.dt ?? 0.05;
  return at.some((_, i) => i > 0 && at[i]! - at[i - 1]! >= chosen - 1e-9 && at[i]! - at[i - 1]! < chosen + dt);
}

const SIM_RULES: RuleRow<SimView>[] = [
  { rule: "右边界夹在 arena.width - 玩家半径", seen: (r) => r.h.some((s) => s.px === r.plan.arena.width - r.radius) },
  { rule: "左边界夹在玩家半径", seen: (r) => r.h.some((s) => s.px === r.radius) },
  { rule: "上边界夹在玩家半径（纵轴）", seen: (r) => r.h.some((s) => s.py === r.radius) },
  { rule: "下边界夹在 arena.height - 玩家半径（纵轴）", seen: (r) => r.h.some((s) => s.py === r.plan.arena.height - r.radius) },
  {
    rule: "察觉半径内：敌人朝玩家挪（追击那一支）",
    seen: (r) => {
      for (let i = 1; i < r.h.length; i += 1) {
        for (const before of r.h[i - 1]!.enemies) {
          const after = r.h[i]!.enemies.find((e) => e.id === before.id);
          const design = r.plan.enemies.find((e) => e.id === before.id);
          if (!after || !design || !after.active) continue;
          if ((after.x !== before.x || after.y !== before.y) && gapOf(r.h[i - 1]!, after.x, after.y) <= design.senseRadius) return true;
        }
      }
      return false;
    },
  },
  {
    rule: "察觉半径外：本来跑得动的敌人原地不动（不追击那一支）",
    seen: (r) => {
      for (let i = 1; i < r.h.length; i += 1) {
        for (const before of r.h[i - 1]!.enemies) {
          const after = r.h[i]!.enemies.find((e) => e.id === before.id);
          const design = r.plan.enemies.find((e) => e.id === before.id);
          if (!after || !design || !after.active) continue;
          if (
            design.speed > 0 &&
            after.x === before.x &&
            after.y === before.y &&
            gapOf(r.h[i]!, after.x, after.y) > design.senseRadius &&
            r.h[i]!.t > r.h[i - 1]!.t
          )
            return true;
        }
      }
      return false;
    },
  },
  { rule: "接触伤害结算那一帧（damageTaken 涨）", seen: (r) => r.h.some((s, i) => i > 0 && s.counters.damageTaken > r.h[i - 1]!.counters.damageTaken) },
  {
    rule: "够得着却被接触冷却挡住：那一帧不掉血（readyAt 还在未来、设计伤害非 0）",
    seen: (r) => {
      for (let i = 1; i < r.h.length; i += 1) {
        const cur = r.h[i]!;
        const prev = r.h[i - 1]!;
        if (cur.counters.damageTaken !== prev.counters.damageTaken || cur.t === prev.t) continue;
        for (const e of cur.enemies) {
          const design = r.plan.enemies.find((a) => a.id === e.id);
          if (!design || !e.active || design.damage <= 0) continue;
          if (gapOf(cur, e.x, e.y) <= design.radius + r.radius && e.readyAt > cur.t) return true;
        }
      }
      return false;
    },
  },
  {
    rule: "挥击触及 = 玩家半径 + 武器射程 + 敌人半径：中心够不着、叠上半径够得着",
    seen: (r) => {
      const reach = r.radius + r.reach;
      for (let i = 1; i < r.h.length; i += 1) {
        if (r.h[i]!.counters.attacks === r.h[i - 1]!.counters.attacks) continue;
        for (const e of r.h[i]!.enemies) {
          const design = r.plan.enemies.find((a) => a.id === e.id);
          if (!design) continue;
          const d = gapOf(r.h[i]!, e.x, e.y);
          if (d > reach && d <= reach + design.radius) return true;
        }
      }
      return false;
    },
  },
  {
    rule: "触及里那一记武器射程真的把距离抬起来了（超出贴身那一段仍能打中）",
    seen: (r) => {
      if (r.reach <= 0) return false;
      for (let i = 1; i < r.h.length; i += 1) {
        if (r.h[i]!.counters.attacks === r.h[i - 1]!.counters.attacks) continue;
        if (r.h[i]!.counters.damageDealt === r.h[i - 1]!.counters.damageDealt) continue;
        for (const e of r.h[i]!.enemies) {
          const design = r.plan.enemies.find((a) => a.id === e.id);
          if (!design) continue;
          if (gapOf(r.h[i]!, e.x, e.y) > r.radius + design.radius) return true;
        }
      }
      return false;
    },
  },
  {
    rule: "挥击打空那一支（次数涨、伤害不涨）",
    seen: (r) => r.h.some((s, i) => i > 0 && s.counters.attacks > r.h[i - 1]!.counters.attacks && s.counters.damageDealt === r.h[i - 1]!.counters.damageDealt),
  },
  {
    rule: "挥击命中却没打死（扣血那一步与致死那一步分得开）",
    seen: (r) => r.h.some((s, i) => i > 0 && s.counters.damageDealt > r.h[i - 1]!.counters.damageDealt && s.enemies.every((e) => e.active)),
  },
  { rule: "打到 zero 血：active 由真变假那一格", seen: (r) => r.h.some((s, i) => i > 0 && s.enemies.some((e, k) => !e.active && r.h[i - 1]!.enemies[k]!.active)) },
  {
    rule: "玩家的挥击被攻击冷却挡住（想挥、次数不涨、readyAt 在未来）",
    seen: (r) => r.h.some((s, i) => i > 0 && s.counters.attacks === r.h[i - 1]!.counters.attacks && s.readyAtPlayer > s.t && s.t > r.h[i - 1]!.t),
  },
  { rule: "拾取那一格（pickups 涨、物品不再 active）", seen: (r) => r.h.some((s, i) => i > 0 && s.counters.pickups > r.h[i - 1]!.counters.pickups) },
  {
    rule: "机关首次踩到记进 activated（那句用的是「激活」）",
    seen: (r) => r.h.some((s, i) => i > 0 && Object.keys(s.activated).length > Object.keys(r.h[i - 1]!.activated).length && eventTexts([s]).includes("激活")),
  },
  { rule: "再次踩到走另一个词", seen: (r) => eventTexts(r.h).includes("再次踩到") },
  { rule: "再触发间隔由 cooldown 决定（它严格最大）", seen: (r) => reArmBy(r, "cooldown") },
  { rule: "再触发间隔由 delay 决定（它严格最大）", seen: (r) => reArmBy(r, "delay") },
  { rule: "再触发间隔落进兜底的那个 1（cooldown 与 delay 都不到 1）", seen: (r) => reArmBy(r, "floor") },
  {
    rule: "机关判定只读它自己的半径：走过 (radius, radius+玩家半径] 那圈不算踩到",
    seen: (r) => {
      const t = r.plan.triggers[0];
      if (!t) return false;
      let inBand = false;
      let fired = false;
      for (let i = 1; i < r.h.length; i += 1) {
        const d = gapOf(r.h[i]!, t.x, t.y);
        if (d > t.radius && d <= t.radius + r.radius && r.h[i]!.counters.triggersFired === r.h[i - 1]!.counters.triggersFired) inBand = true;
        if (r.h[i]!.counters.triggersFired > r.h[i - 1]!.counters.triggersFired) fired = true;
      }
      return inBand && fired;
    },
  },
  {
    rule: "任务判定读 goal.kind：defeat 那一支",
    seen: (r) => {
      for (let i = 1; i < r.h.length; i += 1) {
        for (const q of r.plan.quests) {
          if (r.h[i]!.questDone[q.id] === undefined || r.h[i - 1]!.questDone[q.id] !== undefined) continue;
          if (q.goals.some((g) => g.kind === "defeat")) return true;
        }
      }
      return false;
    },
  },
  {
    rule: "任务判定读 goal.kind：collect 那一支",
    seen: (r) => {
      for (let i = 1; i < r.h.length; i += 1) {
        for (const q of r.plan.quests) {
          if (r.h[i]!.questDone[q.id] === undefined || r.h[i - 1]!.questDone[q.id] !== undefined) continue;
          if (q.goals.some((g) => g.kind === "collect")) return true;
        }
      }
      return false;
    },
  },
  {
    rule: "任务判定读 goal.kind：activate 那一支（引用到机关）",
    seen: (r) => {
      for (let i = 1; i < r.h.length; i += 1) {
        for (const q of r.plan.quests) {
          if (r.h[i]!.questDone[q.id] === undefined || r.h[i - 1]!.questDone[q.id] !== undefined) continue;
          if (q.goals.some((g) => g.kind === "activate")) return true;
        }
      }
      return false;
    },
  },
  {
    rule: "赢的条件是「所有可判定的都完成」：两条齐了才判赢",
    seen: (r) => r.plan.quests.filter((q) => q.judgeable).length >= 2 && r.h.some((s) => s.status === "won"),
  },
  {
    rule: "一条可判定的任务都没有就永不判赢（那句 `judgeable.length &&` 的短路）",
    seen: (r) => r.plan.quests.filter((q) => q.judgeable).length === 0 && (r.h.at(-1)?.t ?? 0) > 1 && r.h.every((s) => s.status === "playing"),
  },
  {
    rule: "判定不了的任务不记完成、也不挡赢",
    seen: (r) => {
      const soft = r.plan.quests.find((q) => !q.judgeable);
      return soft !== undefined && r.h.some((s) => s.status === "won" && s.questDone[soft.id] === undefined);
    },
  },
  { rule: "生命归零判负，那句话指得回规则", seen: (r) => r.h.some((s) => s.status === "lost" && (s.outcome ?? "").includes("生命值归零")) },
  { rule: "timeLimit 到点判负，按秒解释", seen: (r) => r.h.some((s) => s.status === "lost" && (s.outcome ?? "").includes("超时")) },
  { rule: "事件流挤到上限：丢弃最旧那一步", seen: (r) => r.h.some((s) => s.events.length === EVENT_CAP) },
  { rule: "一帧最多推进 MAX_FRAME_SECONDS", seen: (r) => r.h.some((s, i) => i > 0 && s.t - r.h[i - 1]!.t === MAX_FRAME_SECONDS) },
  {
    rule: "负 dt 被夹成 0：那一帧时间一格不走",
    seen: (r) => r.frames.some((f) => f.dt < 0) && r.h.some((s, i) => i > 0 && s.t === r.h[i - 1]!.t),
  },
  { rule: "没有玩家：开局就是那句拒绝，不是硬跑", seen: (r) => r.h[0]!.status === "lost" && r.h[0]!.outcome === SIM_NO_PLAYER_OUTCOME },
  {
    rule: "状态不是 playing 之后原样返回同一个对象（不是新建一份）",
    seen: (r) => r.h.some((s, i) => i > 0 && s.status !== "playing" && r.h[i - 1]!.status !== "playing" && s === r.h[i - 1]),
  },
];


const RPG_RULES: RuleRow<RpgView>[] = [
  {
    rule: "打倒敌人发的经验是设计里写的那个值（那句里没有「兜底值」）",
    seen: (r) => rpgEventTexts(r.h).split("｜").some((t) => t.includes("打倒") && t.includes("经验") && !t.includes("兜底值")),
  },
  { rule: "敌人没写 xpReward：走 XP_PER_KILL_FALLBACK 那一句", seen: (r) => rpgEventTexts(r.h).includes("兜底值") },
  { rule: "任务完成发经验那一支（hasXpReward 且大于 0）", seen: (r) => rpgEventTexts(r.h).includes("完成任务") },
  { rule: "等级门把完成扣住（delete questDone 那一句）", seen: (r) => rpgEventTexts(r.h).includes("才能交") },
  {
    rule: "扣住的那一帧底层没停在赢上（撤销之后还要能继续跑）",
    seen: (r) => r.h.some((s, i) => i > 0 && s.base.events.some((e) => e.text.includes("才能交")) && s.base.status === "playing" && r.h[i - 1]!.base.status === "playing"),
  },
  {
    rule: "升到级之后同一格补记完成，并且判成赢",
    seen: (r) => r.h.some((s, i) => i > 0 && Object.keys(s.base.questDone).length > Object.keys(r.h[i - 1]!.base.questDone).length && s.base.status === "won"),
  },
  { rule: "一次发经验连升两级（升级那个 while 的第二圈）", seen: (r) => r.h.some((s, i) => i > 0 && s.level >= r.h[i - 1]!.level + 2) },
  {
    rule: "升级余额结转：升过级那一帧留下的 xp 是超出曲线那部分，不是清零",
    seen: (r) => r.h.some((s, i) => i > 0 && s.level > r.h[i - 1]!.level && s.xp > 0),
  },
  {
    rule: "升级立刻把生命上限加成喂回底层状态",
    seen: (r) => r.h.some((s, i) => i > 0 && s.level > r.h[i - 1]!.level && s.base.health === r.h[i - 1]!.base.health + r.plan.levelBonus.maxHealth),
  },
  {
    rule: "每级的伤害加成进了底层战斗：同一串里出现过两种单发伤害",
    seen: (r) => {
      const perHit = r.h
        .map((s, i) => (i > 0 && s.base.counters.attacks > r.h[i - 1]!.base.counters.attacks ? s.base.counters.damageDealt - r.h[i - 1]!.base.counters.damageDealt : -1))
        .filter((v) => v >= 0);
      return new Set(perHit).size >= 2;
    },
  },
];

describe("topdown 那条链：sim.ts 与产物 NexusSim 逐步对账", () => {
  const cases = (): Case<SimState, GamePlan>[] => {
    const pickupDoc = level("拾取", "2d", [
      PLAYER,
      { id: "i1", kind: "item", name: "药包", stats: { x: 700, y: 100 } },
      { id: "q1", kind: "quest", name: "捡到药包", stats: {}, refs: [{ to: "i1" }] },
    ]);
    const chaseDoc = level("追击", "2d", [
      PLAYER,
      { id: "e1", kind: "enemy", name: "巡逻兵", stats: { health: 999, damage: 2, speed: 160, detectionRange: 900, x: 500, y: 100 } },
    ]);
    const killDoc = level("击杀", "2d", [
      PLAYER,
      { id: "e1", kind: "enemy", name: "沙袋", stats: { health: 12, damage: 0, speed: 0, detectionRange: 0, x: 160, y: 100 } },
      { id: "q1", kind: "quest", name: "打倒沙袋", stats: {}, refs: [{ to: "e1" }] },
    ]);
    const triggerDoc = level("机关", "2d", [
      PLAYER,
      { id: "t1", kind: "trigger", name: "洞口", stats: { radius: 200, cooldown: 1, x: 100, y: 100 } },
    ]);
    // 玩家与敌人中心相距 20：超出玩家那 0 点武器射程，却没超出两个半径之和（16+16）。
    // 触及那一句是 `player.radius + player.reach` 再叠敌人半径，少算任何一项这一格就翻——
    // "挥击打死敌人"那条摆的是贴身距离，两边都够得着，抓不到这个差（变异臂实测惰）。
    const reachDoc = level("空手触及", "2d", [
      PLAYER,
      { id: "e1", kind: "enemy", name: "贴脸的沙袋", stats: { health: 5, damage: 0, speed: 0, detectionRange: 0, x: 120, y: 100 } },
      { id: "q1", kind: "quest", name: "打倒贴脸的沙袋", stats: {}, refs: [{ to: "e1" }] },
    ]);
    const deadDoc = level("倒下", "2d", [
      { ...PLAYER, stats: { ...PLAYER.stats, health: 3 } },
      { id: "e1", kind: "enemy", name: "贴身怪", stats: { health: 999, damage: 2, speed: 0, detectionRange: 900, x: 120, y: 100 } },
    ]);
    const timeoutDoc = level("超时", "2d", [
      PLAYER,
      { id: "e1", kind: "enemy", name: "远处的敌人", stats: { health: 999, damage: 0, speed: 0, detectionRange: 0, x: 1100, y: 700 } },
      { id: "q1", kind: "quest", name: "一秒内打倒他", stats: { timeLimit: 1 }, refs: [{ to: "e1" }] },
    ]);
    const noPlayerDoc = level("没有玩家", "2d", [
      { id: "e1", kind: "enemy", name: "独自巡逻", stats: { health: 4, damage: 1, speed: 100, detectionRange: 200, x: 300, y: 300 } },
    ]);
    // —— 第十六片添的那几张底稿：每一张只为把一条此前没走过的分支踩出来 ——
    // 场上只有玩家：四条边各顶一次，夹的值是不是"扣掉自身半径"那种才量得准
    const edgeDoc = level("只有玩家", "2d", [PLAYER]);
    // 察觉半径外但那敌人本来会跑：上一批底稿里"不追击"全是 speed 0 的木桩，格子过了也证明不了什么
    const senseDoc = level("够不着的追击", "2d", [
      PLAYER,
      { id: "e1", kind: "enemy", name: "远处的追兵", stats: { health: 999, damage: 0, speed: 160, detectionRange: 60, x: 900, y: 400 } },
    ]);
    // 武器是模型里唯一能给玩家"超出贴身"的那一项：不带它，触及里的射程那一项永远乘 0。
    // 相距 90：超出两半径之和（32，空手够不着），落在 32 + 射程 80 之内——只有那一记射程在起作用才打得中。
    const weaponDoc = level("长兵器", "2d", [
      PLAYER,
      { id: "w1", kind: "weapon", name: "长枪", stats: { range: 80 }, refs: [{ to: "p1", role: "装备" }] },
      { id: "e1", kind: "enemy", name: "三步外的沙袋", stats: { health: 12, damage: 0, speed: 0, detectionRange: 0, x: 190, y: 100 } },
    ]);
    // 再触发间隔的三个分支：谁最大就得由谁说了算，并列的写法量不出来
    const delayDoc = level("延迟机关", "2d", [
      PLAYER,
      { id: "t1", kind: "trigger", name: "慢机关", stats: { radius: 90, cooldown: 1, delay: 3, x: 100, y: 100 } },
    ]);
    const slowDoc = level("长冷却机关", "2d", [PLAYER, { id: "t1", kind: "trigger", name: "长冷却", stats: { radius: 200, cooldown: 2, x: 100, y: 100 } }]);
    const fastDoc = level("都不到一秒", "2d", [
      PLAYER,
      { id: "t1", kind: "trigger", name: "快机关", stats: { radius: 200, cooldown: 0.2, delay: 0.1, x: 100, y: 100 } },
    ]);
    // 机关判定只读机关自己的半径：走进 (radius, radius+16] 那一圈应当**不**触发，之后才触发
    const bandDoc = level("触发环带", "2d", [
      { ...PLAYER, stats: { ...PLAYER.stats, speed: 60 } },
      { id: "t1", kind: "trigger", name: "小机关", stats: { radius: 40, cooldown: 1, x: 200, y: 100 } },
    ]);
    // 两条可判定的 + 一条没引用的（判定不了）：赢要等前两条都齐，第三条既不记完成也不挡赢
    const twoQuestDoc = level("两任务", "2d", [
      PLAYER,
      { id: "i1", kind: "item", name: "药包", stats: { x: 700, y: 100 } },
      { id: "e1", kind: "enemy", name: "沙袋", stats: { health: 4, damage: 0, speed: 0, detectionRange: 0, x: 160, y: 100 } },
      { id: "qa", kind: "quest", name: "捡到药包", stats: {}, refs: [{ to: "i1" }] },
      { id: "qb", kind: "quest", name: "打倒沙袋", stats: {}, refs: [{ to: "e1" }] },
      { id: "qc", kind: "quest", name: "听听风声", stats: {}, refs: [] },
    ]);
    const activateQuestDoc = level("踩机关任务", "2d", [
      PLAYER,
      { id: "t1", kind: "trigger", name: "祭坛", stats: { radius: 200, cooldown: 1, x: 400, y: 100 } },
      { id: "q1", kind: "quest", name: "开启祭坛", stats: {}, refs: [{ to: "t1" }] },
    ]);

    return [
      {
        name: "走过去拾取，任务判定跟着完成",
        ...parity(pickupDoc, compileGame(pickupDoc), simHarness, "NexusSim", [walkTo("i1", 60)]),
        reached: (s) =>
          s.counters.pickups === 1 && s.questDone["q1"] !== undefined && s.status === "won"
            ? null
            : `拾取 ${s.counters.pickups} 次、任务 ${JSON.stringify(s.questDone)}、状态 ${s.status}`,
      },
      {
        name: "敌人追击并贴身结算，冷却让它不是每帧都掉血",
        ...parity(chaseDoc, compileGame(chaseDoc), simHarness, "NexusSim", [idleFor(200)]),
        reached: (s) => {
          const hits = s.counters.damageTaken / 2;
          const elapsed = s.t;
          if (hits < 1) return `一次都没打到（damageTaken=${s.counters.damageTaken}）`;
          // CONTACT_COOLDOWN = 1 秒：一秒最多一下，允许一次边界
          if (hits > Math.ceil(elapsed) + 1) return `${elapsed.toFixed(2)} 秒里打了 ${hits} 下，冷却没生效`;
          return null;
        },
      },
      {
        name: "挥击打死敌人：触及判定、扣冷却、倒下与任务",
        ...parity(killDoc, compileGame(killDoc), simHarness, "NexusSim", [walkTo("e1", 10), walkTo("e1", 60, 0.05, true)]),
        reached: (s) => {
          const enemy = s.enemies.find((e) => e.id === "e1");
          if (!enemy || enemy.active) return "沙袋没倒下";
          if (s.counters.attacks < 2) return `只挥了 ${s.counters.attacks} 次：攻击冷却没被检验`;
          if (s.status !== "won") return `敌人倒下了但任务没判成赢（${s.status}）`;
          return null;
        },
      },
      {
        name: "空手站桩挥击：中心够不着、半径叠起来够得着，那一记自身半径两边都要算",
        ...parity(reachDoc, compileGame(reachDoc), simHarness, "NexusSim", [idleFor(20, 0.05, true)]),
        reached: (s) => {
          const enemy = s.enemies.find((e) => e.id === "e1");
          if (!enemy || enemy.active) return "相距 20 的空手挥击没打中：触及里那一记自身半径没被算到";
          if (s.counters.damageDealt === 0) return `敌人倒了却没记账伤害（damageDealt=${s.counters.damageDealt}）`;
          if (s.status !== "won") return `沙袋倒了却没判成赢（${s.status}）`;
          return null;
        },
      },
      {
        name: "反复踩同一个机关：首次记激活、之后记再次踩到",
        ...parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [idleFor(120)]),
        reached: (s) => {
          if (s.counters.triggersFired < 2) return `只踩到 ${s.counters.triggersFired} 次，没走到"再次"那一支`;
          if (s.activated["t1"] === undefined) return "activated 里没记首次激活";
          const texts = s.events.map((e) => e.text).join("｜");
          if (!texts.includes("再次踩到")) return `事件里没有"再次踩到"：${texts}`;
          return null;
        },
      },
      {
        name: "一直往右顶：夹在「场地宽减去自身半径」那一格，不是场地宽",
        ...parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [{ op: "push", dx: 1, dy: 0, frames: 300, dt: 0.05 }]),
        // 上一版这里写的是 `px <= ARENA.width`：那句连"按 0 夹"这种写法都放过去了。
        // 夹的值是 `width - radius`（个体贴边时不该有一半画在场外），就得钉那个值。
        reached: (s) =>
          s.px === ARENA.width - ACTOR_RADIUS ? null : `px=${s.px}，钉的是 ${ARENA.width} - ${ACTOR_RADIUS} = ${ARENA.width - ACTOR_RADIUS}`,
      },
      {
        name: "往左顶：夹在自身半径那一格",
        ...parity(edgeDoc, compileGame(edgeDoc), simHarness, "NexusSim", [{ op: "push", dx: -1, dy: 0, frames: 60, dt: 0.05 }]),
        reached: (s) => (s.px === ACTOR_RADIUS ? null : `px=${s.px}，钉的是自身半径 ${ACTOR_RADIUS}`),
      },
      {
        name: "往上顶：纵轴同样夹在自身半径",
        ...parity(edgeDoc, compileGame(edgeDoc), simHarness, "NexusSim", [{ op: "push", dx: 0, dy: -1, frames: 60, dt: 0.05 }]),
        reached: (s) => (s.py === ACTOR_RADIUS ? null : `py=${s.py}，钉的是自身半径 ${ACTOR_RADIUS}`),
      },
      {
        name: "往下顶：纵轴另一头夹在场地高减自身半径",
        ...parity(edgeDoc, compileGame(edgeDoc), simHarness, "NexusSim", [{ op: "push", dx: 0, dy: 1, frames: 300, dt: 0.05 }]),
        reached: (s) =>
          s.py === ARENA.height - ACTOR_RADIUS ? null : `py=${s.py}，钉的是 ${ARENA.height} - ${ACTOR_RADIUS} = ${ARENA.height - ACTOR_RADIUS}`,
      },
      {
        name: "察觉半径外的追兵：本来跑得动，可它这一步就是不朝玩家挪",
        ...parity(senseDoc, compileGame(senseDoc), simHarness, "NexusSim", [idleFor(60)]),
        reached: (s) => {
          const e = s.enemies.find((a) => a.id === "e1");
          if (!e) return "底稿里的追兵没了";
          if (e.x !== 900 || e.y !== 400) return `它挪到了 (${e.x.toFixed(1)}, ${e.y.toFixed(1)})：察觉半径那道闸没拦住`;
          if (s.t <= 0) return "时间在没走";
          return null;
        },
      },
      {
        name: "长枪把触及抬出贴身：站得远远地挥，那一记射程得算进来",
        ...parity(weaponDoc, compileGame(weaponDoc), simHarness, "NexusSim", [idleFor(60, 0.05, true)]),
        reached: (s) => {
          const e = s.enemies.find((a) => a.id === "e1");
          if (!e || e.active) return `相距 90 的长枪挥击没打死它（damageDealt=${s.counters.damageDealt}）`;
          if (s.counters.attacks < 2) return `只挥了 ${s.counters.attacks} 次`;
          return null;
        },
      },
      {
        name: "机关的再触发间隔由 delay 说了算（它比 cooldown 与 1 都大）",
        ...parity(delayDoc, compileGame(delayDoc), simHarness, "NexusSim", [idleFor(200)]),
        reached: (s) => (s.counters.triggersFired >= 3 ? null : `只踩到 ${s.counters.triggersFired} 次，量不出间隔`),
      },
      {
        name: "机关的再触发间隔由 cooldown 说了算（它比 delay 与 1 都大）",
        ...parity(slowDoc, compileGame(slowDoc), simHarness, "NexusSim", [idleFor(200)]),
        reached: (s) => (s.counters.triggersFired >= 3 ? null : `只踩到 ${s.counters.triggersFired} 次，量不出间隔`),
      },
      {
        name: "两个数都不到一秒：间隔落进兜底的那个 1",
        ...parity(fastDoc, compileGame(fastDoc), simHarness, "NexusSim", [idleFor(200)]),
        reached: (s) => (s.counters.triggersFired >= 3 ? null : `只踩到 ${s.counters.triggersFired} 次，量不出间隔`),
      },
      {
        name: "走进机关环带那一段不算踩到：判定只读机关自己的半径",
        ...parity(bandDoc, compileGame(bandDoc), simHarness, "NexusSim", [walkTo("t1", 200)]),
        reached: (s) => (s.counters.triggersFired >= 1 && s.px > 200 - 40 ? null : `踩到 ${s.counters.triggersFired} 次、px=${s.px}`),
      },
      {
        name: "两条任务齐了才判赢，没引用的那条既不记完成也不挡路",
        ...parity(twoQuestDoc, compileGame(twoQuestDoc), simHarness, "NexusSim", [
          idleFor(20, 0.05, true),
          walkTo("e1", 10),
          walkTo("e1", 40, 0.05, true),
          walkTo("i1", 120),
        ]),
        reached: (s) =>
          s.status === "won" && s.questDone["qa"] !== undefined && s.questDone["qb"] !== undefined && s.questDone["qc"] === undefined
            ? null
            : `状态 ${s.status}、完成表 ${JSON.stringify(s.questDone)}`,
      },
      {
        name: "引用到机关的任务：踩进去那一下就算达成（activate 那一支）",
        ...parity(activateQuestDoc, compileGame(activateQuestDoc), simHarness, "NexusSim", [walkTo("t1", 60)]),
        reached: (s) =>
          s.status === "won" && s.activated["t1"] !== undefined ? null : `状态 ${s.status}、激活表 ${JSON.stringify(s.activated)}`,
      },

      {
        name: "切走再回来：一次跳 5 秒也只推进定步长上限那一格",
        ...parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [{ op: "idle", frames: 1, dt: 5 }]),
        reached: (s) =>
          s.t === MAX_FRAME_SECONDS ? null : `t=${s.t}，没有夹在 ${MAX_FRAME_SECONDS}（那一帧想跳多少就跳多少）`,
      },
      {
        name: "负 dt 不让时间倒退：那一帧 t 一格都不该走",
        ...parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [{ op: "idle", frames: 1, dt: -1 }]),
        reached: (s) => (s.t === 0 ? null : `t=${s.t}，负 dt 把时间拖着倒着走了`),
      },
      {
        name: "站着不动：时间在走，其它都不动",
        ...parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [idleFor(40)]),
        reached: (s) =>
          s.t > 0 && s.px === 100 && s.py === 100 && s.counters.damageTaken === 0 ? null : `t=${s.t}、px=${s.px}、掉血 ${s.counters.damageTaken}`,
      },
      {
        name: "血量归零就输，那句拒绝指得回规则",
        ...parity(deadDoc, compileGame(deadDoc), simHarness, "NexusSim", [idleFor(120)]),
        reached: (s) =>
          s.status === "lost" && s.outcome !== null && s.outcome.includes("生命值归零")
            ? null
            : `状态 ${s.status}、结果 ${String(s.outcome)}`,
      },
      {
        name: "任务超时：timeLimit 按秒解释，到点判负",
        ...parity(timeoutDoc, compileGame(timeoutDoc), simHarness, "NexusSim", [idleFor(60)]),
        reached: (s) =>
          s.status === "lost" && s.outcome !== null && s.outcome.includes("超时") ? null : `状态 ${s.status}、结果 ${String(s.outcome)}`,
      },
      {
        name: "没有玩家实体：开局就是那句拒绝，往后一步都不该假装在跑",
        ...parity(noPlayerDoc, compileGame(noPlayerDoc), simHarness, "NexusSim", [idleFor(20), { op: "push", dx: 1, dy: 1, frames: 20, dt: 0.05, attack: true }]),
        reached: (s) =>
          s.status === "lost" && s.outcome === SIM_NO_PLAYER_OUTCOME && s.px === ARENA.width / 2 && s.py === ARENA.height / 2
            ? null
            : `状态 ${s.status}、结果 ${String(s.outcome)}、px=${s.px}`,
        frozen: true,
      },
      {
        name: "长跑挤满事件上限：丢弃最旧那一步两边丢的是同一条",
        ...parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [idleFor(1200)]),
        reached: (s) => (s.events.length === EVENT_CAP ? null : `事件堆到 ${s.events.length} 条，没挤到上限 ${EVENT_CAP}`),
      },
    ];
  };

  const built = cases();
  for (const c of built) {
    it(`${c.name}——与产物逐步吻合（分叉会指出是第几帧、哪一格）`, () => expectCase(c));
  }

  /**
   * 这一条才是第十六片本身。上一片的门证明的是"两边跑出来一样"，可它不回答"这一样是**哪些规则**上的一样"：
   * 十五条线可以同时全绿、同时没碰过武器射程那一项（那时每一条线的玩家都是空手）。
   * 清单从 `sim.ts` 的分支来，一条一条问"过程里出现过吗"；没出现过就红，并点名是哪一条、该由哪一串输入去走。
   */
  it(`规则清单：${SIM_RULES.length} 条里每一条都至少被一次逐步对账踩过`, () => {
    const runs = simRuns(built);
    const missed = SIM_RULES.map((row) => ({ row, hit: runs.filter((r) => row.seen(r)).map((r) => r.name) })).filter((x) => x.hit.length === 0);
    expect(missed.map((m) => `${m.row.rule}（哪一串输入都没走过这一格）`).join("；"), `${missed.length} / ${SIM_RULES.length} 条规则从没被踩过`).toBe("");
  });

  it("事件上限真的被挤到过（不挤就没人检验过丢弃那一步）", () => {
    const long = built.find((c) => c.name.startsWith("长跑"));
    if (!long) throw new Error("这批线里没有以「长跑」开头的那条，上限这条见证就悬空了");
    expect(long.trace.maxEvents, `只堆到 ${long.trace.maxEvents} 条，从没到 ${EVENT_CAP}`).toBe(EVENT_CAP);
  });

  it("比较用的是值而不是键序：两边键序不同不该谎报分叉", () => {
    const a = { x: 1, y: [1, 2], z: { p: 1, q: 2 } };
    const b = { z: { q: 2, p: 1 }, y: [1, 2], x: 1 };
    expect(canon(a)).toBe(canon(b));
    expect(fieldDiff(a, { x: 1, y: [1, 2], z: { p: 1 }, w: 0 })).toContain("产物独有 [w]");
  });

  it("产物代码里没有作者写的字：对账跑的是模板，不是内容", () => {
    const document = level("字串ZZZ战场", "2d", [
      PLAYER,
      { id: "e1", kind: "enemy", name: "名字ZZZ怪", stats: { health: 3, damage: 1, speed: 0, detectionRange: 0, x: 400, y: 400 } },
    ]);
    const output = generateGameCode(document);
    expect(artifactFile(output, "engine.js"), "引擎里出现了作者写的敌人名字").not.toContain("名字ZZZ怪");
    expect(artifactFile(output, "plan.json")).toContain("名字ZZZ怪");
  });
});

describe("rpg 那条链：rpg.ts 与产物 NexusRpg 逐步对账", () => {
  const growthDoc = level("升级", "rpg-prototype", [
    PLAYER,
    { id: "e1", kind: "enemy", name: "经验包", stats: { health: 12, damage: 0, speed: 0, detectionRange: 0, x: 160, y: 100, xpReward: 40 } },
    { id: "e2", kind: "enemy", name: "另一个经验包", stats: { health: 12, damage: 0, speed: 0, detectionRange: 0, x: 100, y: 300, xpReward: 40 } },
  ]);
  // 经验特意给成 25：`xpToNext(1)=20`、`xpToNext(2)=35`，打完正好停在 **2 级**——
  // 任务的 requiredLevel 也是 2，那条 `requiredLevel <= level` 的等号才被真的踩到。
  // 上一版这里给 60 点，一路升到 3 级，等号那一格从没进过（变异臂因此是惰的）。
  const gatedDoc = level("等级门", "rpg-prototype", [
    PLAYER,
    { id: "t1", kind: "trigger", name: "祭坛", stats: { radius: 220, cooldown: 1, x: 100, y: 100 } },
    { id: "e1", kind: "enemy", name: "经验包", stats: { health: 12, damage: 0, speed: 0, detectionRange: 0, x: 700, y: 100, xpReward: 25 } },
    { id: "q1", kind: "quest", name: "开启祭坛", stats: { requiredLevel: 2, xpReward: 5 }, refs: [{ to: "t1" }] },
  ]);
  // 与 gatedDoc 只差 `requiredLevel` 那一个数：留给下面那句反证用
  const ungatedTwinDoc = level("等级门去门", "rpg-prototype", [
    PLAYER,
    { id: "t1", kind: "trigger", name: "祭坛", stats: { radius: 220, cooldown: 1, x: 100, y: 100 } },
    { id: "e1", kind: "enemy", name: "经验包", stats: { health: 12, damage: 0, speed: 0, detectionRange: 0, x: 700, y: 100, xpReward: 25 } },
    { id: "q1", kind: "quest", name: "开启祭坛", stats: { xpReward: 5 }, refs: [{ to: "t1" }] },
  ]);
  // 敌人没写 xpReward：成长层只能用那个兜底值，而且 10 点不够一级——升级那一步在这条线里不会发生
  const fallbackDoc = level("兜底经验", "rpg-prototype", [
    PLAYER,
    { id: "e1", kind: "enemy", name: "没写经验的怪", stats: { health: 4, damage: 0, speed: 0, detectionRange: 0, x: 140, y: 100 } },
  ]);
  // 一发打死、一次给 60 点：`xpToNext(1)=20`、`xpToNext(2)=35`，同一帧里那个 while 得转两圈
  const doubleDoc = level("连升", "rpg-prototype", [
    PLAYER,
    { id: "e1", kind: "enemy", name: "厚礼", stats: { health: 1, damage: 0, speed: 0, detectionRange: 0, x: 140, y: 100, xpReward: 60 } },
  ]);

  const fallbackPlan = compileRpg(fallbackDoc);
  const doublePlan = compileRpg(doubleDoc);

  const cases: Case<RpgState, RpgPlan>[] = [
    {
      name: "打倒敌人发经验、攒够升级：每级加成喂回底层战斗",
      ...parity(growthDoc, compileRpg(growthDoc), rpgHarness, "NexusRpg", [
        walkTo("e1", 10),
        walkTo("e1", 40, 0.05, true),
        walkTo("e2", 10),
        walkTo("e2", 40, 0.05, true),
      ]),
      reached: (s) => {
        if (s.levelUps < 2) return `只升了 ${s.levelUps} 级：升级曲线那一步没走到`;
        if (s.level !== 1 + s.levelUps) return `等级 ${s.level} 与升级次数 ${s.levelUps} 不是一对`;
        const alive = s.base.enemies.filter((e) => e.active).length;
        if (alive !== 0) return `${alive} 个敌人还站着`;
        return null;
      },
    },
    {
      name: "等级门：条件满足了但级不够，先扣住；升上去之后同一帧补记",
      ...parity(gatedDoc, compileRpg(gatedDoc), rpgHarness, "NexusRpg", [
        idleFor(40),
        walkTo("e1", 10),
        walkTo("e1", 60, 0.05, true),
        idleFor(20),
      ]),
      reached: (s) => {
        const texts = s.base.events.map((e) => e.text).join("｜");
        if (!texts.includes("才能交")) return `事件里没有"扣住"那一句：${texts}`;
        if (s.level < 2) return `没升到 2 级（${s.level}），等级放开那一格没走到`;
        if (s.base.status !== "won") return `级够了却没判成赢（${s.base.status}）`;
        return null;
      },
    },
    {
      name: "敌人没写经验：发的是那个兜底值，而且攒不够一级",
      ...parity(fallbackDoc, fallbackPlan, rpgHarness, "NexusRpg", [walkTo("e1", 10), walkTo("e1", 40, 0.05, true)]),
      reached: (s) => {
        const texts = s.base.events.map((e) => e.text).join("｜");
        if (!texts.includes("兜底值")) return `那句里没有"兜底值"：${texts}`;
        if (s.xp !== XP_PER_KILL_FALLBACK) return `经验是 ${s.xp}，钉的是兜底值 ${XP_PER_KILL_FALLBACK}`;
        if (s.level !== 1) return `兜底 ${XP_PER_KILL_FALLBACK} 点不够一级的 ${xpToNext(fallbackPlan, 1)} 点，却升到了 ${s.level} 级`;
        return null;
      },
    },
    {
      name: "一发厚礼连升两级：升级那个 while 转得不只一圈，余额照结转",
      ...parity(doubleDoc, doublePlan, rpgHarness, "NexusRpg", [walkTo("e1", 10), walkTo("e1", 40, 0.05, true)]),
      reached: (s) => {
        const gift = doublePlan.enemyXp[0]?.xp ?? 0;
        const need = xpToNext(doublePlan, 1) + xpToNext(doublePlan, 2);
        if (s.level !== 3) return `等级是 ${s.level}，一发 ${gift} 点该走两圈曲线（${need} 点）到 3 级`;
        if (s.levelUps !== 2) return `升级次数 ${s.levelUps}，与 1→3 不是一对`;
        if (s.xp !== gift - need) return `余额 ${s.xp}，该是 ${gift} - ${need}`;
        return null;
      },
    },
  ];

  for (const c of cases) {
    it(`${c.name}——与产物逐步吻合（含升级派生伤害与等级门那次回滚）`, () => expectCase(c));
  }

  it(`rpg 规则清单：${RPG_RULES.length} 条里每一条都至少被一次逐步对账踩过`, () => {
    const runs = rpgRuns(cases);
    const missed = RPG_RULES.map((row) => ({ row, hit: runs.filter((r) => row.seen(r)).map((r) => r.name) })).filter((x) => x.hit.length === 0);
    expect(missed.map((m) => `${m.row.rule}（哪一串输入都没走过这一格）`).join("；"), `${missed.length} / ${RPG_RULES.length} 条规则从没被踩过`).toBe("");
  });

  /**
   * 清单里"扣住的那一帧底层没停在赢上"那行只看得见结果（那一帧是 playing），
   * 看不见"如果没有那句撤销，它本来会是什么"。所以补一句反证：
   * 同一张底稿、同一个机关、同一条任务，只差 `requiredLevel` 那一个数——去掉它，第一帧底层就宣布通关。
   * 那句撤销不是摆设，这条才算钉住。
   */
  it("等级门那句撤销是活的：去掉 requiredLevel 的同底稿，同一帧底层直接判赢", () => {
    const twinPlan = compileGame(ungatedTwinDoc);
    const twin = step(twinPlan, initialState(twinPlan), { dx: 0, dy: 0, attack: false }, 0.05);
    const gatedCase = cases.find((c) => c.name.startsWith("等级门"));
    if (!gatedCase) throw new Error("rpg 那几条线里没有以「等级门」开头的那条，这句反证就悬空了");
    const gated = gatedCase.trace.history[1];
    if (!gated) throw new Error("等级门那条线连第 1 帧都没跑出来");
    expect(twin.status, `去掉门的那一份没在第一帧判赢，反证不成立：${String(twin.outcome)}`).toBe("won");
    expect(gated.base.status, "带门的那一份第一帧却是赢——那句撤销没跑到，或者门根本没扣住").toBe("playing");
    expect(gated.base.events.some((e) => e.text.includes("才能交")), "带门的那一份第一帧没写出扣住那句").toBe(true);
  });

  it("成长那一段真的走到过升级与扣住（不走到就是空转）", () => {
    const byName = (prefix: string): Case<RpgState, RpgPlan> => {
      const found = cases.find((c) => c.name.startsWith(prefix));
      if (!found) throw new Error(`rpg 那几条线里没有以「${prefix}」开头的那条，空转闸就悬空了`);
      return found;
    };
    expect(byName("打倒敌人").trace.final.level, "升级那一条没把等级抬起来").toBeGreaterThan(1);
    expect(byName("等级门").trace.final.base.events.some((e) => e.text.includes("才能交")), "等级门那一条没写出扣住那句").toBe(true);
  });
});
