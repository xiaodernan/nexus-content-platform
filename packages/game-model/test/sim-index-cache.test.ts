import { describe, expect, it } from "vitest";
import {
  buildPlanIndices,
  compileGame,
  createGame,
  entitiesOfKind,
  initialState,
  linkEntities,
  makePlanIndexCache,
  setStat,
  step,
  type GameDocument,
  type GamePlan,
  type SimInput,
  type SimState,
} from "../src/index";

/**
 * §PERF / plan 只读索引缓存的验电（`sim.ts`）。
 *
 * `step` 每帧都要把 state 里的 sim actor 按 id 对回 plan 里的 design。这些索引只依赖
 * 不可变的 `plan`，改前每帧重建 4 个 Map + 1 次 filter——60fps 每秒 ~240 个短命 Map，
 * 一次 60s playtest（14400 帧）约 57600 个。这里缓存到 O(plan 数)。
 *
 * 判据**不拿墙钟量毫秒**（多 agent 抢资源的机器上会 flaky），而是用 `builds` 计数：
 * 跑 N 帧索引只建 1 次。正确性由 `sim-parity.test.ts` 的 925 行逐帧对账兜底——
 * 本文件只钉"缓存这一层"的确定性与行为等价。
 */

const idle: SimInput = { dx: 0, dy: 0, attack: false };
const tick = 1 / 60;

function write(doc: GameDocument, id: string, key: string, value: number): GameDocument {
  const r = setStat(doc, id, key, value);
  if (r.reason) throw new Error(r.reason);
  return r.document;
}

function planWithContent(): GamePlan {
  let doc = createGame("索引判据");
  const [player] = entitiesOfKind(doc, "player");
  const [enemy] = entitiesOfKind(doc, "enemy");
  const [item] = entitiesOfKind(doc, "item");
  const [trigger] = entitiesOfKind(doc, "trigger");
  const [quest] = entitiesOfKind(doc, "quest");
  doc = write(doc, player!.id, "health", 100);
  doc = write(doc, enemy!.id, "speed", 0);
  const linked = linkEntities(doc, quest!.id, enemy!.id, "讨伐");
  doc = linked.reason ? doc : linked.document;
  void item;
  void trigger;
  return compileGame(doc);
}

/** 与"每帧新建索引"的结果逐帧比对——缓存不得改变任何一步的 state。 */
function runFrames(
  plan: GamePlan,
  frames: number,
  cache = makePlanIndexCache(),
  collectEveryFrame = false,
): { final: SimState; perFrame: SimState[] } {
  let state = initialState(plan);
  const perFrame: SimState[] = [];
  for (let i = 0; i < frames; i += 1) {
    state = step(plan, state, idle, tick, cache);
    if (collectEveryFrame) perFrame.push(state);
  }
  return { final: state, perFrame };
}

describe("plan 只读索引缓存（§PERF，构造次数而非墙钟）", () => {
  it("同一 plan 跑 N 帧，索引只建 1 次（改前每帧 4 Map+filter，N 帧 N 次）", () => {
    const cache = makePlanIndexCache();
    const plan = planWithContent();
    runFrames(plan, 600, cache); // 10 秒模拟 = 600 帧
    expect(cache.builds).toBe(1);
  });

  it("长跑 14400 帧（一次 60s playtest 的量级）仍只建 1 次", () => {
    const cache = makePlanIndexCache();
    runFrames(planWithContent(), 14_400, cache);
    expect(cache.builds).toBe(1);
  });

  it("换一个 plan → 再建一次（WeakMap 按 plan 对象分键，不跨 plan 串味）", () => {
    const cache = makePlanIndexCache();
    runFrames(planWithContent(), 10, cache);
    expect(cache.builds).toBe(1);
    runFrames(planWithContent(), 10, cache); // 另一个 plan 对象，即便内容相同
    expect(cache.builds).toBe(2);
    runFrames(planWithContent(), 10, cache);
    expect(cache.builds).toBe(3);
  });

  it("行为等价：注入共享缓存跑 N 帧，与每帧新建索引的结果逐帧逐字段相同", () => {
    const plan = planWithContent();
    const shared = makePlanIndexCache();
    const withCache = runFrames(plan, 120, shared, true);
    expect(shared.builds).toBe(1);

    // 对照组：每帧用一个全新 cache，等价于改前"每帧重建索引"的行为
    let state = initialState(plan);
    for (let i = 0; i < 120; i += 1) {
      state = step(plan, state, idle, tick, makePlanIndexCache());
      expect(state).toEqual(withCache.perFrame[i]);
    }
  });

  it("buildPlanIndices 内容正确：四个 Map 与 judgeable 都能按 id / 语义取回原对象", () => {
    const plan = planWithContent();
    const idx = buildPlanIndices(plan);
    for (const enemy of plan.enemies) expect(idx.enemyById.get(enemy.id)).toBe(enemy);
    for (const item of plan.items) expect(idx.itemById.get(item.id)).toBe(item);
    for (const trigger of plan.triggers) expect(idx.triggerById.get(trigger.id)).toBe(trigger);
    for (const quest of plan.quests) expect(idx.questById.get(quest.id)).toBe(quest);
    expect(idx.judgeable).toEqual(plan.quests.filter((q) => q.judgeable));
    // 索引是只读视图：调用方拿到的 Map 不暴露写入面之外的东西（内容稳定）
    expect(idx.enemyById.size).toBe(plan.enemies.length);
  });

  it("同一 plan 的两个独立 cache 各自 builds=1（默认单例不串味，判据可各自观察）", () => {
    const plan = planWithContent();
    const a = makePlanIndexCache();
    const b = makePlanIndexCache();
    a.get(plan);
    a.get(plan);
    b.get(plan);
    expect(a.builds).toBe(1);
    expect(b.builds).toBe(1);
  });

  it("状态推进不受缓存影响：打了敌人一拳的 state 与 parity 同源（缓存只换索引来源）", () => {
    const plan = planWithContent();
    const cache = makePlanIndexCache();
    let cached = initialState(plan);
    let fresh = initialState(plan);
    const attack: SimInput = { dx: 0, dy: 0, attack: true };
    for (let i = 0; i < 30; i += 1) {
      cached = step(plan, cached, attack, tick, cache);
      fresh = step(plan, fresh, attack, tick, makePlanIndexCache());
      expect(cached).toEqual(fresh);
    }
    expect(cache.builds).toBe(1);
  });
});
