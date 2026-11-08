import { describe, expect, it } from "vitest";
import { summarizeCodeEdit, type CodeToDesignResult } from "../src/code-parse";

function build(): CodeToDesignResult {
  return {
    ops: [],
    issues: [],
    mappings: [
      { nodeId: "a", nodeName: "Hero", line: 3, applied: ["style.fills"], unmapped: [] },
      {
        nodeId: "b",
        nodeName: "Price",
        line: 7,
        applied: [],
        unmapped: [{ token: "{x}", reason: "表达式属性无法映射" }],
      },
      {
        nodeId: "c",
        nodeName: "Card",
        line: 12,
        applied: ["layout.gap"],
        unmapped: [
          { token: "{...rest}", reason: "展开属性无法映射回设计模型" },
          { token: "-", reason: "节点已锁定：请先在画布解锁" },
        ],
      },
    ],
  };
}

describe("summarizeCodeEdit（回写清单，§26 Activity Feed / AI Diff 同源）", () => {
  it("changed 取有 applied 的节点；同一节点可同时出现在 changed 与 unmapped", () => {
    const s = summarizeCodeEdit(build());
    expect(s.changed).toEqual([
      { nodeName: "Hero", line: 3, paths: ["style.fills"] },
      { nodeName: "Card", line: 12, paths: ["layout.gap"] },
    ]);
    // Card 既有 applied 又有 unmapped：两边都如实列出
    expect(s.unmapped).toEqual([
      { nodeName: "Price", line: 7, reasons: ["{x}：表达式属性无法映射"] },
      {
        nodeName: "Card",
        line: 12,
        reasons: [
          "{...rest}：展开属性无法映射回设计模型",
          "-：节点已锁定：请先在画布解锁",
        ],
      },
    ]);
  });

  it("only 命中时：unmapped 只保留命中的节点，changed 不受 only 影响", () => {
    const s = summarizeCodeEdit(build(), new Set(["b"]));
    expect(s.changed.map((c) => c.nodeName)).toEqual(["Hero", "Card"]);
    expect(s.unmapped.map((u) => u.nodeName)).toEqual(["Price"]);
  });

  it("only 为空集（truthy）时不返回任何 unmapped", () => {
    const s = summarizeCodeEdit(build(), new Set());
    expect(s.unmapped).toEqual([]);
    // changed 从不看 only
    expect(s.changed).toHaveLength(2);
  });

  it("only 缺省（null/undefined）时全量列出", () => {
    expect(summarizeCodeEdit(build()).unmapped).toHaveLength(2);
    expect(summarizeCodeEdit(build(), null).unmapped).toHaveLength(2);
  });
});
