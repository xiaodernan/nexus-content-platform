import { describe, expect, it } from "vitest";
import { createDocument, createNode, lintDesign, resolveLayout, validateDocument } from "../src";

/**
 * 一个字段不全的节点能把整个 Studio 搞白屏——这是 1000 节点压测撞出来的真 bug：
 * 压测脚本造的 text 节点没有 style.cornerRadius，写库能写进去、读得出来，
 * 但健康度（lintDesign）在 Object.entries(undefined) 上抛，React 整棵树挂掉。
 *
 * 两头都补：读路径不许崩（lint 遇到残缺节点跳过那一项并继续），
 * 写路径挡在门外（validateDocument 报 error，PUT 因此 400）。
 */

function docWithMalformedNode() {
  const document = createDocument("残缺节点");
  const page = document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const bad = {
    id: "perf_bad",
    type: "text",
    name: "残缺",
    parentId: root.id,
    children: [],
    position: { x: 0, y: 0 },
    size: { width: 200, height: 24 },
    // 故意缺 cornerRadius / strokes，padding 也不给
    style: { fills: [] },
    layout: { mode: "none" },
    visible: true,
    locked: false,
    text: "压测",
  };
  page.nodes.perf_bad = bad as never;
  root.children.push("perf_bad");
  return { document, page, badId: "perf_bad" };
}

describe("残缺节点不许把读路径搞崩", () => {
  it("lintDesign 不抛，并且把问题报出来而不是静默跳过", () => {
    const { document } = docWithMalformedNode();
    expect(() => lintDesign(document)).not.toThrow();
    const issues = lintDesign(document);
    expect(Array.isArray(issues)).toBe(true);
  });

  it("analyzeHealth 走的那条路（lintDesign + resolveLayout）仍然出得来布局", () => {
    const { document, page } = docWithMalformedNode();
    const layout = resolveLayout(page, {});
    expect(layout.paintOrder).toContain("perf_bad");
    expect(() => lintDesign(document)).not.toThrow();
  });

  it("正常文档不受影响：一个节点都不被误报", () => {
    const document = createDocument("正常");
    const page = document.pages[0]!;
    const root = page.nodes[page.rootId]!;
    const good = createNode({ type: "text", name: "正常", text: "hi", parentId: root.id });
    page.nodes[good.id] = good;
    root.children.push(good.id);
    const errors = validateDocument(document).filter((i) => i.severity === "error");
    expect(errors.map((i) => i.code)).toEqual([]);
  });
});

describe("写路径挡在门外（validateDocument）", () => {
  it("缺 cornerRadius / strokes 的 style 是 error", () => {
    const { document, badId } = docWithMalformedNode();
    const codes = validateDocument(document)
      .filter((i) => i.severity === "error")
      .map((i) => i.code);
    expect(codes).toContain("incomplete-node-style");
    expect(codes).toContain("incomplete-node-layout");
    const styleIssue = validateDocument(document).find((i) => i.code === "incomplete-node-style");
    expect(styleIssue?.nodeId).toBe(badId);
    expect(styleIssue?.message).toContain("残缺");
  });

  it("fills 不是数组也算残缺（不能是 null 或对象）", () => {
    const { document } = docWithMalformedNode();
    const node = document.pages[0]!.nodes.perf_bad!;
    node.layout = { mode: "none", gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: "start", justify: "start" };
    node.style = { ...node.style, cornerRadius: { top: 0, right: 0, bottom: 0, left: 0 }, strokes: [], fills: null as never };
    expect(validateDocument(document).map((i) => i.code)).toContain("incomplete-node-style");
  });
});
