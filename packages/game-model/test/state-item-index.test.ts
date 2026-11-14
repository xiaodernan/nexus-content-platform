import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildPlanIndices,
  compileGame,
  getPlanIndices,
  initialState,
  itemByIdOf,
  measureItemLookups,
  step,
  validateGame,
  type GameDocument,
  type GameEntityKind,
  type GamePlan,
  type SimActor,
  type SimInput,
} from "../src/index";

/**
 * §PERF-3：把打在**逐帧 state.items** 上的 `next.items.find`（O(I)）按 plan 缓存的下标降成 O(1)。
 *
 * 收口 ADR-0140（PERF-2）第 104/122-123 行**诚实刻意不做**的那处边界：当时只给 enemies 建
 * id→index，items 分支保留线性 find（"避免为低频路径增索引、范围最小"）。本片复用 PERF-2 已
 * 建好的同构基础设施（WeakMap 单例 + 守护式回退 + 可注入计数缝），把最后这处也 O(1) 化，
 * PERF 序列（PERF-1 plan 索引 / PERF-2 enemies / PERF-3 items）至此完整。
 *
 * 顺序不变量（与 enemies 同构，逐条由读码坐实）：
 * - `initialState`：`items: plan.items.map(actor)`，逐位置构造、`actor` 保留 `source.id`；
 * - `step`：`items: state.items.map(e => ({...e}))`，逐位置克隆，拾取循环只就地改 `active`，
 *   **从不重排、增删**；
 * - `validateGame` 对 `document.entities` 全局 `seen` 查 `duplicate-id`，items 的 id 全局唯一；
 * - 消费侧 `itemById.get(sim.id)`（拾取循环）本就假定下标处 id 对应，与守护式 O(1) 同前提。
 *
 * 判据**不拿墙钟量毫秒**（抢资源机必 flaky），三层确定性证据（镜像 PERF-2）：
 * ① `itemByIdOf` 单测：索引内容正确、同序 O(1) 零 find（Proxy 拦截）、乱序守护回退、未知 id 无 find；
 * ② `measureItemLookups` 可注入计数：真实 `step` 长跑后 `hits>0 && findFallbacks===0`——
 *    证明 items 分支（quest 的 collect goal）在真实循环里 O(1) 生效、不变量整场不破坏；
 * ③ 源码静态判据：`sim.ts` 任务判定 items 分支改走 `itemByIdOf`、旧 `next.items.find` 形态不再出现。
 * fixture 强制 **≥6 个物品**（I=1 时 find≡O(1) 会假绿，§FE-5 教训），且含一个 collect quest
 * 让 items 分支真正执行。
 *
 * 诚实边界：I=物品数，通常个位数，收益是确定性"每帧每次 collect 判定 O(I)→O(1)"，不承诺墙钟；
 * `codegen.ts` 产物转写里的 `items.filter(...)[0]` 非每帧热路径、自包含产物无 WeakMap 缓存概念，
 * 本片刻意不改（改了反破坏"产物是 sim.ts 转写"的语义对应），详见 ADR-0145。
 */

const AT = "2026-11-11T00:00:00.000Z";
const idle: SimInput = { dx: 0, dy: 0, attack: false };
const tick = 1 / 60;
const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

interface Spec {
  id: string;
  kind: GameEntityKind;
  name: string;
  stats?: Record<string, number>;
  refs?: Array<{ to: string; role: string }>;
}

/** 直接构造 GameDocument（带 refs 的 quest/item 用 addEntity 不便，走底稿范式，对齐 codegen.test.ts）。 */
function build(specs: Spec[]): GameDocument {
  const document: GameDocument = {
    id: "game_perf3",
    projectId: null,
    name: "PERF-3 多物品",
    summary: "items 下标 O(1) 判据底稿",
    kind: "2d",
    entities: specs.map((spec) => ({
      id: spec.id,
      kind: spec.kind,
      name: spec.name,
      notes: `说明：${spec.name}`,
      tags: ["perf3-test"],
      stats: { ...(spec.stats ?? {}) },
      refs: (spec.refs ?? []).map((ref, index) => ({ id: `${spec.id}-ref-${index}`, to: ref.to, role: ref.role })),
      updatedAt: AT,
    })),
    createdAt: AT,
    updatedAt: AT,
  };
  const issues = validateGame(document);
  if (issues.length) throw new Error(`PERF-3 底稿结构校验没过：${issues.map((i) => i.message).join("；")}`);
  return document;
}

function docWithManyItems(count = 7): GameDocument {
  const specs: Spec[] = [
    { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 0, x: 600, y: 380 } },
  ];
  for (let i = 1; i < count; i += 1) {
    // 物品错开坐标，避免与玩家初始位置重合被立即拾取（不变量断言不依赖具体数值，但 parity 要稳）
    specs.push({ id: `i${i}`, kind: "item", name: `物${i}`, stats: { stackSize: 1, x: 100 + i * 40, y: 100 } });
  }
  // 一个 quest 引用第一个 item → 投影出 collect goal，让 sim.ts 的 items 分支每帧执行
  specs.push({ id: "q1", kind: "quest", name: "收集", stats: {}, refs: [{ to: "i1", role: "需要拾取" }] });
  return build(specs);
}

function planWithManyItems(count = 7): GamePlan {
  return compileGame(docWithManyItems(count));
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

describe("state 物品 O(1) 下标索引（§PERF-3，计数缝 + Proxy + 顺序不变量 + 静态判据）", () => {
  it("fixture 真有 ≥6 个物品，且 quest 投影出 collect goal（否则 items 分支不执行、判据假绿）", () => {
    const plan = planWithManyItems();
    expect(plan.items.length).toBeGreaterThanOrEqual(6);
    const collect = plan.quests.flatMap((q) => q.goals).filter((g) => g.kind === "collect");
    expect(collect.length, "没有 collect goal，items 分支每帧不会走，计数缝是空的").toBeGreaterThan(0);
  });

  it("itemIndexById 内容正确：每个 id 映射到 state.items 里的同一位置", () => {
    const plan = planWithManyItems();
    const idx = buildPlanIndices(plan);
    const state = initialState(plan);
    expect(idx.itemIndexById.size).toBe(plan.items.length);
    plan.items.forEach((item, at) => {
      expect(idx.itemIndexById.get(item.id)).toBe(at);
      expect(itemByIdOf(state.items, idx, item.id)).toBe(state.items[at]);
    });
  });

  it("同序路径零 find：Proxy 拦截证明 O(1) 命中不触碰 Array.find/findIndex", () => {
    const plan = planWithManyItems();
    const idx = buildPlanIndices(plan);
    const state = initialState(plan);
    const { proxy, calls } = trackFinds(state.items);
    for (const item of plan.items) {
      expect(itemByIdOf(proxy, idx, item.id)).toBe(state.items[idx.itemIndexById.get(item.id)!]);
    }
    expect(calls()).toBe(0);
  });

  it("未知 id 不触发 find、返回 undefined（与 Array.find 语义一致）", () => {
    const plan = planWithManyItems();
    const idx = buildPlanIndices(plan);
    const { proxy, calls } = trackFinds(initialState(plan).items);
    expect(itemByIdOf(proxy, idx, "不存在")).toBeUndefined();
    expect(calls()).toBe(0);
  });

  it("守护：state.items 被重排（顺序不变量破坏）→ 回退 find，仍返回正确 actor", () => {
    const plan = planWithManyItems();
    const idx = buildPlanIndices(plan);
    const reordered = [...initialState(plan).items].reverse();
    const { proxy, calls } = trackFinds(reordered);
    const target = plan.items[2]!; // fixture 保证 ≥6 个物品
    const hit = itemByIdOf(proxy, idx, target.id); // 下标处现在是别的物品 → 必须回退 find
    expect(hit?.id).toBe(target.id);
    expect(calls()).toBeGreaterThan(0);
  });

  it("真实 step 长跑（quest collect 每帧判定）：O(1) 命中 > 0 且 find 回退恒为 0（注入计数，非墙钟）", () => {
    const plan = planWithManyItems();
    let state = initialState(plan);
    const { result, meter } = measureItemLookups(() => {
      let s = state;
      for (let i = 0; i < 600; i += 1) s = step(plan, s, idle, tick);
      return s;
    });
    state = result;
    expect(state.t).toBeGreaterThan(0);
    expect(meter.hits).toBeGreaterThan(0); // quest 的 collect goal 每帧确实走 O(1) 命中
    expect(meter.findFallbacks).toBe(0); // 整场顺序不变量不被破坏，从不退化成 find
  });

  it("整场 14400 帧 state.items 恒与 plan.items 同序同长（O(1) 前提不被 step 破坏）", () => {
    const plan = planWithManyItems();
    const idx = buildPlanIndices(plan);
    let state = initialState(plan);
    for (let i = 0; i < 14400; i += 1) {
      expect(state.items.length).toBe(plan.items.length);
      plan.items.forEach((item, at) => expect(state.items[at]!.id).toBe(item.id));
      // 每帧用索引读回必须拿回正确 actor（缓存索引整帧有效）
      for (const item of plan.items) expect(itemByIdOf(state.items, idx, item.id)?.id).toBe(item.id);
      state = step(plan, state, idle, tick);
    }
  });

  it("getPlanIndices 走默认单例：items 索引与 enemies 索引同一份、不重复构造", () => {
    const plan = planWithManyItems();
    const a = getPlanIndices(plan);
    expect(a).toBe(getPlanIndices(plan));
    expect(a.itemIndexById).toBeDefined();
    expect(a.enemyIndexById).toBeDefined(); // PERF-2 的同构索引不受影响
  });
});

/**
 * 静态判据：sim.ts 任务判定 items 分支改走 `itemByIdOf`，旧的 `next.items.find` 形态不再出现。
 * 同时**反转** PERF-2 判据里"items 分支保留 find"的断言（那条断言是 PERF-2 时的诚实快照，
 * PERF-3 落地后必须同步改，否则两份判据互相矛盾）。用字符码构造脆弱子串避免自指。
 */
describe("PERF-3 调用点静态判据（改动真落到了 sim.ts 且与 PERF-2 判定同步）", () => {
  const sim = readFileSync(join(srcDir, "sim.ts"), "utf8");
  const perf2Test = readFileSync(join(srcDir, "..", "test", "state-enemy-index.test.ts"), "utf8");

  it("sim.ts 任务判定 items 分支走 itemByIdOf，不再有 next.items.find", () => {
    expect(sim).toContain("itemByIdOf(next.items, idx, goal.actorId)");
    expect(sim).not.toMatch(/\bnext\.items\.find\s*\(/);
  });

  it("sim.ts 仍保留 enemies 分支的 enemyByIdOf（PERF-2 零回归），且两份索引都在 PlanIndices", () => {
    expect(sim).toContain("enemyByIdOf(next.enemies, idx, goal.actorId)");
    expect(sim).toContain("enemyIndexById: new Map");
    expect(sim).toContain("itemIndexById: new Map");
  });

  it("PERF-2 判据里'items 分支保留 find'的诚实快照已同步反转（两份判据不打架）", () => {
    // PERF-2 当时的断言是 expect(sim).toMatch(/items\.find\s*\(/)——PERF-3 后必须消失
    expect(perf2Test, "PERF-2 判据仍断言 items.find 存在，与 PERF-3 矛盾，需同步更新").not.toMatch(
      /expect\(sim\)\.toMatch\(\/items\\\.find/,
    );
  });
});
