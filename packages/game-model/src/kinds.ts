/**
 * §51 游戏类型权威清单——`index`、`codegen` 与契约测试共同引用的一份，
 * 避免 "barrel ↔ codegen" 循环依赖把 `GAME_KINDS` 放进 TDZ（codegen 顶层的 `KIND_TERM_EN`
 * 在调用期同步读它；ESM 先求值 import 再求值本模块，循环时谁先被 import 谁都能把对方
 * 推进 TDZ）。叶模块只被 import，不被任何东西反向依赖。
 */
export const GAME_KINDS = [
  "2d",
  "2.5d",
  "3d",
  "interactive-story",
  "rpg-prototype",
  "exploration",
  "puzzle",
  "visual-novel",
] as const;

export type GameKind = (typeof GAME_KINDS)[number];

/** §51 原文的英文词，逐字：只用于契约测试与界面副标题，不是第二份清单真值 */
export const GAME_KIND_TERMS = [
  "2D",
  "2.5D",
  "3D",
  "Interactive Story",
  "RPG prototype",
  "Exploration",
  "Puzzle",
  "Visual Novel",
] as const;
