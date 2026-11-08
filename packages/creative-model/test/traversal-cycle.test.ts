import { describe, expect, it } from "vitest";
import {
  ancestors,
  descendants,
  isDescendant,
  walk,
  createNode,
  createPage,
} from "../src/nodes";

/** 子环：root→a→b→a（沿 children 成环）——descendants / walk 会无限递归 */
function childCycle() {
  const page = createPage("c");
  const root = page.nodes[page.rootId]!;
  const a = createNode({ type: "frame", parentId: root.id, name: "A" });
  const b = createNode({ type: "frame", parentId: a.id, name: "B" });
  page.nodes[a.id] = a;
  page.nodes[b.id] = b;
  root.children.push(a.id);
  a.children.push(b.id);
  b.children.push(a.id); // ← 成环
  return { page, root, a, b };
}

/** 父环：a.parentId=b、b.parentId=a——ancestors / isDescendant 会死循环 */
function parentCycle() {
  const page = createPage("p");
  const root = page.nodes[page.rootId]!;
  const a = createNode({ type: "frame", parentId: page.rootId, name: "A" });
  const b = createNode({ type: "frame", parentId: a.id, name: "B" });
  page.nodes[a.id] = a;
  page.nodes[b.id] = b;
  root.children.push(a.id);
  a.children.push(b.id);
  // 篡改父指针成环（畸形文档可来自导入 / AI 补丁）
  a.parentId = b.id;
  b.parentId = a.id;
  return { page, root, a, b };
}

describe("遍历对成环文档不再栈溢出/死循环（§159：如实边界，不是崩）", () => {
  it("descendants 遇子环终止，且每节点只收一次", () => {
    const { page, a, b } = childCycle();
    const ids = descendants(page, page.rootId).map((n) => n.id);
    expect(new Set(ids)).toEqual(new Set([a.id, b.id]));
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("walk 遇子环终止，每节点访问一次", () => {
    const { page } = childCycle();
    const visited: string[] = [];
    expect(() => walk(page, (n) => visited.push(n.id))).not.toThrow();
    expect(visited.length).toBe(new Set(visited).size);
  });

  it("ancestors 遇父环终止（不再死循环）", () => {
    const { page, a } = parentCycle();
    const chain = ancestors(page, a.id); // 未修：RangeError / 死循环
    expect(Array.isArray(chain)).toBe(true);
  });

  it("isDescendant 遇父环终止并返回布尔", () => {
    const { page, root, a } = parentCycle();
    expect(typeof isDescendant(page, a.id, root.id)).toBe("boolean");
  });
});

describe("遍历对无环树输出不变（修复不能改变正常语义）", () => {
  it("descendants / walk 在正常树上顺序与计数正确", () => {
    const page = createPage("ok");
    const root = page.nodes[page.rootId]!;
    const a = createNode({ type: "frame", parentId: root.id, name: "A" });
    const b = createNode({ type: "frame", parentId: a.id, name: "B" });
    page.nodes[a.id] = a;
    page.nodes[b.id] = b;
    root.children.push(a.id);
    a.children.push(b.id);
    expect(descendants(page, root.id).map((n) => n.name)).toEqual(["A", "B"]);
    const visited: string[] = [];
    walk(page, (n) => visited.push(n.name));
    expect(visited).toEqual(["ok", "A", "B"]);
    expect(ancestors(page, b.id).map((n) => n.name)).toEqual(["A", "ok"]);
    expect(isDescendant(page, b.id, root.id)).toBe(true);
  });
});
