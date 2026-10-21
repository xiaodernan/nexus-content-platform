import { describe, expect, it } from "vitest";
import {
  applyInstanceOverrides,
  findDuplicateComponents,
  findUnusedComponents,
  matchVariant,
  variantMatrix,
  withState,
} from "../src/components";
import { createNode, createPage } from "../src/nodes";
import type { ComponentDefinition, DesignNode, Page } from "../src/types";

function baseComponent(over: Partial<ComponentDefinition> = {}): ComponentDefinition {
  return {
    id: "cmp",
    name: "Cmp",
    rootId: "r",
    props: [],
    variants: [],
    slots: [],
    ...over,
  };
}

function instancePage(): { page: Page; instance: DesignNode; body: DesignNode; label: DesignNode } {
  const page = createPage("p");
  const instance = createNode({ type: "instance", name: "I" });
  const body = createNode({ type: "frame", parentId: instance.id, name: "Body" });
  const label = createNode({ type: "text", parentId: body.id, text: "x", name: "Label" });
  page.nodes[instance.id] = instance;
  page.nodes[body.id] = body;
  page.nodes[label.id] = label;
  instance.children = [body.id];
  body.children = [label.id];
  return { page, instance, body, label };
}

describe("matchVariant", () => {
  const component = baseComponent({
    variants: [
      { id: "v-lg", props: { size: "lg" }, overrides: {} },
      { id: "v-hover", props: { size: "sm", state: "hover" }, overrides: {} },
    ],
  });

  it("选出得分最高且全部命中的变体", () => {
    expect(matchVariant(component, { size: "lg" })?.id).toBe("v-lg");
    expect(matchVariant(component, { size: "sm", state: "hover" })?.id).toBe("v-hover");
  });

  it("有属性不匹配则整组作废，返回 null", () => {
    expect(matchVariant(component, { size: "sm", state: "active" })).toBeNull();
    expect(matchVariant(component, { color: "red" })).toBeNull();
  });
});

describe("variantMatrix", () => {
  it("合并变体属性与 select 选项去重（顺序无关）", () => {
    const component = baseComponent({
      props: [{ name: "size", type: "select", options: ["xs", "lg", "sm"], default: "sm" }],
      variants: [
        { id: "v1", props: { size: "lg" }, overrides: {} },
        { id: "v2", props: { size: "sm" }, overrides: {} },
      ],
    });
    const m = variantMatrix(component);
    expect(new Set(m.size)).toEqual(new Set(["xs", "lg", "sm"]));
  });
});

describe("withState", () => {
  it("把状态补丁叠到 style 上并返回克隆，不改动原节点", () => {
    const node = createNode({ type: "frame", name: "N" });
    node.states = { hover: { opacity: 0.5 } };
    const hovered = withState(node, "hover");
    expect(hovered.style.opacity).toBe(0.5);
    expect(hovered).not.toBe(node);
    expect(node.style.opacity).toBe(1);
  });

  it("无 state 或无对应补丁时原样返回（同一引用）", () => {
    const node = createNode({ type: "frame", name: "N" });
    node.states = { hover: { opacity: 0.5 } };
    expect(withState(node, null)).toBe(node);
    expect(withState(node, "focus")).toBe(node);
  });
});

describe("applyInstanceOverrides", () => {
  it("克隆整棵实例子树，rootId 指向实例", () => {
    const { page, instance, label } = instancePage();
    const r = applyInstanceOverrides(page, instance);
    expect(r.rootId).toBe(instance.id);
    // 从实例本体开始收，nodes 含它 + 子树，rootId 才自洽
    expect(Object.keys(r.nodes).sort()).toEqual(
      [instance.id, instance.children[0]!, label.id].sort(),
    );
    expect(r.nodes[instance.id]).toBeDefined();
    expect(r.nodes[label.id]!.text).toBe("x");
  });

  it("实例级 overrides 按路径投影到克隆子树", () => {
    const { page, instance, label } = instancePage();
    instance.overrides = { [label.id]: { "style.opacity": 0.3 } };
    const r = applyInstanceOverrides(page, instance);
    expect(r.nodes[label.id]!.style.opacity).toBe(0.3);
    // 原文档不被改动
    expect(page.nodes[label.id]!.style.opacity).toBe(1);
  });

  it("变体 overrides 在实例 overrides 之上叠加", () => {
    const { page, instance, label } = instancePage();
    const component = baseComponent({
      variants: [
        {
          id: "v-lg",
          props: { size: "lg" },
          overrides: { [label.id]: { "style.opacity": 0.7 } },
        },
      ],
    });
    instance.variantProps = { size: "lg" };
    const r = applyInstanceOverrides(page, instance, component);
    expect(r.nodes[label.id]!.style.opacity).toBe(0.7);
  });
});

describe("findUnusedComponents / findDuplicateComponents", () => {
  it("findUnusedComponents 只返回没有任何节点引用的组件", () => {
    const used = baseComponent({ id: "used" });
    const unused = baseComponent({ id: "unused" });
    const page = createPage("p");
    const inst = createNode({ type: "instance", parentId: page.rootId, name: "inst" });
    inst.componentId = "used";
    page.nodes[inst.id] = inst;
    page.nodes[page.rootId]!.children.push(inst.id);
    const found = findUnusedComponents({ pages: [page], components: [used, unused] });
    expect(found.map((c) => c.id)).toEqual(["unused"]);
  });

  it("findDuplicateComponents 找出同签名组件对", () => {
    const a = baseComponent({ id: "A", props: [{ name: "size", type: "select", default: "lg" }] });
    const b = baseComponent({ id: "B", props: [{ name: "size", type: "select", default: "lg" }] });
    const c = baseComponent({ id: "C", props: [{ name: "kind", type: "select", default: "lg" }] });
    const pairs = findDuplicateComponents([a, b, c]);
    expect(pairs).toHaveLength(1);
    expect([pairs[0]![0].id, pairs[0]![1].id].sort()).toEqual(["A", "B"]);
  });
});
