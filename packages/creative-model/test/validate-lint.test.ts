import { describe, expect, it } from "vitest";
import {
  collectTokenRefs,
  hasErrors,
  lintDesign,
  measureContrast,
  summarizeIssues,
  type Issue,
} from "../src/validate";
import { TokenStore } from "../src/tokens";
import { createDocument, createNode, findPage } from "../src/nodes";

function scope() {
  const doc = createDocument("lint");
  const page = findPage(doc)!;
  const rootId = page.rootId;
  const add = <T extends Parameters<typeof createNode>[0]>(input: T) => {
    const node = createNode({ ...input, parentId: rootId });
    page.nodes[node.id] = node;
    page.nodes[rootId]!.children.push(node.id);
    return node;
  };
  return { doc, page, rootId, add };
}

describe("collectTokenRefs", () => {
  it("从 layout / style 里收 {token} 引用并去重", () => {
    const { add } = scope();
    const n = add({ type: "frame" });
    n.layout.gap = "{space.4}";
    n.style.fills = [
      { kind: "solid", color: "{color.brand}" },
      { kind: "solid", color: "{color.brand}" },
    ];
    expect(collectTokenRefs(n).sort()).toEqual(["color.brand", "space.4"]);
  });

  it("普通字面量/数字不收", () => {
    const { add } = scope();
    const n = add({ type: "frame" });
    n.style.fills = [{ kind: "solid", color: "#123456" }];
    expect(collectTokenRefs(n)).toEqual([]);
  });
});

describe("hasErrors / summarizeIssues", () => {
  const mk = (severity: Issue["severity"]): Issue => ({
    code: "orphan-node",
    severity,
    message: "m",
  });

  it("hasErrors 只在有 error 时为真", () => {
    expect(hasErrors([])).toBe(false);
    expect(hasErrors([mk("warning"), mk("info")])).toBe(false);
    expect(hasErrors([mk("warning"), mk("error")])).toBe(true);
  });

  it("summarizeIssues 按 severity 分组计数", () => {
    expect(summarizeIssues([])).toEqual({ error: 0, warning: 0, info: 0 });
    expect(
      summarizeIssues([mk("error"), mk("error"), mk("warning"), mk("info")]),
    ).toEqual({ error: 2, warning: 1, info: 1 });
  });
});

describe("measureContrast", () => {
  it("非文本类节点（frame）没有前景色 → null", () => {
    const { page, add } = scope();
    const frame = add({ type: "frame" });
    expect(measureContrast(page, frame, new TokenStore([]))).toBeNull();
  });

  it("有前景色但没有文字（card 无 text/子）→ null", () => {
    const { page, add } = scope();
    const card = add({ type: "card" });
    card.typography = { ...card.typography!, color: "#000000" };
    expect(measureContrast(page, card, new TokenStore([]))).toBeNull();
  });

  it("黑字白底 → 21:1，foreground/background 为规范 hex", () => {
    const { page, add } = scope();
    page.backgroundColor = "#ffffff";
    const t = add({ type: "text", text: "hi" });
    t.style.fills = [{ kind: "solid", color: "#000000" }];
    const m = measureContrast(page, t, new TokenStore([]));
    expect(m).not.toBeNull();
    expect(m!.ratio).toBeCloseTo(21, 4);
    expect(m!.foreground).toBe("#000000");
    expect(m!.background).toBe("#ffffff");
  });
});

describe("lintDesign 规则层", () => {
  it("未使用的自定义 token → unused-token（info）；默认基线 token 不因此报", () => {
    const { doc } = scope();
    doc.tokens.push({ key: "color.custom-unused", type: "color", value: "#123456" });
    const issues = lintDesign(doc);
    const unused = issues.filter((i) => i.code === "unused-token");
    expect(unused.map((i) => i.message)).toContain(
      "自定义 token 未被使用：color.custom-unused",
    );
    // 默认 token（即使没被引用）不该被标 unused
    expect(unused.some((i) => i.message.includes("color.primary"))).toBe(false);
  });

  it("字面颜色填充 → hardcoded-style(info) @ style.fills", () => {
    const { doc, add } = scope();
    const n = add({ type: "frame" });
    n.style.fills = [{ kind: "solid", color: "#123456" }];
    const issue = lintDesign(doc).find(
      (i) => i.code === "hardcoded-style" && i.path === "style.fills",
    );
    expect(issue).toBeDefined();
  });

  it("gap 不在 4px 栅格 → off-px-spacing(info) @ layout.gap", () => {
    const { doc, add } = scope();
    const n = add({ type: "frame" });
    n.layout.gap = 10;
    const issue = lintDesign(doc).find(
      (i) => i.code === "off-px-spacing" && i.path === "layout.gap",
    );
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("10");
  });

  it("图片无 alt → missing-alt(warning)", () => {
    const { doc, add } = scope();
    add({ type: "image" });
    expect(lintDesign(doc).some((i) => i.code === "missing-alt")).toBe(true);
  });

  it("空文本空子的 button → no-text-on-button(warning)", () => {
    const { doc, add } = scope();
    const btn = add({ type: "button", name: "B" });
    btn.text = "";
    btn.children = [];
    expect(lintDesign(doc).some((i) => i.code === "no-text-on-button")).toBe(true);
  });

  it("按钮实测尺寸 <32px → tap-target-small(warning)（走 resolvedNodes）", () => {
    const { doc, add } = scope();
    const btn = add({ type: "button", name: "B" });
    const issues = lintDesign(doc, { [btn.id]: { width: 20, height: 20 } });
    expect(issues.some((i) => i.code === "tap-target-small")).toBe(true);
  });

  it("非 static 绑定但表达式为空 → bad-binding(error)", () => {
    const { doc, add } = scope();
    const n = add({ type: "text", text: "x" });
    n.bindings = [{ property: "text", source: "variable", expression: "" }];
    expect(lintDesign(doc).some((i) => i.code === "bad-binding")).toBe(true);
  });

  it("static 绑定的空表达式不算 bad-binding", () => {
    const { doc, add } = scope();
    const n = add({ type: "text", text: "x" });
    n.bindings = [{ property: "text", source: "static", expression: "" }];
    expect(lintDesign(doc).some((i) => i.code === "bad-binding")).toBe(false);
  });
});
