import { describe, expect, it } from "vitest";
import { createDocument, createNode, createPage, findPage } from "../src/nodes";
import { applyPatch, invertPatch } from "../src/patch";
import type { PatchOp } from "../src/patch";
import type { ComponentDefinition } from "../src/types";
import { DesignStore, manualCommand } from "../src/commands";

/**
 * addComponent 的撤销（§150）。
 *
 * 抓的是与 addAsset 同一形状的洞：addComponent 在 AI 的补丁词汇表里是可达路径
 * （`packages/schemas` 的 patch schema 与 ai-service 的 design prompt 都列着它），
 * 但逆操作过去只在"目录里本来就有同 id 的那一条"时才写。于是 AI 新建组件后按撤销，
 * 定义仍留在目录里——用户看到的就是"撤不掉"。
 * removeComponent 顺带要清掉引用它的实例节点，不留悬空 componentId
 * （§159：清单没了但画布还指着它，是同一类谎）。
 */

function componentOf(id: string, name = id): ComponentDefinition {
  return { id, name, rootId: "n_root", props: [], variants: [], slots: [] };
}

/** 画布上有一个引用组件的实例节点；目录由用例自己填 */
function seedWithInstance(componentId = "cmp-1") {
  const doc = createDocument("Demo", "website");
  const page = doc.pages[0]!;
  const instance = createNode({
    type: "instance",
    name: "Button instance",
    parentId: page.rootId,
    componentId,
  });
  page.nodes[instance.id] = instance;
  page.nodes[page.rootId]!.children = [instance.id];
  return { doc, page, instance };
}

const nodeOf = (doc: ReturnType<typeof createDocument>, id: string) =>
  findPage(doc, doc.activePageId)!.nodes[id]!;

describe("addComponent 的撤销（§150：所有编辑都要可撤销）", () => {
  it("一次事务里的「建组件 + 放实例」：撤销一起收回，重做一起回来", () => {
    const doc = createDocument("Demo", "website");
    const page = doc.pages[0]!;
    const store = new DesignStore(doc);
    const instance = createNode({
      type: "instance",
      name: "按钮实例",
      parentId: page.rootId,
      componentId: "cmp-new",
    });

    store.execute(
      manualCommand("新建组件并放一个实例", {
        pageId: doc.activePageId,
        ops: [
          { op: "addComponent", component: componentOf("cmp-new", "按钮") },
          { op: "insert", node: instance, parentId: page.rootId },
        ],
      }),
    );
    const made = store.getDocument();
    expect(made.components.map((c) => c.id)).toEqual(["cmp-new"]);
    expect(nodeOf(made, instance.id).componentId).toBe("cmp-new");

    store.undo();
    const after = store.getDocument();
    // 这一条曾经是洞：addComponent 的逆操作过去只在"目录里本来就有同 id 那一条"时写还原，
    // 新建那一路什么都不写，于是撤销只收回了实例节点、定义永久留在目录里
    expect(after.components, "撤销之后目录里还留着这个组件").toHaveLength(0);
    expect(Object.keys(findPage(after, after.activePageId)!.nodes)).not.toContain(instance.id);

    store.redo();
    const redone = store.getDocument();
    expect(redone.components.map((c) => c.id)).toEqual(["cmp-new"]);
    expect(nodeOf(redone, instance.id).componentId).toBe("cmp-new");
  });

  it("覆盖同 id 的组件时撤销是还原而不是删除", () => {
    const { doc, instance } = seedWithInstance("cmp-1");
    doc.components = [componentOf("cmp-1", "旧名字")];
    const store = new DesignStore(doc);

    store.execute(
      manualCommand("改组件定义", {
        pageId: doc.activePageId,
        ops: [{ op: "addComponent", component: componentOf("cmp-1", "新名字") }],
      }),
    );
    expect(store.getDocument().components[0]!.name).toBe("新名字");

    store.undo();
    const back = store.getDocument();
    expect(back.components).toHaveLength(1);
    expect(back.components[0]!.name, "撤销没还原成目录里原来那一条").toBe("旧名字");
    expect(nodeOf(back, instance.id).componentId, "还原一次定义不该把引用它的实例清空").toBe("cmp-1");
  });

  it("逆操作在新增那一路写的是 removeComponent，覆盖那一路仍是还原", () => {
    const { doc } = seedWithInstance("cmp-2");
    const patch = {
      pageId: doc.activePageId,
      ops: [{ op: "addComponent", component: componentOf("cmp-2", "新的") } as PatchOp],
    };

    doc.components = [componentOf("cmp-2", "旧的")];
    expect(invertPatch(doc, patch).ops.map((o) => `${o.op}:${"component" in o ? o.component.name : ""}`)).toEqual([
      "addComponent:旧的",
    ]);

    doc.components = [];
    const inverse = invertPatch(doc, patch);
    expect(inverse.ops.map((o) => (o.op === "removeComponent" ? `${o.op}:${o.componentId}` : o.op))).toEqual([
      "removeComponent:cmp-2",
    ]);
  });

  it("removeComponent 删掉定义时把引用它的实例一起解开", () => {
    const { doc, instance } = seedWithInstance("cmp-4");
    doc.components = [componentOf("cmp-4", "按钮")];
    const result = applyPatch(doc, {
      pageId: doc.activePageId,
      ops: [{ op: "removeComponent", componentId: "cmp-4" }],
    });
    expect(result.skipped).toEqual([]);
    expect(result.document.components).toHaveLength(0);
    expect(nodeOf(result.document, instance.id).componentId).toBeUndefined();
  });

  it("对不存在的 id 记账跳过，不把没生效的操作说成成功（与 removeAsset 同一条规则）", () => {
    const { doc } = seedWithInstance("cmp-3");
    doc.components = [componentOf("cmp-3", "按钮")];
    const result = applyPatch(doc, {
      pageId: doc.activePageId,
      ops: [{ op: "removeComponent", componentId: "cmp-missing" }],
    });
    expect(result.skipped, "跳过没被记账").toHaveLength(1);
    expect(result.skipped[0]!.reason).toContain("cmp-missing");
    expect(result.document.components.map((c) => c.id)).toEqual(["cmp-3"]);
  });

  it("撤销 removeComponent：定义与所有页面上的实例链接一起回来，重做又一起解开", () => {
    const { doc, instance } = seedWithInstance("cmp-6");
    doc.components = [componentOf("cmp-6", "按钮")];
    // 第二页也放一个引用它的实例：组件是文档级真值，清理与还原都不能只看当前页（§149）
    const other = createPage("第二页");
    const otherInstance = createNode({
      type: "instance",
      name: "另一个实例",
      parentId: other.rootId,
      componentId: "cmp-6",
    });
    other.nodes[otherInstance.id] = otherInstance;
    other.nodes[other.rootId]!.children = [otherInstance.id];
    doc.pages.push(other);

    const store = new DesignStore(doc);
    store.execute(
      manualCommand("删除组件", {
        ops: [{ op: "removeComponent", componentId: "cmp-6" }],
      }),
    );
    const deleted = store.getDocument();
    expect(deleted.components).toHaveLength(0);
    expect(nodeOf(deleted, instance.id).componentId).toBeUndefined();
    expect(
      findPage(deleted, other.id)!.nodes[otherInstance.id]!.componentId,
      "只清了当前页，另一页的实例还悬空指着它"
    ).toBeUndefined();

    store.undo();
    const back = store.getDocument();
    expect(back.components.map((c) => c.id)).toEqual(["cmp-6"]);
    expect(nodeOf(back, instance.id).componentId, "撤销只放回定义，链接没接回来").toBe("cmp-6");
    expect(findPage(back, other.id)!.nodes[otherInstance.id]!.componentId).toBe("cmp-6");

    store.redo();
    const redone = store.getDocument();
    expect(redone.components).toHaveLength(0);
    expect(nodeOf(redone, instance.id).componentId).toBeUndefined();
    expect(findPage(redone, other.id)!.nodes[otherInstance.id]!.componentId).toBeUndefined();
  });
});
