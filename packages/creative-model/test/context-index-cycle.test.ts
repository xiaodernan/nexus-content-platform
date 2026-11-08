import { describe, expect, it } from "vitest";
import { buildDesignIndex } from "../src/context-index";
import { createDocument, createNode, findPage } from "../src/nodes";
import type { DesignDocument } from "../src/types";

/** children 成环：root→a→b→a。buildDesignIndex 会逐节点调 firstTextIn（BFS 收 textPreview） */
function cyclicDoc(): DesignDocument {
  const doc = createDocument("cx");
  const page = findPage(doc)!;
  const root = page.nodes[page.rootId]!;
  const a = createNode({ type: "frame", parentId: root.id, name: "A" });
  const b = createNode({ type: "frame", parentId: a.id, name: "B" });
  page.nodes[a.id] = a;
  page.nodes[b.id] = b;
  root.children.push(a.id);
  a.children.push(b.id);
  b.children.push(a.id); // ← 成环
  return doc;
}

describe("buildDesignIndex 对成环子树不再死循环（ADR-0050 第 5 处）", () => {
  it("firstTextIn 的 BFS 遇子环终止，索引仍能建成", () => {
    const doc = cyclicDoc();
    let index: ReturnType<typeof buildDesignIndex> | undefined;
    // 未修：firstTextIn 的 queue 无限增长 → buildDesignIndex 挂住（连报错都没有）
    expect(() => {
      index = buildDesignIndex(doc);
    }).not.toThrow();
    expect(index).toBeDefined();
    expect(Array.isArray(index!.frames)).toBe(true);
    // 成环的 A/B 都被收进 frames（遍历到过它们），textPreview 为空但不挂
    const names = index!.frames.map((f) => f.name);
    expect(names).toContain("A");
    expect(names).toContain("B");
  });

  it("无环文档不受影响：Hero 的 textPreview 仍取到首段文字", () => {
    const idx = buildDesignIndex(createDocument("ok"));
    const hero = idx.frames.find((f) => f.name === "Hero");
    expect(hero).toBeDefined();
    expect(hero!.textPreview.length).toBeGreaterThan(0);
  });
});
