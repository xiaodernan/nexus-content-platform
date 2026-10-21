import { describe, expect, it } from "vitest";
import {
  combatGoals,
  compileGame,
  compileRpg,
  designLevel,
  levelGoals,
  playtest,
  playtestRpg,
  tuneCombat,
  validateGame,
  type GameDocument,
  type GameEntityKind,
} from "../src/index";

/**
 * 战斗格与布局格**按型派**（2026-10-22）。
 *
 * 背景：链上那一格（Game Design）从 2026-10-22 起能按**请求给的型**编草稿
 * （ADR-0052），试玩格也按草稿的型派管线 ⇒ 但战斗格与布局格当时还在
 * **无条件** `compileRpg` + `playtestRpg` ⇒ 链上一份 2D 的设计被拿 **RPG 的判据**去读
 * ⇒ 报出来的"战斗目标达成没有""布局摆得开不开"不是这份设计那条管线的读数（§159）。
 *
 * 这一组用例钉的是**读数来自哪条管线**：
 * 同一份字节只把 `kind` 换掉 ⇒ 读数必须换成那一型那条管线的。
 * 判据是**测试自己重算一遍**（`combatGoals(playtest(compileGame(doc)))` 那一对），
 * 所以"这一格自己给自己打分"那种实现混不过去。
 *
 * **RPG 那一条由既有那批用例钉着**（`combat.test.ts` / `level.test.ts` 的断言一个字没改就绿）⇒
 * 这一组只补"别的型"与"对话那一型"这两头。
 */

const AT = "2026-10-22T00:00:00.000Z";

interface Spec {
  id: string;
  kind: GameEntityKind;
  name: string;
  stats: Record<string, number>;
  refs?: readonly { to: string; role: string }[];
}

function build(kind: GameDocument["kind"], specs: readonly Spec[]): GameDocument {
  const document: GameDocument = {
    id: `game_kind_${kind}`,
    projectId: null,
    name: "按型派的那份",
    summary: "为这条断言搭的设计",
    kind,
    entities: specs.map((spec) => ({
      id: spec.id,
      kind: spec.kind,
      name: spec.name,
      notes: `说明：${spec.name}`,
      tags: ["kind-dispatch-test"],
      stats: { ...spec.stats },
      refs: (spec.refs ?? []).map((ref, index) => ({ id: `${spec.id}-ref-${index}`, to: ref.to, role: ref.role })),
      updatedAt: AT,
    })),
    createdAt: AT,
    updatedAt: AT,
  };
  const issues = validateGame(document);
  if (issues.length) throw new Error(`测试底稿结构校验没过：${issues.map((issue) => issue.message).join("；")}`);
  return document;
}

/** 一份够跑起来的战场：玩家 + 武器 + 两个敌人 + 物品 + 触发器 + 任务 */
const SPECS: readonly Spec[] = [
  { id: "p1", kind: "player", name: "主角", stats: { health: 5, speed: 210 } },
  { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
  { id: "e1", kind: "enemy", name: "巡逻兵", stats: { health: 3, damage: 1, speed: 150, detectionRange: 140, xpReward: 12 } },
  { id: "e2", kind: "enemy", name: "洞口守卫", stats: { health: 6, damage: 2, speed: 120, detectionRange: 160, xpReward: 10 } },
  { id: "i1", kind: "item", name: "药包", stats: { stackSize: 1, value: 5 } },
  { id: "t1", kind: "trigger", name: "洞口", stats: { radius: 70, delay: 1, cooldown: 2 }, refs: [{ to: "i1", role: "贴着" }] },
  {
    id: "q1",
    kind: "quest",
    name: "清场后打开洞口",
    stats: { xpReward: 12, requiredLevel: 2 },
    refs: [
      { to: "e1", role: "需要打倒" },
      { to: "e2", role: "需要打倒" },
      { to: "t1", role: "需要激活" },
    ],
  },
];

/** 目标读数压成一行（`id:metric` + 达标记号）⇒ 比的是**读数**，不是文案 */
function reading(list: readonly { id: string; metric: number; achieved: boolean }[]): string {
  return list.map((item) => `${item.id}:${item.metric}${item.achieved ? "+" : "-"}`).join(" ");
}

describe("战斗格与布局格按型派（2026-10-22）", () => {
  it("同一份字节只把 kind 换成 2D：战斗目标逐项等于 topdown 那条管线的读数", () => {
    const doc = build("2d", SPECS);
    const tuning = tuneCombat(doc, { at: AT });
    // **改之前**的读数：必须与"直接问 topdown 那条管线"完全一致（测试自己重算一遍）
    expect(reading(tuning.beforeGoals)).toBe(reading(combatGoals(playtest(compileGame(doc)))));
    // **改之后**的读数：拿它**交回来的那份文档**重算一遍 ⇒ 改完再读仍是那条管线的
    expect(reading(tuning.goals)).toBe(reading(combatGoals(playtest(compileGame(tuning.document)))));
    // 反向对照：同一份字节标成 RPG 时，读数是 RPG 那条管线的 ⇒ 两条管线不是同一条
    const rpg = build("rpg-prototype", SPECS);
    const rpgTuning = tuneCombat(rpg, { at: AT });
    const rpgDirect = combatGoals(playtestRpg(compileRpg(rpg)));
    expect(reading(rpgTuning.beforeGoals)).toBe(reading(rpgDirect));
    expect(reading(tuning.beforeGoals)).not.toBe(reading(rpgTuning.beforeGoals));
  });

  it("同一份字节只把 kind 换成 2D：布局目标逐项等于 topdown 那条管线的读数", () => {
    const doc = build("2d", SPECS);
    const design = designLevel(doc, { at: AT });
    // 改之前 / 改之后各对一次（改之后拿它交回来的那份文档重算）
    expect(reading(design.beforeGoals)).toBe(reading(levelGoals(compileGame(doc), doc)));
    expect(reading(design.goals)).toBe(reading(levelGoals(compileGame(design.document), design.document)));
    // 反向对照：标成 RPG 时读数是 RPG 那条管线的
    const rpg = build("rpg-prototype", SPECS);
    const rpgDesign = designLevel(rpg, { at: AT });
    const rpgDirect = levelGoals(compileRpg(rpg).base, rpg);
    expect(reading(rpgDesign.beforeGoals)).toBe(reading(rpgDirect));
  });

  it("对话那一型：战斗与布局都明说'这一型没有这一格'，不做一份假读数", () => {
    const doc = build("interactive-story", [
      { id: "d1", kind: "dialogue", name: "开场", stats: {} },
    ]);
    expect(() => tuneCombat(doc, { at: AT })).toThrow(/没有战斗可调/);
    expect(() => designLevel(doc, { at: AT })).toThrow(/没有位置可摆/);
  });
});
