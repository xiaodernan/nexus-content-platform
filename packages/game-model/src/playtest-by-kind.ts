import type { GameDocument, GameKind } from "./index";
import { compileGame } from "./play";
import { compileRpg } from "./rpg";
import { playtest, playtestRpg, type PlaytestReport, type RpgPlaytestReport } from "./playtest";

/**
 * **按设计标的那一型派试玩**（§52/§53 那条链上"只跑 RPG 管线"那一处的补上）。
 *
 * 模型层早就有这个能力（`playtest.ts` 的文件头写着"覆盖两条管线，与 `compileForKind` 的分派一一对应"），
 * 缺的是**链上那一格没读 `document.kind`** ⇒ 它无条件跑 `playtestRpg(compileRpg(...))`，
 * 于是链上一份 2D 的草稿会被拿 RPG 的规则去试 ⇒ 报出来的读数不是这份设计的那条管线的读数（§159）。
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
export interface KindPlaytest {
  kind: GameKind;
  report: PlaytestReport | RpgPlaytestReport;
  /** 只有 RPG 有"最高等级"那一格（别的类型没有等级这件事） */
  maxLevel?: number;
  /** 这一型走的是哪条管线（结论里要说清，不让人猜） */
  pipeline: string;
  /** 跑的是哪套引擎（`sim.step` 还是 `sim.step+rpg.step`） */
  engine: string;
}

/** 对话那两种：形状不同，另作一片 */
const STORY_KINDS: readonly GameKind[] = ["interactive-story", "visual-novel"];

export function playtestByKind(document: GameDocument): KindPlaytest {
  const kind = document.kind;
  if (STORY_KINDS.includes(kind)) {
    throw new Error(
      `对话那一种（${kind}）的试玩报告形状不同（没有"走法"可言，算的是可达性与停点），` +
        '这一格还没接进链上——不做一个说得过去的假报告',
    );
  }
  if (kind === "rpg-prototype") {
    const report = playtestRpg(compileRpg(document));
    return { kind, report, maxLevel: report.maxLevel, pipeline: "rpg", engine: "sim.step+rpg.step" };
  }
  const report = playtest(compileGame(document));
  return { kind, report, pipeline: "topdown", engine: "sim.step" };
}
