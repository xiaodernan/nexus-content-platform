import { describe, expect, it } from "vitest";
import { clone, createDocument, createNode, starterPage } from "../src/nodes";
import { diffDocuments } from "../src/diff";
import type { DesignDocument } from "../src/types";

/**
 * Compare（§27）的字段级差异。历史面板的 AI Diff（§151）与快照比较共用这套结果，
 * 所以这里盯两件事：该报的一条不漏，不该报的一条不多——
 * 尤其是"经过服务端序列化后键顺序变了"这种根本没改动的情况。
 */

const base = (): DesignDocument => createDocument("比较用文档");
const page = (doc: DesignDocument) => doc.pages[0]!;
const node = (doc: DesignDocument, name: string) => {
  const hit = Object.values(page(doc).nodes).find((n) => n.name === name);
  if (!hit) throw new Error(`起手页里没有 ${name}`);
  return hit;
};

describe("diffDocuments", () => {
  it("同一份文档：零差异", () => {
    const doc = base();
    const diff = diffDocuments(doc, clone(doc));
    expect(diff.entries).toEqual([]);
    expect(diff.truncated).toBe(false);
    expect(diff.total).toBe(0);
  });

  it("键顺序不同不算改动（服务端 jsonb 会重排键）", () => {
    const doc = base();
    const shuffled = clone(doc);
    const hero = node(shuffled, "Hero");
    hero.style!.fills = hero.style!.fills!.map((paint) => ({
      color: (paint as { color: string }).color,
      kind: "solid" as const,
    }));
    const diff = diffDocuments(doc, shuffled);
    expect(diff.entries).toEqual([]);
  });

  it("改字号：只报 typography.fontSize 这一条", () => {
    const doc = base();
    const next = clone(doc);
    node(next, "Headline").typography = { ...node(next, "Headline").typography!, fontSize: 40 };
    const diff = diffDocuments(doc, next);
    expect(diff.entries).toHaveLength(1);
    expect(diff.entries[0]).toMatchObject({
      nodeName: "Headline",
      path: "typography.fontSize",
      before: 56,
      after: 40,
      kind: "modified",
    });
  });

  it("数组属性在最浅的不同层停下，不拆成 fills[0].color.value", () => {
    const doc = base();
    const next = clone(doc);
    const eyebrow = node(next, "Eyebrow");
    eyebrow.style!.fills = [{ kind: "solid", color: "{color.primary}" }];
    const diff = diffDocuments(doc, next);
    expect(diff.entries.map((e) => e.path)).toEqual(["style.fills"]);
  });

  it("新增与删除节点分别报成 added / removed，并给出摘要而不是整份对象", () => {
    const doc = base();
    const next = clone(doc);
    const added = createNode({
      type: "text",
      name: "新增标语",
      text: "hello",
      parentId: page(next).rootId,
    });
    page(next).nodes[added.id] = added;
    page(next).nodes[page(next).rootId]!.children = [...page(next).nodes[page(next).rootId]!.children, added.id];
    const before = clone(next);
    const removedId = node(before, "Eyebrow").id;
    delete page(next).nodes[removedId];
    page(next).nodes[page(next).rootId]!.children = page(next).nodes[page(next).rootId]!.children.filter(
      (c) => c !== removedId,
    );

    const grown = diffDocuments(doc, next);
    expect(grown.entries.find((e) => e.kind === "added")).toMatchObject({
      nodeName: "新增标语",
      path: "node",
      after: { type: "text", name: "新增标语", text: "hello", children: 0 },
    });
    const shrunk = diffDocuments(before, next);
    expect(shrunk.entries.find((e) => e.kind === "removed")).toMatchObject({
      nodeId: removedId,
      nodeName: "Eyebrow",
      path: "node",
    });
  });

  it("重排子节点算 moved，不算样式改动", () => {
    const doc = base();
    const next = clone(doc);
    const hero = node(next, "Hero");
    hero.children = [...hero.children].reverse();
    const diff = diffDocuments(doc, next);
    expect(diff.entries).toHaveLength(1);
    expect(diff.entries[0]).toMatchObject({ nodeName: "Hero", path: "children", kind: "moved" });
  });

  it("换父级报 parentId moved", () => {
    const doc = base();
    const next = clone(doc);
    const hero = node(next, "Hero");
    const root = page(next).nodes[page(next).rootId]!;
    const moved = node(next, "Eyebrow");
    hero.children = hero.children.filter((c) => c !== moved.id);
    root.children = [...root.children, moved.id];
    moved.parentId = root.id;
    const diff = diffDocuments(doc, next);
    expect(diff.entries.find((e) => e.nodeName === "Eyebrow" && e.path === "parentId")).toMatchObject({
      kind: "moved",
    });
  });

  it("token 改动归到 token 类，路径带 mode/value", () => {
    const doc = base();
    const next = clone(doc);
    const token = next.tokens.find((t) => t.key === "color.accent")!;
    token.value = "#123456";
    const diff = diffDocuments(doc, next);
    expect(diff.entries).toEqual([
      expect.objectContaining({ path: "color.accent.value", kind: "token", after: "#123456" }),
    ]);
  });

  it("整页新增 / 删除各报一条 page 差异", () => {
    const doc = base();
    const extra = starterPage("关于");
    const next = clone(doc);
    next.pages = [...next.pages, extra];
    expect(diffDocuments(doc, next).entries).toEqual([
      expect.objectContaining({ nodeName: "关于", path: "page", kind: "added" }),
    ]);
    expect(diffDocuments(next, doc).entries).toEqual([
      expect.objectContaining({ nodeName: "关于", path: "page", kind: "removed" }),
    ]);
  });

  it("页面尺寸改动报 page.width，不混进节点差异", () => {
    const doc = base();
    const next = clone(doc);
    next.pages[0]!.width = 1280;
    const diff = diffDocuments(doc, next);
    expect(diff.entries).toEqual([
      expect.objectContaining({ path: "page.width", before: 1440, after: 1280, kind: "modified" }),
    ]);
  });

  it("差异超过上限时如实标 truncated，并给出总数", () => {
    const doc = base();
    const next = clone(doc);
    for (const n of Object.values(page(next).nodes)) {
      n.name = `${n.name}-改名`;
    }
    const diff = diffDocuments(doc, next, 3);
    expect(diff.entries).toHaveLength(3);
    expect(diff.truncated).toBe(true);
    expect(diff.total).toBeGreaterThan(3);
  });
});
