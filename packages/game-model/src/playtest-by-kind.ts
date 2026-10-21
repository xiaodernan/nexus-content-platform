import type { GameDocument, GameKind } from "./index";
import { compileForKind, type StoryPlan } from "./story";
import {
  playtest,
  playtestRpg,
  playtestStory,
  type PlaytestReport,
  type RpgPlaytestReport,
  type StoryPlaytestReport,
} from "./playtest";
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
 * **三条管线**（2026-10-22 起对话那两种也接上了）：
 * - topdown 那五种（2D / 2.5D / 3D / 探索 / 解谜）：`playtest`，四种空间走法跑 `sim.step`；
 * - RPG 原型：`playtestRpg`，同样四种走法但跑 `rpgStep`（经验、升级与等级门参与判定）；
 * - 对话那两种（互动故事 / 视觉小说）：`playtestStory`，**没有"走法"可言**——
 *   算的是按引用连线走不走得到：可达段落数 / 可达结局数 / 空正文数。
 *
 * **三份报告的形状不同**（`PlaytestReport` / `RpgPlaytestReport` / `StoryPlaytestReport`）
 * ⇒ ⇒ 这里返回的是**可判别的联合**：按 `pipeline` 收窄 ⇒ 调用方拿到 `report` 与 `plan`
 * 时不用强转，也不会把某一型的读数字段当成别的型也有。
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
    }
  | {
      kind: GameKind;
      pipeline: "story";
      /**
       * 对话管线没有"走法"可言：它算的是**按引用连线**走不走得到
       * （`story.refs`）——所以这里**不写** `story.step`：模型里没有那个函数。
       */
      engine: string;
      /** 对话那一份的形状与别的型**不同**：可达段落数 / 可达结局数 / 空正文数 */
      report: StoryPlaytestReport;
      plan: StoryPlan;
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
    const report = playtestStory(projection.plan);
    return { kind, pipeline: "story", engine: "story.refs", report, plan: projection.plan };
  }
  throw new Error(`这一型（${kind}）今天还没有接上管线：${projection.reason}`);
}
