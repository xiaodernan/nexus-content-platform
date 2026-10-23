import { describe, expect, it } from "vitest";
import { generatePageComponent } from "../src/codegen";
import { resolveLayout } from "../src/layout";
import { applyInstanceOverrides } from "../src/components";
import { createNode, createPage } from "../src/nodes";
import { isWithin } from "../src/patch";

/**
 * ADR-0050 横向审计的**第二批**：把"节点树递归遍历"里还没带循环守卫的三处补齐。
 * 第一批（nodes.ts 的 descendants/walk/ancestors/isDescendant、patch.collectSubtree、
 * context-index.firstTextIn）已修；这一批是**消费端**遍历：
 *   - codegen.renderTree（生成 React 组件，递归 childrenOf）
 *   - layout.measure（自底向上测量，递归 visibleChildren）
 *   - components.collect（组件实例化收子树，递归 node.children）
 * 三者都是"正常树每节点一次、畸形环会无限递归栈溢出"的同型缺陷。
 *
 * 变异探针纪律（docs/TESTING.md）：每条"成环不崩"的断言，都必须在守卫被摘掉时变红——
 * 否则它只是"即使代码坏掉也会通过"的废断言。本文件在提交前已逐一验证。
 */

/** children 成环：root→a→b→a */
function childCyclePage() {
  const page = createPage("cycle");
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

describe("codegen.renderTree 对成环文档不再栈溢出（ADR-0050 第 6 处）", () => {
  it("generatePageComponent 遇子环终止，仍产出组件源码", () => {
    const { page } = childCyclePage();
    let file: ReturnType<typeof generatePageComponent> | undefined;
    // 未修：renderTree 沿 children 无限递归 → RangeError: Maximum call stack size exceeded
    expect(() => {
      file = generatePageComponent(page, {}, "CyclePage");
    }).not.toThrow();
    expect(file).toBeDefined();
    expect(file!.contents).toContain("export function CyclePage");
  });
});

describe("layout.measure 对成环文档不再栈溢出（ADR-0050 第 7 处）", () => {
  it("resolveLayout 遇子环终止，仍能返回布局", () => {
    const { page } = childCyclePage();
    let layout: ReturnType<typeof resolveLayout> | undefined;
    // 未修：measure 沿 visibleChildren 无限递归 → RangeError
    expect(() => {
      layout = resolveLayout(page);
    }).not.toThrow();
    expect(layout).toBeDefined();
    expect(layout!.nodes[page.rootId]).toBeDefined();
  });
});

describe("components.collect 对成环文档不再栈溢出（ADR-0050 第 8 处）", () => {
  it("applyInstanceOverrides 遇子环终止，仍返回投影", () => {
    const page = createPage("inst");
    const root = page.nodes[page.rootId]!;
    // 把 root 当实例本体，root→x→root 成环
    const x = createNode({ type: "frame", parentId: root.id, name: "X" });
    page.nodes[x.id] = x;
    root.children.push(x.id);
    x.children.push(root.id); // ← 成环（实例收自己）
    let result: ReturnType<typeof applyInstanceOverrides> | undefined;
    // 未修：collect 沿 node.children 无限递归 → RangeError
    expect(() => {
      result = applyInstanceOverrides(page, root);
    }).not.toThrow();
    expect(result).toBeDefined();
    expect(result!.rootId).toBe(root.id);
  });
});

describe("patch.isWithin 对成环父链不再死循环（ADR-0050 第 9 处）", () => {
  it("父链 a↔b 成环时 isWithin 终止并返回布尔", () => {
    const page = createPage("pc");
    const root = page.nodes[page.rootId]!;
    const a = createNode({ type: "frame", parentId: root.id, name: "A" });
    const b = createNode({ type: "frame", parentId: a.id, name: "B" });
    page.nodes[a.id] = a;
    page.nodes[b.id] = b;
    root.children.push(a.id);
    a.children.push(b.id);
    // 篡改父指针成环（畸形文档可来自导入 / AI 补丁）
    a.parentId = b.id;
    b.parentId = a.id;
    // ancestorId 取不在环上的 root：未修时 while 在 a↔b 间永不退出（同步死循环，连报错都不留）
    expect(typeof isWithin(page, a.id, root.id)).toBe("boolean");
  });
});
