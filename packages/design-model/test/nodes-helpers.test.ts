import { describe, expect, it } from "vitest";
import {
  ancestors,
  childrenOf,
  defaultLayout,
  defaultStyle,
  defaultTypography,
  descendants,
  getByPath,
  getNode,
  instantiateComponent,
  isDescendant,
  radius,
  requireNode,
  setOnObject,
  walk,
  walkDocument,
} from "../src/nodes";
import { createDocument, createNode, createPage } from "../src/nodes";
import type { ComponentDefinition, DesignDocument, Page } from "../src/types";

/** 在页面里挂一个子节点并回链 parent.children，保证遍历函数看到一致的结构 */
function attach(page: Page, parentId: string, node: ReturnType<typeof createNode>): void {
  page.nodes[node.id] = node;
  page.nodes[parentId]!.children.push(node.id);
}

function fixtureDoc(): { doc: DesignDocument; page: Page } {
  // 用干净的 createPage 当根（不挂 starter 内容），让遍历计数可预测
  const doc = createDocument("probe");
  const page = createPage("probe");
  doc.pages = [page];
  doc.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  const a = createNode({ type: "frame", parentId: root.id, name: "A" });
  const b = createNode({ type: "frame", parentId: root.id, name: "B" });
  const c = createNode({ type: "frame", parentId: a.id, name: "C" });
  attach(page, root.id, a);
  attach(page, root.id, b);
  attach(page, a.id, c);
  return { doc, page };
}

describe("getByPath", () => {
  it("空路径返回源对象本身", () => {
    const src = { a: 1 };
    expect(getByPath(src, "")).toBe(src);
  });

  it("按点分路径逐层下钻", () => {
    expect(getByPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("支持数组下标语法 a[1].x", () => {
    const src = { a: [{ x: 1 }, { x: 2 }] };
    expect(getByPath(src, "a[1].x")).toBe(2);
    expect(getByPath(src, "a[0]")).toBe(src.a[0]);
  });

  it("中间节点为 null/undefined 时返回 undefined（而不是抛错）", () => {
    expect(getByPath({ a: null }, "a.b")).toBeUndefined();
    expect(getByPath({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(getByPath({ a: {} }, "a.missing")).toBeUndefined();
  });
});

describe("setOnObject", () => {
  it("逐层创建缺失的中间对象", () => {
    const target: Record<string, unknown> = {};
    const result = setOnObject(target, "a.b.c", 5);
    expect(result).toBe(target);
    expect(target).toEqual({ a: { b: { c: 5 } } });
  });

  it("覆盖已存在的路径而不破坏兄弟键", () => {
    const target = { a: { b: 1, keep: "x" } };
    setOnObject(target, "a.b", 2);
    expect(target).toEqual({ a: { b: 2, keep: "x" } });
  });

  it("顶级键直接写入", () => {
    const target: Record<string, unknown> = {};
    setOnObject(target, "x", 1);
    expect(target).toEqual({ x: 1 });
  });
});

describe("default* 工厂", () => {
  it("defaultLayout：horizontal 模式与全 0 padding", () => {
    const l = defaultLayout("horizontal");
    expect(l.mode).toBe("horizontal");
    expect(l.items).toBe("start");
    expect(l.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(l.gap).toBe(0);
    expect(l.clipContent).toBe(false);
    expect(l.scroll).toBe("none");
  });

  it("defaultLayout：默认 mode 为 none", () => {
    expect(defaultLayout().mode).toBe("none");
  });

  it("defaultTypography：button 比 text 更紧凑加粗", () => {
    expect(defaultTypography("button")).toMatchObject({ fontSize: 14, fontWeight: 600 });
    expect(defaultTypography("text")).toMatchObject({ fontSize: 16, fontWeight: 400 });
  });

  it("defaultStyle：安全默认值", () => {
    const s = defaultStyle();
    expect(s.fills).toEqual([]);
    expect(s.opacity).toBe(1);
    expect(s.blendMode).toBe("normal");
    expect(s.cornerRadius).toEqual({
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    });
  });

  it("radius：四角同值", () => {
    expect(radius(8)).toEqual({
      topLeft: 8,
      topRight: 8,
      bottomRight: 8,
      bottomLeft: 8,
    });
  });
});

describe("树遍历", () => {
  it("childrenOf：只返回直接子节点", () => {
    const { page } = fixtureDoc();
    const root = page.nodes[page.rootId]!;
    const ids = childrenOf(page, root).map((n) => n.id);
    expect(ids).toEqual(root.children);
  });

  it("descendants：深度优先且含全部后代（不含自身）", () => {
    const { page } = fixtureDoc();
    const root = page.nodes[page.rootId]!;
    const all = descendants(page, root.id);
    expect(all.map((n) => n.name).sort()).toEqual(["A", "B", "C"]);
    // 深度优先顺序：root 先处理 A（含其子树 C），再处理 B
    expect(all.map((n) => n.name)).toEqual(["A", "C", "B"]);
    // 自身不在后代里
    expect(all.some((n) => n.id === root.id)).toBe(false);
  });

  it("descendants：叶子节点返回空数组", () => {
    const { page } = fixtureDoc();
    const a = page.nodes[page.rootId]!.children
      .map((id) => page.nodes[id]!)
      .find((n) => n.name === "A")!;
    const c = a.children.map((id) => page.nodes[id]!).find((n) => n.name === "C")!;
    expect(descendants(page, c.id)).toEqual([]);
  });

  it("ancestors：从近到远排出父链（不含自身）", () => {
    const { page } = fixtureDoc();
    const root = page.nodes[page.rootId]!;
    const c = page.nodes[page.rootId]!.children
      .map((id) => page.nodes[id]!)
      .find((n) => n.name === "A")!
      .children.map((id) => page.nodes[id]!)
      .find((n) => n.name === "C")!;
    const chain = ancestors(page, c.id).map((n) => n.id);
    expect(chain).toEqual([c.parentId, root.id]);
  });

  it("ancestors：根节点返回空", () => {
    const { page } = fixtureDoc();
    expect(ancestors(page, page.rootId)).toEqual([]);
  });

  it("isDescendant：正确判定上下级关系", () => {
    const { page } = fixtureDoc();
    const root = page.nodes[page.rootId]!;
    const a = page.nodes[page.rootId]!.children
      .map((id) => page.nodes[id]!)
      .find((n) => n.name === "A")!;
    const c = a.children.map((id) => page.nodes[id]!).find((n) => n.name === "C")!;
    expect(isDescendant(page, c.id, root.id)).toBe(true);
    expect(isDescendant(page, a.id, root.id)).toBe(true);
    expect(isDescendant(page, root.id, c.id)).toBe(false);
  });

  it("getNode / requireNode：命中与缺失", () => {
    const { page } = fixtureDoc();
    const a = page.nodes[page.rootId]!.children
      .map((id) => page.nodes[id]!)
      .find((n) => n.name === "A")!;
    expect(getNode(page, a.id)).toBe(a);
    expect(getNode(page, "nope")).toBeUndefined();
    expect(requireNode(page, a.id)).toBe(a);
    expect(() => requireNode(page, "nope")).toThrowError(/not found/);
  });

  it("walk：按深度优先访问全树", () => {
    const { page } = fixtureDoc();
    const visited: string[] = [];
    walk(page, (n) => visited.push(n.id));
    const expected = [page.rootId, ...page.nodes[page.rootId]!.children];
    expect(visited[0]).toBe(page.rootId);
    // 4 个节点：root / A / C / B
    expect(new Set(visited).size).toBe(4);
    expect(visited).toContain(expected[0]);
  });

  it("walkDocument：跨所有页面访问", () => {
    const { doc } = fixtureDoc();
    const seen: string[] = [];
    walkDocument(doc, (n) => seen.push(n.id));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).toContain(doc.pages[0]!.rootId);
  });
});

describe("instantiateComponent", () => {
  it("克隆主组件子树为 instance，并带上 variantProps，但不回写文档", () => {
    const { doc, page } = fixtureDoc();
    const root = page.nodes[page.rootId]!;
    const cmpRoot = createNode({ type: "frame", name: "CmpRoot" });
    const cmpChild = createNode({
      type: "text",
      parentId: cmpRoot.id,
      text: "hi",
    });
    attach(page, root.id, cmpRoot);
    attach(page, cmpRoot.id, cmpChild);

    const component: ComponentDefinition = {
      id: "cmp1",
      name: "MyCmp",
      rootId: cmpRoot.id,
      props: [{ name: "size", type: "select", default: "lg" }],
      variants: [],
      slots: [],
    };

    const { instance, copiedIds } = instantiateComponent(
      doc,
      component,
      root.id,
      page.id,
    );

    expect(instance.type).toBe("instance");
    expect(instance.componentId).toBe("cmp1");
    expect(instance.parentId).toBe(root.id);
    expect(instance.variantProps).toEqual({ size: "lg" });
    // 三份：instance 自身 + 容器 body + 克隆出来的 text 子节点
    expect(copiedIds.length).toBe(3);
    // 函数只返回实例，不负责登记进文档
    expect(page.nodes[instance.id]).toBeUndefined();
  });
});
