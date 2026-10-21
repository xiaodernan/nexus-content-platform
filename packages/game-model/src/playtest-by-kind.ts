import type { GameDocument, GameKind } from "./index";
import { compileForKind } from "./story";
import { playtest, playtestRpg, type PlaytestReport, type RpgPlaytestReport } from "./playtest";
import type { GamePlan } from "./play";
import type { RpgPlan } from "./rpg";

/**
 * **按设计标的那一型派试玩**（§52/§53 那条链上"只跑 RPG 管线"那一处的补上）。
 *
 * 模型层早就有这个能力（`playtest.ts` 的文件头写着"覆盖两条管线，与 `compileForKind` 的分派一一对应"），
 * 缺的是**链上那一格没读 `document.kind`** ⇒ 它无条件跑 `playtestRpg(compileRpg(...))`，
 * 于是链上一份 2D 的草稿会被拿 RPG 的规则去试 ⇒ 报出来的读数不是这份设计的那条管线的读数（§159）。
 *
 * **派发只走 `compileForKind`**（类型 → 管线的唯一分派点，`story.ts` 文件头写明）：
 * 各写一遍判断，迟早变成"一个页面说没接、另一个页面硬跑 2D 关卡"（§16）。
 * 所以这里**不自己**判断 kind，只问那张表答什么。
 *
 * **两条管线**（对话那两种**不在这里**）：
 * - topdown 那五种（2D / 2.5D / 3D / 探索 / 解谜）：`playtest`，四种空间走法跑 `sim.step`；
 * - RPG 原型：`playtestRpg`，同样四种走法但跑 `rpgStep`（经验、升级与等级门参与判定）。
 *
 * **对话那两种（`interactive-story` / `visual-novel`）为什么不在这里**：
 * 它们的报告**形状不同**（没有"走法"可言：算的是可达性、停点与空正文数）。
 * 把两套形状硬凑成同一组键，就会有一边在说另一边的谎 ⇒
 * 这一格**明确报"还没接"**，不做一个说得过去的假报告（§159）。
 */
/**
 * **可判别的联合**：按 `pipeline` 收窄 ⇒ 调用方拿到 `report` 与 `plan` 时不用强转，
 * 也不会把"RPG 的那一格"当成"别的型也有"（`maxLevel` 只有 RPG 那个成员有）。
 */
export type KindPlaytest =
  | {
      kind: GameKind;
      pipeline: "rpg";
      /** 跑的是哪套引擎（RPG 那条是 `sim.step+rpg.step`） */
      engine: string;
      report: RpgPlaytestReport;
      /** 只有 RPG 有"最高等级"那一格（别的类型没有等级这件事） */
      maxLevel: number;
      plan: RpgPlan;
    }
  | {
      kind: GameKind;
      pipeline: "topdown";
      /** 跑的是哪套引擎（`sim.step`） */
      engine: string;
      report: PlaytestReport;
      plan: GamePlan;
    };

export function playtestByKind(document: GameDocument): KindPlaytest {
  const kind = document.kind;
  const projection = compileForKind(document);
  if (projection.pipeline === "rpg") {
    const report = playtestRpg(projection.plan);
    return {
      kind,
      pipeline: "rpg",
      engine: "sim.step+rpg.step",
      report,
      maxLevel: report.maxLevel,
      plan: projection.plan,
    };
  }
  if (projection.pipeline === "topdown") {
    const report = playtest(projection.plan);
    return { kind, pipeline: "topdown", engine: "sim.step", report, plan: projection.plan };
  }
  if (projection.pipeline === "story") {
    throw new Error(
      `对话那一种（${kind}）的试玩报告形状不同（没有"走法"可言，算的是可达性与停点），` +
        "这一格还没接进链上——不做一个说得过去的假报告",
    );
  }
  throw new Error(`这一型（${kind}）今天还没有接上管线：${projection.reason}`);
}
