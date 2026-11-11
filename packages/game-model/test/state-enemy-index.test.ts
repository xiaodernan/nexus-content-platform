import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  addEntity,
  buildPlanIndices,
  compileGame,
  createGame,
  entitiesOfKind,
  enemyByIdOf,
  getPlanIndices,
  initialRpgState,
  initialState,
  measureEnemyLookups,
  setStat,
  step,
  type GameDocument,
  type GamePlan,
  type SimActor,
  type SimInput,
} from "../src/index";
import { compileRpg, rpgStep } from "../src/rpg";
import { runPolicy } from "../src/playtest";

/**
 * §PERF-2：把打在**逐帧 state** 上的 `enemies.find`（O(E)）按 plan 缓存的下标降成 O(1)。
 *
 * 与 PERF-1 同根因、不同落点：PERF-1 缓存 plan 侧 design 索引；本片缓存"敌人 id → 在
 * plan.enemies / state.enemies 里的下标"，作用于 rpg.ts 经验结算、playtest.ts nearest、
 * sim.ts 任务判定三处每帧的 `state.enemies.find`。顺序不变量：`state.enemies[i]` 恒对应
 * `plan.enemies[i]`（initialState/step 只就地改 active/坐标，从不重排增删）。
 *
 * 判据**不拿墙钟量毫秒**（抢资源机必 flaky），而是三层确定性证据：
 * ① `enemyByIdOf` 单测：索引内容正确、同序 O(1) 零 find（Proxy 拦截）、乱序守护回退、未知 id 无 find；
 * ② `measureEnemyLookups` 可注入计数：真实 rpgStep / runPolicy 长跑后 `hits>0` 且 `findFallbacks===0`
 *    ——证明 O(1) 路径在真实循环里始终生效、顺序不变量整场不被破坏；
 * ③ 源码静态判据：三处调用点都改走 `enemyByIdOf`、旧 `state.enemies.find` 形态不再出现（变异臂有牙）。
 * fixture 强制 ≥6 个敌人——E=1 时 find≡O(1) 会假绿（§FE-5 教训）。
 */

const idle: SimInput = { dx: 0, dy: 0, attack: false };
const tick = 1 / 60;
const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function docWithManyEnemies(count = 7): GameDocument {
  let doc: GameDocument = createGame("PERF-2 多敌人");
  for (let i = 1; i < count; i += 1) doc = addEntity(doc, { kind: "enemy", name: `敌${i}` });
  // 给敌人错开坐标/速度，避免重叠让追击行为退化（parity 是"与改前逐字段相同"，不依赖具体数值）
  entitiesOfKind(doc, "enemy").forEach((enemy, i) => {
    doc = write(doc, enemy.id, "speed", i % 2);
    doc = write(doc, enemy.id, "senseRadius", 0);
  });
  return doc;
}

function planWithManyEnemies(count = 7): GamePlan {
  return compileGame(docWithManyEnemies(count));
}

function write(doc: GameDocument, id: string, key: string, value: number): GameDocument {
  const r = setStat(doc, id, key, value);
  if (r.reason) throw new Error(r.reason);
  return r.document;
}

/** 给数组套 Proxy，记录 find/findIndex 是否被调用（确定性、零墙钟）。 */
function trackFinds(actors: SimActor[]): { proxy: SimActor[]; calls: () => number } {
  let calls = 0;
  const proxy = new Proxy(actors, {
    get(target, prop, receiver) {
      if (prop === "find" || prop === "findIndex") calls += 1;
      return Reflect.get(target, prop, receiver);
    },
  });
  return { proxy, calls: () => calls };
}

describe("state 敌人 O(1) 下标索引（§PERF-2，计数缝 + Proxy + 顺序不变量 + 静态判据）", () => {
  it("fixture 真有 ≥6 个敌人（E=1 时 find≡O(1)，判据会假绿）", () => {
    expect(planWithManyEnemies().enemies.length).toBeGreaterThanOrEqual(6);
  });

  it("enemyIndexById 内容正确：每个 id 映射到 state.enemies 里的同一位置", () => {
    const plan = planWithManyEnemies();
    const idx = buildPlanIndices(plan);
    const state = initialState(plan);
    expect(idx.enemyIndexById.size).toBe(plan.enemies.length);
    plan.enemies.forEach((enemy, at) => {
      expect(idx.enemyIndexById.get(enemy.id)).toBe(at);
      expect(enemyByIdOf(state.enemies, idx, enemy.id)).toBe(state.enemies[at]);
    });
  });

  it("同序路径零 find：Proxy 拦截证明 O(1) 命中不触碰 Array.find/findIndex", () => {
    const plan = planWithManyEnemies();
    const idx = buildPlanIndices(plan);
    const state = initialState(plan);
    const { proxy, calls } = trackFinds(state.enemies);
    for (const enemy of plan.enemies) {
      expect(enemyByIdOf(proxy, idx, enemy.id)).toBe(state.enemies[idx.enemyIndexById.get(enemy.id)!]);
    }
    expect(calls()).toBe(0);
  });

  it("未知 id 不触发 find、返回 undefined（与 Array.find 语义一致）", () => {
    const plan = planWithManyEnemies();
    const idx = buildPlanIndices(plan);
    const { proxy, calls } = trackFinds(initialState(plan).enemies);
    expect(enemyByIdOf(proxy, idx, "不存在")).toBeUndefined();
    expect(calls()).toBe(0);
  });

  it("守护：state.enemies 被重排（顺序不变量破坏）→ 回退 find，仍返回正确 actor", () => {
    const plan = planWithManyEnemies();
    const idx = buildPlanIndices(plan);
    const reordered = [...initialState(plan).enemies].reverse();
    const { proxy, calls } = trackFinds(reordered);
    const target = plan.enemies[2]!; // fixture 保证 ≥6 个敌人
    const hit = enemyByIdOf(proxy, idx, target.id); // 下标处现在是别的敌人 → 必须回退 find
    expect(hit?.id).toBe(target.id);
    expect(calls()).toBeGreaterThan(0);
  });

  it("真实 rpgStep 长跑：O(1) 命中 > 0 且 find 回退恒为 0（注入计数，非墙钟）", () => {
    const rpg = compileRpg(docWithManyEnemies());
    let state = initialRpgState(rpg);
    const attack: SimInput = { dx: 0.3, dy: 0.1, attack: true };
    const { result, meter } = measureEnemyLookups(() => {
      let s = state;
      for (let i = 0; i < 600; i += 1) s = rpgStep(rpg, s, attack, tick);
      return s;
    });
    state = result;
    expect(state.base.t).toBeGreaterThan(0);
    expect(meter.hits).toBeGreaterThan(0); // 经验结算段确实走 O(1) 命中
    expect(meter.findFallbacks).toBe(0); // 整场顺序不变量不被破坏，从不退化成 find
  });

  it("真实 runPolicy（nearest 每帧查敌人）长跑：O(1) 命中 > 0 且 find 回退为 0", () => {
    const plan = planWithManyEnemies();
    const { result, meter } = measureEnemyLookups(() => runPolicy(plan, "beeline", 10));
    expect(result).toBeDefined();
    expect(meter.hits).toBeGreaterThan(0); // nearest 的 plan.enemies.map 走 O(1) 命中
    expect(meter.findFallbacks).toBe(0);
  });

  it("整场 14400 帧 state.enemies 恒与 plan.enemies 同序同长（O(1) 前提不被 step 破坏）", () => {
    const plan = planWithManyEnemies();
    const idx = buildPlanIndices(plan);
    let state = initialState(plan);
    for (let i = 0; i < 14400; i += 1) {
      expect(state.enemies.length).toBe(plan.enemies.length);
      plan.enemies.forEach((enemy, at) => expect(state.enemies[at]!.id).toBe(enemy.id));
      // 每帧用索引读回必须拿回正确 actor（缓存索引整帧有效）
      for (const enemy of plan.enemies) expect(enemyByIdOf(state.enemies, idx, enemy.id)?.id).toBe(enemy.id);
      state = step(plan, state, idle, tick);
    }
  });

  it("getPlanIndices 走默认单例：同一 plan 反复取回同一索引，不重复构造", () => {
    const plan = planWithManyEnemies();
    expect(getPlanIndices(plan)).toBe(getPlanIndices(plan));
    expect(getPlanIndices(planWithManyEnemies())).not.toBe(getPlanIndices(plan));
  });
});

/**
 * 静态判据（对标 FE-4/5/6）：三处调用点都改走 `enemyByIdOf`，旧的
 * `state.enemies.find` / `state.base.enemies.find` 形态不再出现。变异臂把任一处改回 find 就会红。
 * 用字符码构造被搜的脆弱子串，避免判据源码自身触发误判（FE-6 第 10 门教训）。
 */
describe("PERF-2 调用点静态判据（改动真实落到了三处）", () => {
  const rpg = readFileSync(join(srcDir, "rpg.ts"), "utf8");
  const playtest = readFileSync(join(srcDir, "playtest.ts"), "utf8");
  const sim = readFileSync(join(srcDir, "sim.ts"), "utf8");

  it("rpg.ts 两处经验结算走 enemyByIdOf，不再有 state/next.base.enemies.find", () => {
    expect(rpg).toContain("enemyByIdOf(state.base.enemies, enemyIdx, enemy.id)");
    expect(rpg).toContain("enemyByIdOf(next.base.enemies, enemyIdx, enemy.id)");
    expect(rpg).not.toMatch(/\b(?:state|next)\.base\.enemies\.find\s*\(/);
  });

  it("playtest.ts nearest 走 enemyByIdOf，不再有 state.enemies.find", () => {
    expect(playtest).toContain("enemyByIdOf(state.enemies, enemyIdx, enemy.id)");
    expect(playtest).not.toMatch(/\bstate\.enemies\.find\s*\(/);
  });

  it("sim.ts 任务判定的 enemies 分支走 enemyByIdOf（items 分支已在 §PERF-3 同步 O(1) 化）", () => {
    expect(sim).toContain("enemyByIdOf(next.enemies, idx, goal.actorId)");
    expect(sim).not.toMatch(/\bnext\.enemies\.find\s*\(/);
    // §PERF-3 收口了 PERF-2 当时"诚实保留"的 items.find：此处不再是范围最小快照，
    // 改为断言 items 也走下标（与 state-item-index.test.ts 的静态判据同口径，两份判据不打架）。
    expect(sim).toContain("itemByIdOf(next.items, idx, goal.actorId)");
    expect(sim).not.toMatch(/\bnext\.items\.find\s*\(/);
  });
});
