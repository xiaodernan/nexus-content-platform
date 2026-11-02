import { describe, expect, it } from "vitest";
import { instancesOf, syncInstanceOps } from "../src/components";
import { createDocument, createNode } from "../src/nodes";
import { applyPatch, invertPatch } from "../src/patch";
import type { PatchOp } from "../src/patch";
import type { DesignDocument, DesignNode } from "../src/types";
import { DesignStore, manualCommand } from "../src/commands";

/**
 * §13「实例跟随主组件」：`syncInstanceOps` 产出的是**标准 op 串**（一条 remove + 一串 insert），
 * 不是新的 op 种类。这片要钉住的三件事：
 * ① 主组件改了以后，实例那份复制体真的换成新样子（不是一句"重新放一次"的假话——旧的收走、新的插回）；
 * ② 撤销/重做靠的是 `invertPatch` 现成的那条 `remove` 逆操作（把旧子树捕成 insert 序列），
 *    所以同步是一次可撤销事务（§150），不是只改界面数字；
 * ③ 摆不出来就说摆不出来：实例没了 / 主组件根没了 / 复制体缺了，一律回 `[]`，
 *    调用方据此决定按钮点不点得动，而不是发一条必然 skip 的补丁。
 */

const pageNodes = (doc: DesignDocument, pageId: string): DesignNode[] =>
  Object.values(doc.pages.find((p) => p.id === pageId)!.nodes);

/** 从实例往下走，拿到它自己那份复制体里的节点（主组件那一份同名类型，别混） */
function subtreeOf(doc: DesignDocument, instanceId: string): DesignNode[] {
  const page = doc.pages.find((p) => p.nodes[instanceId])!;
  const out: DesignNode[] = [];
  const visit = (id: string): void => {
    const n = page.nodes[id];
    if (!n) return;
    out.push(n);
    for (const c of n.children) visit(c);
  };
  visit(instanceId);
  return out;
}

const textOf = (doc: DesignDocument, instanceId: string): string[] =>
  subtreeOf(doc, instanceId)
    .filter((n) => n.type === "text")
    .map((n) => n.text ?? "");

function fixture(opts: { secondInstance?: boolean } = {}) {
  const doc = createDocument("Demo", "website");
  const page = doc.pages[0]!;
  const root = createNode({
    type: "component",
    name: "按钮主组件",
    parentId: page.rootId,
    size: { width: 120, height: 40 },
  });
  const label = createNode({
    type: "text",
    name: "标签",
    parentId: root.id,
    text: "提交",
  });
  const icon = createNode({ type: "svg", name: "图标", parentId: root.id });
  root.children = [label.id, icon.id];
  page.nodes[root.id] = root;
  page.nodes[label.id] = label;
  page.nodes[icon.id] = icon;
  page.nodes[page.rootId]!.children = [
    ...page.nodes[page.rootId]!.children,
    root.id,
  ];
  doc.components = [
    {
      id: "cmp-btn",
      name: "按钮",
      rootId: root.id,
      pageId: page.id,
      props: [],
      variants: [],
      slots: [],
    },
  ];

  const ops: PatchOp[] = [
    { op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" },
  ];
  if (opts.secondInstance)
    ops.push({ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_2" });
  const placed = applyPatch(doc, { pageId: page.id, ops });

  const bodyId = placed.document.pages[0]!.nodes["ins_1"]!.children[0]!;
  return {
    doc: placed.document,
    pageId: page.id,
    rootId: root.id,
    labelId: label.id,
    bodyId,
    component: placed.document.components[0]!,
  };
}

describe("syncInstanceOps：实例跟上主组件（§13）", () => {
  it("产出的是标准 op 串：先收走旧复制体，再父在子前逐条插回", () => {
    const f = fixture();
    const ops = syncInstanceOps(f.doc, f.component, "ins_1");

    expect(ops[0]).toEqual({ op: "remove", nodeId: f.bodyId });
    expect(ops.slice(1).every((o) => o.op === "insert")).toBe(true);
    // 父必须排在子前面：insert 只认"此刻文档里已经有的 parentId"
    const known = new Set<string>(["ins_1"]);
    for (const op of ops.slice(1)) {
      if (op.op !== "insert") continue;
      expect(known, `insert ${op.node.name} 的父 ${op.parentId} 还没插进来`).toContain(
        op.parentId,
      );
      expect(op.node.children, "children 交给随后的 insert 重建，跟着塞会叠成双份").toEqual(
        [],
      );
      known.add(op.node.id);
    }
    // 旧复制体是 body + text + svg 三颗，新的一样三颗
    expect(ops).toHaveLength(4);
  });

  it("主组件改文案 → 同步 → 实例那份跟上，页面节点数一格不多", () => {
    const f = fixture();
    const before = pageNodes(f.doc, f.pageId).length;
    expect(textOf(f.doc, "ins_1")).toEqual(["提交"]);

    // 改主组件自己（实例不动）：这正是"改一次要手动重放"的那一格
    const master = f.doc.pages[0]!.nodes[f.labelId]!;
    master.text = "立即购买";
    const synced = applyPatch(f.doc, {
      pageId: f.pageId,
      ops: syncInstanceOps(f.doc, f.component, "ins_1"),
    });

    expect(synced.skipped).toEqual([]);
    expect(textOf(synced.document, "ins_1")).toEqual(["立即购买"]);
    expect(pageNodes(synced.document, f.pageId)).toHaveLength(before);
    // 主组件那份真值还在原处，没被同步顺手搬走
    expect(synced.document.pages[0]!.nodes[f.labelId]!.text).toBe("立即购买");
    // 实例与主组件不共享可变对象：换掉的是复制体那份，id 也不同
    expect(synced.document.pages[0]!.nodes[f.labelId]!.parentId).toBe(f.rootId);
    expect(subtreeOf(synced.document, "ins_1").map((n) => n.id)).not.toContain(
      f.labelId,
    );
  });

  it("撤销把整份旧子树捕回来，不留空壳（逆操作靠 invertPatch 现成的 remove 那一支）", () => {
    const f = fixture();
    f.doc.pages[0]!.nodes[f.labelId]!.text = "立即购买";
    const patch = { pageId: f.pageId, ops: syncInstanceOps(f.doc, f.component, "ins_1") };

    // invertPatch 拿的是**改动前**那份文档：被收走的旧子树要整个捕回来，撤销才不是留个空壳
    const inverse = invertPatch(f.doc, patch);
    const synced = applyPatch(f.doc, patch);
    expect(synced.skipped).toEqual([]);
    expect(textOf(synced.document, "ins_1")).toEqual(["立即购买"]);

    const undone = applyPatch(synced.document, { pageId: f.pageId, ops: inverse.ops });
    expect(undone.skipped, "撤销那几条 insert 一条都不该落空").toEqual([]);
    expect(textOf(undone.document, "ins_1")).toEqual(["提交"]);
    // 撤销后的子树和撤销前一样完整：壳 + body + 文字 + 图标
    expect(subtreeOf(undone.document, "ins_1")).toHaveLength(4);
    // 逆操作串比原串长，这是设计而不是漏：正向用一条 remove 收走整棵旧子树，
    // 逆向只能把捕回来的三颗逐条插回；正向那三条 insert 则各要一条 remove 来撤。
    // 数的是"旧子树整份捕回来了"——三颗一颗不少，才不会撤出一个空壳。
    expect(inverse.ops.filter((o) => o.op === "insert")).toHaveLength(3);
    expect(inverse.ops.filter((o) => o.op === "remove")).toHaveLength(3);
    // 真正的重做走 store 那笔账（下一条用例），这里不拿"逆的逆"当真值：
    // 撤销把新子树的数据收走了，逆的逆只能把那一份旧的再插一遍，量不出"跟上主组件"。
  });

  it("走 store：同步是一笔独立事务，撤销只撤同步、不撤上一笔改主组件", () => {
    const f = fixture();
    const store = new DesignStore(f.doc);

    store.execute(
      manualCommand("改主组件文案", {
        pageId: f.pageId,
        ops: [{ op: "set", nodeId: f.labelId, path: "text", value: "立即购买" }],
      }),
    );
    // 每一笔的 ops 都按**当时**的文档算：上一笔落库后主组件已经是新样子了
    store.execute(
      manualCommand("更新按钮实例", {
        pageId: f.pageId,
        ops: syncInstanceOps(store.getDocument(), store.getDocument().components[0]!, "ins_1"),
      }),
    );
    expect(textOf(store.getDocument(), "ins_1")).toEqual(["立即购买"]);

    store.undo();
    expect(textOf(store.getDocument(), "ins_1")).toEqual(["提交"]);
    // 主组件那份文案是上一笔的成果，撤"同步"不该把它一起带走
    expect(store.getDocument().pages[0]!.nodes[f.labelId]!.text).toBe("立即购买");

    store.redo();
    expect(textOf(store.getDocument(), "ins_1")).toEqual(["立即购买"]);
  });

  it("两颗实例一次事务一起跟上，撤销一次两个都回去", () => {
    const f = fixture({ secondInstance: true });
    const doc = f.doc;
    doc.pages[0]!.nodes[f.labelId]!.text = "立即购买";
    const component = doc.components[0]!;
    const ops = instancesOf(doc, component.id).flatMap((instance) =>
      syncInstanceOps(doc, component, instance.id),
    );
    expect(ops).toHaveLength(8); // 每颗：1 条 remove + 3 条 insert

    const synced = applyPatch(doc, { pageId: f.pageId, ops });
    expect(synced.skipped).toEqual([]);
    expect(textOf(synced.document, "ins_1")).toEqual(["立即购买"]);
    expect(textOf(synced.document, "ins_2")).toEqual(["立即购买"]);

    const undo = applyPatch(synced.document, {
      pageId: f.pageId,
      ops: invertPatch(doc, { pageId: f.pageId, ops }).ops,
    });
    expect(undo.skipped).toEqual([]);
    expect(textOf(undo.document, "ins_1")).toEqual(["提交"]);
    expect(textOf(undo.document, "ins_2")).toEqual(["提交"]);
  });

  it("摆不出来就说摆不出来：实例没了 / 主组件根没了 / 复制体缺一颗，都回空串", () => {
    const f = fixture();
    expect(syncInstanceOps(f.doc, f.component, "ins_没这颗")).toEqual([]);

    const noRoot = structuredClone(f.doc);
    const host = noRoot.pages[0]!;
    delete host.nodes[f.rootId];
    expect(syncInstanceOps(noRoot, f.component, "ins_1")).toEqual([]);

    const noBody = structuredClone(f.doc);
    noBody.pages[0]!.nodes["ins_1"]!.children = [];
    expect(syncInstanceOps(noBody, f.component, "ins_1")).toEqual([]);

    // 壳还挂着 children，但那一颗在文档里已经找不着了（半截事务留下的那种）：
    // 只判 `children[0]` 存不存在是看不见的，必须连"文档里有没有"一起判
    const dangling = structuredClone(f.doc);
    dangling.pages[0]!.nodes["ins_1"]!.children = ["不在这份文档里的 body"];
    expect(syncInstanceOps(dangling, f.component, "ins_1")).toEqual([]);
  });

  it("instancesOf 数的是还接着的那颗：删掉组件定义后一份都不算（别谎称还能同步）", () => {
    const f = fixture({ secondInstance: true });
    expect(instancesOf(f.doc, "cmp-btn").map((n) => n.id)).toEqual([
      "ins_1",
      "ins_2",
    ]);

    const removed = applyPatch(f.doc, {
      pageId: f.pageId,
      ops: [{ op: "removeComponent", componentId: "cmp-btn" }],
    });
    expect(removed.skipped).toEqual([]);
    // 定义解开了，画布上那两颗还在，但已经不再指向任何主组件
    expect(removed.document.components).toEqual([]);
    expect(removed.document.pages[0]!.nodes["ins_1"]).toBeDefined();
    expect(instancesOf(removed.document, "cmp-btn")).toEqual([]);
  });
});
