/**
 * §124 状态系统：状态名与 Tailwind 变体前缀的唯一来源（ADR-0062）。
 *
 * codegen 发射状态类、code-parse 解析状态类，两边都从这张表读。
 * 生成与解析各抄一份表，迟早会出现"生成写 data-[state=loading]:、解析只认
 * data-state=loading"的半通状态——所以表只存在这一份。
 */

import type { Style } from "./types";

/** §124 的七个状态；数组顺序即文档口径，UI 与生成器都按它遍历 */
export const NODE_STATES = [
  "hover",
  "active",
  "focus",
  "disabled",
  "loading",
  "error",
  "success",
] as const;

export type NodeState = (typeof NODE_STATES)[number];

/**
 * 状态 → Tailwind 变体前缀。
 * hover / active / focus / disabled 是浏览器原生伪类；
 * loading / error / success 走 data-state 属性变体，只读投影页要真的给元素
 * 设置 data-state 属性才会兑现（ADR-0062「未兑现的口径」一节）。
 */
export const STATE_VARIANT: Record<NodeState, string> = {
  hover: "hover:",
  active: "active:",
  focus: "focus:",
  disabled: "disabled:",
  loading: "data-[state=loading]:",
  error: "data-[state=error]:",
  success: "data-[state=success]:",
};

/**
 * 单个状态的样式补丁。整通道替换（withState 语义）：补丁里出现的通道整体覆盖
 * 基础态，没有出现的通道保持基础态，不做逐项合并（ADR-0062）。
 */
export type NodeStateStyle = Partial<
  Pick<Style, "fills" | "opacity" | "strokes" | "effects">
>;

/** DesignNode.states：状态名 → 该状态的补丁 */
export type NodeStates = Partial<Record<NodeState, NodeStateStyle>>;
