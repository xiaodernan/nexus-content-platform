import { describe, expect, it } from "vitest";
import { validatePage } from "../src/validate";
import { createNode, createPage } from "../src/nodes";
import type { DesignNode, Page } from "../src/types";

function validPage(): { page: Page; child: DesignNode } {
  const page = createPage("v");
  const child = createNode({ type: "frame", parentId: page.rootId, name: "Child" });
  page.nodes[child.id] = child;
  page.nodes[page.rootId]!.children.push(child.id);
  return { page, child };
}

const codes = (page: Page) => validatePage(page).map((i) => i.code);

describe("validatePage", () => {
  it("干净页面（root + 一个子 frame）无任何 issue", () => {
    const { page } = validPage();
    expect(validatePage(page)).toEqual([]);
  });

  it("缺少根节点 → empty-page（error），并直接返回", () => {
    const { page } = validPage();
    delete page.nodes[page.rootId];
    const found = validatePage(page);
    expect(found.map((i) => i.code)).toEqual(["empty-page"]);
    expect(found[0]!.severity).toBe("error");
  });

  it("未知节点类型 → invalid-node-type（error）", () => {
    const { page, child } = validPage();
    (child as { type: string }).type = "mystery";
    expect(codes(page)).toContain("invalid-node-type");
  });

  it("style 少字段（fills 非数组）→ incomplete-node-style", () => {
    const { page, child } = validPage();
    (child.style as unknown as { fills: unknown }).fills = "nope";
    expect(codes(page)).toContain("incomplete-node-style");
  });

  it("layout 少字段（padding 非对象）→ incomplete-node-layout", () => {
    const { page, child } = validPage();
    (child.layout as unknown as { padding: unknown }).padding = null;
    expect(codes(page)).toContain("incomplete-node-layout");
  });

  it("引用了不存在的子节点 → missing-child（error）", () => {
    const { page } = validPage();
    page.nodes[page.rootId]!.children.push("ghost-child");
    expect(codes(page)).toContain("missing-child");
  });

  it("父子引用不一致（child.parentId 指错）→ cycle（error）", () => {
    const { page, child } = validPage();
    child.parentId = "someone-else";
    expect(codes(page)).toContain("cycle");
  });

  it("真正的环（a→b→a）被 DFS 检出 → cycle", () => {
    const { page, child: a } = validPage();
    const b = createNode({ type: "frame", parentId: a.id, name: "B" });
    page.nodes[b.id] = b;
    a.children.push(b.id);
    b.children.push(a.id); // 成环
    expect(codes(page)).toContain("cycle");
  });

  it("无法从根到达的节点 → orphan-node（warning）", () => {
    const { page } = validPage();
    const orphan = createNode({ type: "frame", parentId: null, name: "Orphan" });
    page.nodes[orphan.id] = orphan; // 不挂到任何父级
    const issue = validatePage(page).find((i) => i.code === "orphan-node");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
    expect(issue!.nodeId).toBe(orphan.id);
  });
});
