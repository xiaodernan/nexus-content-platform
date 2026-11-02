import { describe, expect, it } from "vitest";
import {
  createDocument,
  createNode,
  createPage,
  findPage,
} from "../src/nodes";
import { applyPatch, diffPatch, invertPatch } from "../src/patch";
import type { PatchOp } from "../src/patch";
import { syncInstanceOps } from "../src/components";
import type { ComponentDefinition, DesignDocument, Page } from "../src/types";
import { DesignStore, manualCommand } from "../src/commands";

/**
 * §13 组件实例化的补丁入口（`instantiate` op）。
 *
 * 这片要还的债是"模型 API 有实现、没有入口"：`instantiateComponent` 早就能复制主组件子树，
 * 但它只回一份节点表、不负责落库，而补丁词汇表里没有一条 op 会去调用它——
 * 于是画布上想放一个组件实例，只能靠 AI 手写 `insert` 逐个节点堆（或者根本放不进去）。
 *
 * 用例盯的四件事：
 * ① 复制出来的整份子树一起进页面（漏一半就是"壳子在、内容没来"那种悬空）；
 * ② 主组件那份真值一个字都不动，实例与它不共享可变对象；
 * ③ 每道校验都写在任何落笔之前——被跳过的那一刀不许留下半个节点；
 * ④ 撤销一次，实例连同它的子树整份消失（§150 说所有编辑可撤销，撤一半不算）。
 */

/** 主组件：一个 container 根，下挂 text + icon 两个子节点 */
function seed(opts: { masterOnOtherPage?: boolean } = {}) {
  const doc = createDocument("Demo", "website");
  const home = doc.pages[0]!;
  const host: Page = opts.masterOnOtherPage ? createPage("组件页") : home;
  if (opts.masterOnOtherPage) doc.pages.push(host);

  const root = createNode({
    type: "component",
    name: "按钮主组件",
    parentId: host.rootId,
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
  host.nodes[root.id] = root;
  host.nodes[label.id] = label;
  host.nodes[icon.id] = icon;
  host.nodes[host.rootId]!.children = [...host.nodes[host.rootId]!.children, root.id];

  const component: ComponentDefinition = {
    id: "cmp-btn",
    name: "按钮",
    rootId: root.id,
    pageId: host.id,
    props: [{ name: "label", type: "text", default: "提交" }],
    variants: [],
    slots: [],
  };
  doc.components = [component];
  return { doc, home, host, root, label, icon, component };
}

/** 当前页上的节点表（跨页用例各自取自己那页） */
const nodesOn = (doc: DesignDocument, pageId: string) =>
  Object.keys(findPage(doc, pageId)!.nodes);

describe("instantiate：把主组件复制一份放到当前页（§13）", () => {
  it("整份子树一起进页面，实例带 componentId / variantProps / 主组件的尺寸", () => {
    const { doc, home, root } = seed();
    const before = nodesOn(doc, home.id).length;

    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [
        { op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" },
      ],
    });

    expect(result.skipped).toEqual([]);
    const page = findPage(result.document, home.id)!;
    const instance = page.nodes["ins_1"]!;
    // 实例根 + 主体 + 主体下的两个子节点 = 4 个新节点；只挂进实例壳子是"看着放成功了、画布上什么都没有"
    expect(nodesOn(result.document, home.id)).toHaveLength(before + 4);
    expect(instance.type).toBe("instance");
    expect(instance.componentId).toBe("cmp-btn");
    expect(instance.parentId).toBe(home.rootId);
    expect(page.nodes[home.rootId]!.children).toContain("ins_1");
    expect(instance.size).toEqual({ width: 120, height: 40 });
    expect(instance.variantProps).toEqual({ label: "提交" });

    // 主体是复制出来的 container（不是主组件那个 component 节点），下面两个子节点也在
    const bodyId = instance.children[0]!;
    expect(page.nodes[bodyId]!.type).toBe("container");
    expect(page.nodes[bodyId]!.children).toHaveLength(2);
    expect(page.nodes[bodyId]!.id).not.toBe(root.id);
    for (const childId of page.nodes[bodyId]!.children) {
      expect(page.nodes[childId]!.parentId).toBe(bodyId);
    }
  });

  it("主组件是一行文字时，复制体仍是 text：改成 container 会让它不排版自己的文字", () => {
    const doc = createDocument("Demo", "website");
    const home = doc.pages[0]!;
    const leaf = createNode({
      type: "text",
      name: "标题",
      parentId: home.rootId,
      text: "从一句话到一个可发布的产品",
      size: { width: "fill", height: "hug" },
    });
    home.nodes[leaf.id] = leaf;
    home.nodes[home.rootId]!.children = [...home.nodes[home.rootId]!.children, leaf.id];
    doc.components = [
      { id: "cmp-leaf", name: "标题", rootId: leaf.id, props: [], variants: [], slots: [] },
    ];

    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [{ op: "instantiate", componentId: "cmp-leaf", instanceId: "ins_1" }],
    });
    expect(result.skipped).toEqual([]);
    const page = findPage(result.document, home.id)!;
    const body = page.nodes[page.nodes["ins_1"]!.children[0]!]!;
    expect(body.type).toBe("text");
    expect(body.text).toBe("从一句话到一个可发布的产品");
    expect(body.size).toEqual({ width: "fill", height: "hug" });
    // 实例壳子跟着主组件的尺寸走（它自己不排版，只包住复制体）
    expect(page.nodes["ins_1"]!.size).toEqual({ width: "fill", height: "hug" });
  });

  it("主组件那份真值不动，实例与它不共享可变对象", () => {
    const { doc, home, label } = seed();
    const before = nodesOn(doc, home.id).length;
    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [{ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" }],
    });

    // 入参文档没被原地改：实例只出现在新文档里（§16 唯一写入方 + 结构共享的纪律）
    expect(doc.pages[0]!.nodes["ins_1"]).toBeUndefined();
    expect(nodesOn(doc, home.id)).toHaveLength(before);

    const page = findPage(result.document, home.id)!;
    const bodyId = page.nodes["ins_1"]!.children[0]!;
    const copyLabelId = page.nodes[bodyId]!.children[0]!;
    expect(page.nodes[copyLabelId]!.text).toBe("提交");
    // 改实例里那份文字，主组件上的原字不许跟着变
    const edited = applyPatch(result.document, {
      pageId: home.id,
      ops: [{ op: "set", nodeId: copyLabelId, path: "text", value: "取消" }],
    });
    expect(findPage(edited.document, home.id)!.nodes[copyLabelId]!.text).toBe("取消");
    expect(edited.document.pages[0]!.nodes[label.id]!.text).toBe("提交");
    expect(findPage(edited.document, home.id)!.nodes[label.id]!.text).toBe("提交");
  });

  it("主组件住在另一页时，实例落到补丁指定的那一页，源页一个节点都不多", () => {
    const { doc, home, host } = seed({ masterOnOtherPage: true });
    const hostBefore = nodesOn(doc, host.id).length;

    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [
        {
          op: "instantiate",
          componentId: "cmp-btn",
          instanceId: "ins_1",
          parentId: home.rootId,
          index: 0,
        },
      ],
    });

    expect(result.skipped).toEqual([]);
    expect(nodesOn(result.document, home.id)).toContain("ins_1");
    // 源页只做读：它上面多出来的节点会是"组件页里悄悄长出一个副本"
    expect(nodesOn(result.document, host.id)).toHaveLength(hostBefore);
    expect(findPage(result.document, home.id)!.nodes[home.rootId]!.children[0]).toBe("ins_1");
  });

  it("同一条补丁里放两次得到两份互不相干的实例", () => {
    const { doc, home } = seed();
    const before = findPage(doc, home.id)!.nodes[home.rootId]!.children;
    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [
        { op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" },
        { op: "instantiate", componentId: "cmp-btn", instanceId: "ins_2" },
      ],
    });
    expect(result.skipped).toEqual([]);
    expect(result.touchedNodeIds).toContain("ins_1");
    expect(result.touchedNodeIds).toContain("ins_2");
    const children = findPage(result.document, home.id)!.nodes[home.rootId]!.children;
    // 按 op 顺序追加，且不碰这一刀之前的兄弟节点
    expect(children).toEqual([...before, "ins_1", "ins_2"]);
    // 两棵子树各自独立：复制体的 id 不重用，撤销其中一份不会把另一份带掉
    const ids = new Set(nodesOn(result.document, home.id));
    const subtreeOf = (instanceId: string): string[] => {
      const page = findPage(result.document, home.id)!;
      const out: string[] = [];
      const visit = (id: string) => {
        out.push(id);
        for (const child of page.nodes[id]?.children ?? []) visit(child);
      };
      visit(instanceId);
      return out;
    };
    const first = subtreeOf("ins_1");
    const second = subtreeOf("ins_2");
    expect(first).toHaveLength(4);
    expect(second).toHaveLength(4);
    expect(first.filter((id) => second.includes(id))).toEqual([]);
    expect(ids.size).toBe(nodesOn(doc, home.id).length + 8);
  });

  it("目录里没有这颗组件：记账跳过，页面上不留半个节点", () => {
    const { doc, home } = seed();
    const before = nodesOn(doc, home.id).length;
    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [
        { op: "instantiate", componentId: "cmp-missing", instanceId: "ins_1" },
      ],
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toContain("cmp-missing");
    expect(nodesOn(result.document, home.id)).toHaveLength(before);
  });

  it("组件在目录里但根节点找不到：记账跳过，不猜一个根来复制", () => {
    const { doc, home, component } = seed();
    doc.components = [{ ...component, rootId: "n_nowhere" }];
    const before = nodesOn(doc, home.id).length;
    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [{ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" }],
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toContain("n_nowhere");
    expect(nodesOn(result.document, home.id)).toHaveLength(before);
  });

  it("instanceId 撞上页面上已有的节点：跳过，且不覆盖那个节点", () => {
    const { doc, home, root } = seed();
    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [
        { op: "instantiate", componentId: "cmp-btn", instanceId: root.id },
      ],
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toContain("duplicate node id");
    // 覆盖会表现为"主组件变成一个 instance 壳子"——比报错更难查，所以挡在写之前
    expect(findPage(result.document, home.id)!.nodes[root.id]!.type).toBe("component");
  });

  it("instanceId 撞在别的面上的节点：也跳过（节点 id 跨页重复没有任何门会拦）", () => {
    const { doc, home, host, root } = seed({ masterOnOtherPage: true });
    // 这一句是这条用例的前提，也是它的牙：id 只在**另一页**上，只看当前页的写法会放它过去
    expect(findPage(doc, home.id)!.nodes[root.id]).toBeUndefined();
    const before = nodesOn(doc, home.id).length;
    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [
        { op: "instantiate", componentId: "cmp-btn", instanceId: root.id },
      ],
    });
    expect(result.skipped[0]!.reason).toContain("duplicate node id");
    expect(nodesOn(result.document, home.id)).toHaveLength(before);
    // 别页那一颗还是主组件根，没被顶成 instance 壳子
    expect(findPage(result.document, host.id)!.nodes[root.id]!.type).toBe(
      "component",
    );
  });

  it("父节点不存在：记账跳过（与 insert 同一口径）", () => {
    const { doc, home } = seed();
    const before = nodesOn(doc, home.id).length;
    const result = applyPatch(doc, {
      pageId: home.id,
      ops: [
        {
          op: "instantiate",
          componentId: "cmp-btn",
          instanceId: "ins_1",
          parentId: "n_no_parent",
        },
      ],
    });
    expect(result.skipped[0]!.reason).toContain("n_no_parent");
    expect(nodesOn(result.document, home.id)).toHaveLength(before);
  });
});

describe("instantiate 的撤销（§150）", () => {
  it("逆操作就是一条 remove，指向 op 点名的那颗实例", () => {
    const { doc, home } = seed();
    const ops: PatchOp[] = [
      { op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" },
    ];
    const inverse = invertPatch(doc, { pageId: home.id, ops });
    expect(inverse.ops).toEqual([{ op: "remove", nodeId: "ins_1" }]);
  });

  it("撤销把实例连同复制出来的子树整份收走，重做原样回来", () => {
    const { doc, home } = seed();
    const store = new DesignStore(doc);
    const start = nodesOn(doc, home.id).length;

    store.execute(
      manualCommand("放入按钮实例", {
        pageId: home.id,
        ops: [{ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" }],
      }),
    );
    const placed = store.getDocument();
    expect(nodesOn(placed, home.id)).toHaveLength(start + 4);
    const bodyId = findPage(placed, home.id)!.nodes["ins_1"]!.children[0]!;

    store.undo();
    const back = store.getDocument();
    // 「壳子还在、子树没了」和「一个都没撤」都算撤失败：数量必须整份回到起点
    expect(nodesOn(back, home.id)).toHaveLength(start);
    expect(findPage(back, home.id)!.nodes["ins_1"]).toBeUndefined();
    expect(findPage(back, home.id)!.nodes[bodyId]).toBeUndefined();
    expect(findPage(back, home.id)!.nodes[home.rootId]!.children).not.toContain("ins_1");

    store.redo();
    const redone = store.getDocument();
    expect(nodesOn(redone, home.id)).toHaveLength(start + 4);
    expect(findPage(redone, home.id)!.nodes["ins_1"]!.componentId).toBe("cmp-btn");
    expect(
      findPage(redone, home.id)!.nodes[findPage(redone, home.id)!.nodes["ins_1"]!.children[0]!]!
        .children,
    ).toHaveLength(2);
  });

  it("撤销后主组件仍可再实例化一次（复制不消耗目录条目）", () => {
    const { doc, home } = seed();
    const store = new DesignStore(doc);
    store.execute(
      manualCommand("放入按钮实例", {
        pageId: home.id,
        ops: [{ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" }],
      }),
    );
    store.undo();
    store.execute(
      manualCommand("再放一次", {
        pageId: home.id,
        ops: [{ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_2" }],
      }),
    );
    const after = store.getDocument();
    expect(findPage(after, home.id)!.nodes["ins_2"]!.componentId).toBe("cmp-btn");
    expect(store.getState().canUndo).toBe(true);
  });

  it("引用计数跟着走：放一次多一个引用，删组件把它解开", () => {
    const { doc, home } = seed();
    const refs = (d: DesignDocument) => {
      let n = 0;
      for (const page of d.pages) {
        for (const node of Object.values(page.nodes)) if (node.componentId === "cmp-btn") n += 1;
      }
      return n;
    };
    expect(refs(doc)).toBe(0); // 只有主组件，它自己不参与引用
    const placed = applyPatch(doc, {
      pageId: home.id,
      ops: [{ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" }],
    }).document;
    expect(refs(placed)).toBe(1);

    const removed = applyPatch(placed, {
      ops: [{ op: "removeComponent", componentId: "cmp-btn" }],
    }).document;
    // 删组件带走定义并解开引用：实例节点还在画布上，但它不再声称自己属于谁
    expect(removed.components).toHaveLength(0);
    expect(refs(removed)).toBe(0);
  });
});

describe("instantiate 的 AI Diff（§151）", () => {
  it("报「哪颗组件的一次实例化」，而不是一个孤零零的 instance 节点", () => {
    const { doc, home } = seed();
    const entries = diffPatch(doc, {
      pageId: home.id,
      ops: [{ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("added");
    expect(entries[0]!.nodeName).toBe("按钮");
    expect(entries[0]!.after).toBe("实例：按钮");
    expect(entries[0]!.nodeId).toBe("ins_1");
  });
});

describe("同一串 op 在两份文档上各打一次（客户端一份、服务端一份）", () => {
  /**
   * 自动保存走的是补丁这条路：客户端改内存里这一份，同一条 op 再送去服务端，
   * 服务端在**库里那一份**上重新 apply 一遍（`patchProjectDocument`）。
   * 所以一条 op 必须保证两次 apply 产出**同一份文档**——否则两边只是"看起来一样"。
   *
   * 2026-11-03 由 e2e 的 PATCH 计数抓到：复制体的 id 过去用 `uid()` 现场摇，两份文档各得一套，
   * 于是任何点名复制体内部节点的后续 op（"更新实例"要先 remove 掉旧复制体）在服务端那份上
   * `node ... not found` → 整批 409 → 客户端换整份 PUT 兜底，界面照样好看，缺陷看不见。
   * 下面这两条就是把那条路钉在模型层，不用等浏览器。
   */
  it("复制体的 id 一模一样（不是各摇一套随机数）", () => {
    const { doc, home } = seed();
    const patch = {
      pageId: home.id,
      ops: [{ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" }] as PatchOp[],
    };
    const client = applyPatch(structuredClone(doc), patch).document;
    const server = applyPatch(structuredClone(doc), patch).document;

    expect(nodesOn(client, home.id).sort()).toEqual(nodesOn(server, home.id).sort());
  });

  it("从客户端那份算出来的「更新实例」那一串，在服务端那份上一条都不落空", () => {
    const { doc, home } = seed();
    const place = {
      pageId: home.id,
      ops: [{ op: "instantiate", componentId: "cmp-btn", instanceId: "ins_1" }] as PatchOp[],
    };
    const client = applyPatch(structuredClone(doc), place).document;
    const server = applyPatch(structuredClone(doc), place).document;
    // 主组件改文案：两份都要改（同一份真值），这一步与复制体无关，不会引入 id 差别
    for (const d of [client, server]) {
      const page = findPage(d, home.id)!;
      const labelId = page.nodes[d.components[0]!.rootId]!.children.find(
        (id) => page.nodes[id]!.type === "text",
      )!;
      page.nodes[labelId]!.text = "改过了";
    }

    // 「更新实例」那一串是从客户端那份算出来的：第一条就点名复制体里那颗节点
    const ops = syncInstanceOps(client, client.components[0]!, "ins_1");
    expect(ops[0]!.op).toBe("remove");
    const landed = applyPatch(server, { pageId: home.id, ops });
    expect(landed.skipped).toEqual([]);
    expect(findPage(landed.document, home.id)!.nodes["ins_1"]!.children).toHaveLength(1);
  });
});
