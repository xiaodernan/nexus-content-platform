import { describe, expect, it } from "vitest";
import {
  ARENA,
  EVENT_CAP,
  MAX_FRAME_SECONDS,
  SIM_NO_PLAYER_OUTCOME,
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
 * 一次 `document` / `window` 都不碰，实测：整个函数体里 0 次），所以它们和 `NexusStory` 一样
 * 能在 `node:vm` 里跑。这一片就是把 `sim.ts` / `rpg.ts` 与产物那两段转写在同一串帧输入下
 * 逐步对账，搬进 `npm test`。
 *
 * 与 story 那一片同一条纪律：**输入流由模型那侧算出来后原样重放给产物**（见 support 里那句注释）。
 * 各算各的会自己把分叉抹平——那是假的绿。
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

/** 一跑到底：底稿 → 投影 → 产物 → 逐帧对账 */
function parity<TState, TPlan>(
  document: GameDocument,
  plan: TPlan,
  harness: Harness<TState, TPlan>,
  engineName: string,
  directives: Directive[],
): ReplayTrace<TState> {
  const output = generateGameCode(document);
  const engine = loadArtifactEngine<ArtifactView<TState>>(output, engineName);
  const frames = framesFor(harness, plan, directives);
  return replay(engineName, harness, plan, shippedPlan(output), engine, frames);
}

interface Case<TState> {
  name: string;
  trace: ReplayTrace<TState>;
  /** 这一串输入该走到哪一格；没走到就是空转，比了个寂寞 */
  reached: (final: TState) => string | null;
  /**
   * 这条声称的是"一步都不动"（开局就被拒绝的那一种）。默认那条"状态必须真的动过"的空转闸
   * 对它正好是反的——它的空转形状就是不动。所以下面按这个标记换一句断言，而不是把闸放宽。
   */
  frozen?: boolean;
}

function expectCase<TState>(c: Case<TState>): void {
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

describe("topdown 那条链：sim.ts 与产物 NexusSim 逐步对账", () => {
  const cases = (): Case<SimState>[] => {
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

    return [
      {
        name: "走过去拾取，任务判定跟着完成",
        trace: parity(pickupDoc, compileGame(pickupDoc), simHarness, "NexusSim", [walkTo("i1", 60)]),
        reached: (s) =>
          s.counters.pickups === 1 && s.questDone["q1"] !== undefined && s.status === "won"
            ? null
            : `拾取 ${s.counters.pickups} 次、任务 ${JSON.stringify(s.questDone)}、状态 ${s.status}`,
      },
      {
        name: "敌人追击并贴身结算，冷却让它不是每帧都掉血",
        trace: parity(chaseDoc, compileGame(chaseDoc), simHarness, "NexusSim", [idleFor(200)]),
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
        trace: parity(killDoc, compileGame(killDoc), simHarness, "NexusSim", [walkTo("e1", 10), walkTo("e1", 60, 0.05, true)]),
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
        trace: parity(reachDoc, compileGame(reachDoc), simHarness, "NexusSim", [idleFor(20, 0.05, true)]),
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
        trace: parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [idleFor(120)]),
        reached: (s) => {
          if (s.counters.triggersFired < 2) return `只踩到 ${s.counters.triggersFired} 次，没走到"再次"那一支`;
          if (s.activated["t1"] === undefined) return "activated 里没记首次激活";
          const texts = s.events.map((e) => e.text).join("｜");
          if (!texts.includes("再次踩到")) return `事件里没有"再次踩到"：${texts}`;
          return null;
        },
      },
      {
        name: "一直往右顶：夹在场地边上，越顶越不越界",
        trace: parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [{ op: "push", dx: 1, dy: 0, frames: 300, dt: 0.05 }]),
        reached: (s) => (s.px <= ARENA.width ? null : `px=${s.px} 顶穿了场地宽 ${ARENA.width}`),
      },
      {
        name: "切走再回来：一次跳 5 秒也只推进定步长上限那一格",
        trace: parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [{ op: "idle", frames: 1, dt: 5 }]),
        reached: (s) =>
          s.t === MAX_FRAME_SECONDS ? null : `t=${s.t}，没有夹在 ${MAX_FRAME_SECONDS}（那一帧想跳多少就跳多少）`,
      },
      {
        name: "负 dt 不让时间倒退：那一帧 t 一格都不该走",
        trace: parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [{ op: "idle", frames: 1, dt: -1 }]),
        reached: (s) => (s.t === 0 ? null : `t=${s.t}，负 dt 把时间拖着倒着走了`),
      },
      {
        name: "站着不动：时间在走，其它都不动",
        trace: parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [idleFor(40)]),
        reached: (s) =>
          s.t > 0 && s.px === 100 && s.py === 100 && s.counters.damageTaken === 0 ? null : `t=${s.t}、px=${s.px}、掉血 ${s.counters.damageTaken}`,
      },
      {
        name: "血量归零就输，那句拒绝指得回规则",
        trace: parity(deadDoc, compileGame(deadDoc), simHarness, "NexusSim", [idleFor(120)]),
        reached: (s) =>
          s.status === "lost" && s.outcome !== null && s.outcome.includes("生命值归零")
            ? null
            : `状态 ${s.status}、结果 ${String(s.outcome)}`,
      },
      {
        name: "任务超时：timeLimit 按秒解释，到点判负",
        trace: parity(timeoutDoc, compileGame(timeoutDoc), simHarness, "NexusSim", [idleFor(60)]),
        reached: (s) =>
          s.status === "lost" && s.outcome !== null && s.outcome.includes("超时") ? null : `状态 ${s.status}、结果 ${String(s.outcome)}`,
      },
      {
        name: "没有玩家实体：开局就是那句拒绝，往后一步都不该假装在跑",
        trace: parity(noPlayerDoc, compileGame(noPlayerDoc), simHarness, "NexusSim", [idleFor(20), { op: "push", dx: 1, dy: 1, frames: 20, dt: 0.05, attack: true }]),
        reached: (s) =>
          s.status === "lost" && s.outcome === SIM_NO_PLAYER_OUTCOME && s.px === ARENA.width / 2 && s.py === ARENA.height / 2
            ? null
            : `状态 ${s.status}、结果 ${String(s.outcome)}、px=${s.px}`,
        frozen: true,
      },
      {
        name: "长跑挤满事件上限：丢弃最旧那一步两边丢的是同一条",
        trace: parity(triggerDoc, compileGame(triggerDoc), simHarness, "NexusSim", [idleFor(1200)]),
        reached: (s) => (s.events.length === EVENT_CAP ? null : `事件堆到 ${s.events.length} 条，没挤到上限 ${EVENT_CAP}`),
      },
    ];
  };

  const built = cases();
  for (const c of built) {
    it(`${c.name}——与产物逐步吻合（分叉会指出是第几帧、哪一格）`, () => expectCase(c));
  }

  it("事件上限真的被挤到过（不挤就没人检验过丢弃那一步）", () => {
    const long = built.find((c) => c.name.startsWith("长跑"));
    if (!long) throw new Error("十二条线里没有以「长跑」开头的那条，上限这条见证就悬空了");
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

  const cases: Case<RpgState>[] = [
    {
      name: "打倒敌人发经验、攒够升级：每级加成喂回底层战斗",
      trace: parity(growthDoc, compileRpg(growthDoc), rpgHarness, "NexusRpg", [
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
      trace: parity(gatedDoc, compileRpg(gatedDoc), rpgHarness, "NexusRpg", [
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
  ];

  for (const c of cases) {
    it(`${c.name}——与产物逐步吻合（含升级派生伤害与等级门那次回滚）`, () => expectCase(c));
  }

  it("成长那一段真的走到过升级与扣住（不走到就是空转）", () => {
    const byName = (prefix: string): Case<RpgState> => {
      const found = cases.find((c) => c.name.startsWith(prefix));
      if (!found) throw new Error(`rpg 那两条线里没有以「${prefix}」开头的那条，空转闸就悬空了`);
      return found;
    };
    expect(byName("打倒敌人").trace.final.level, "升级那一条没把等级抬起来").toBeGreaterThan(1);
    expect(byName("等级门").trace.final.base.events.some((e) => e.text.includes("才能交")), "等级门那一条没写出扣住那句").toBe(true);
  });
});
