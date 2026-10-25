import { describe, expect, it } from "vitest";
import { clone, createDocument, createNode, createPage, findPage } from "../src/nodes";
import {
  applyPatch,
  collectSubtree,
  diffPatch,
  invertPatch,
} from "../src/patch";
import type { DesignPatch, PatchOp } from "../src/patch";
import type { AssetRef } from "../src/types";
import { DesignStore, aiCommand, manualCommand } from "../src/commands";

function seed() {
  const doc = createDocument("Demo", "website");
  const page = doc.pages[0]!;
  const hero = createNode({
    type: "section",
    name: "Hero",
    parentId: page.rootId,
    size: { width: "fill", height: 320 },
  });
  const title = createNode({
    type: "text",
    name: "Title",
    parentId: hero.id,
    text: "CREATE YOUR UNIVERSE",
  });
  const button = createNode({
    type: "button",
    name: "CTA",
    parentId: hero.id,
    text: "Create",
  });
  page.nodes[hero.id] = hero;
  page.nodes[title.id] = title;
  page.nodes[button.id] = button;
  hero.children = [title.id, button.id];
  page.nodes[page.rootId]!.children = [hero.id];
  return { doc, page, hero, title, button };
}

describe("applyPatch", () => {
  it("sets a nested property and reports touched nodes", () => {
    const { doc, hero } = seed();
    const patch: DesignPatch = {
      ops: [{ op: "set", nodeId: hero.id, path: "size.height", value: 480 }],
    };
    const result = applyPatch(doc, patch);
    expect(findPage(result.document)!.nodes[hero.id]!.size.height).toBe(480);
    expect(result.touchedNodeIds).toEqual([hero.id]);
    expect(result.skipped).toEqual([]);
  });

  it("does not mutate the input document", () => {
    const { doc, hero } = seed();
    applyPatch(doc, {
      ops: [{ op: "set", nodeId: hero.id, path: "name", value: "Renamed" }],
    });
    expect(findPage(doc)!.nodes[hero.id]!.name).toBe("Hero");
  });

  it("merges partial objects without clobbering siblings", () => {
    const { doc, hero } = seed();
    const result = applyPatch(doc, {
      ops: [
        { op: "merge", nodeId: hero.id, path: "layout", value: { gap: 24 } },
      ],
    });
    const merged = result.document.pages[0]!.nodes[hero.id]!;
    expect(merged.layout.gap).toBe(24);
    expect(merged.layout.mode).toBe("vertical");
  });

  it("reports skipped ops instead of failing silently (§159)", () => {
    const { doc, hero } = seed();
    const result = applyPatch(doc, {
      ops: [
        { op: "set", nodeId: "ghost", path: "name", value: "x" },
        { op: "remove", nodeId: doc.pages[0]!.rootId },
        { op: "set", nodeId: hero.id, path: "name", value: "ok" },
      ],
    });
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0]!.reason).toContain("ghost");
    expect(result.skipped[1]!.reason).toContain("root");
    expect(result.document.pages[0]!.nodes[hero.id]!.name).toBe("ok");
  });

  it("inserts at an index and removes whole subtrees", () => {
    const { doc, hero, title, button } = seed();
    const extra = createNode({ type: "text", name: "Sub", text: "sub" });
    const inserted = applyPatch(doc, {
      ops: [{ op: "insert", node: extra, parentId: hero.id, index: 0 }],
    });
    expect(inserted.document.pages[0]!.nodes[hero.id]!.children).toEqual([
      extra.id,
      title.id,
      button.id,
    ]);

    const removed = applyPatch(inserted.document, {
      ops: [{ op: "remove", nodeId: hero.id }],
    });
    expect(
      collectSubtree(
        removed.document.pages[0]!,
        removed.document.pages[0]!.rootId,
      ),
    ).toHaveLength(1);
    expect(removed.document.pages[0]!.nodes[hero.id]).toBeUndefined();
    expect(removed.document.pages[0]!.nodes[button.id]).toBeUndefined();
  });

  it("refuses reparenting into own descendant", () => {
    const { doc, hero, title } = seed();
    const result = applyPatch(doc, {
      ops: [{ op: "reparent", nodeId: hero.id, parentId: title.id }],
    });
    expect(result.skipped[0]!.reason).toContain("cycle");
  });

  it("applies token ops at document level", () => {
    const { doc } = seed();
    const result = applyPatch(doc, {
      ops: [{ op: "setToken", key: "color.primary", value: "#ff0000" }],
    });
    expect(
      result.document.tokens.find((t) => t.key === "color.primary")!.value,
    ).toBe("#ff0000");
  });
});

describe("invertPatch", () => {
  it("restores a set operation", () => {
    const { doc, hero } = seed();
    const patch: DesignPatch = {
      ops: [{ op: "set", nodeId: hero.id, path: "size.height", value: 480 }],
    };
    const inverse = invertPatch(doc, patch);
    const after = applyPatch(applyPatch(doc, patch).document, inverse);
    expect(after.document.pages[0]!.nodes[hero.id]!.size.height).toBe(320);
  });

  it("撤销「往空处新增字段」发 unset：序列化后不是一条没值的 set", () => {
    const { doc, title } = seed();
    expect(title.states).toBeUndefined();
    const patch: DesignPatch = {
      ops: [
        {
          op: "set",
          nodeId: title.id,
          path: "states.hover",
          value: { opacity: 0.5 },
        },
      ],
    };
    const inverse = invertPatch(doc, patch);
    expect(inverse.ops).toEqual([
      { op: "unset", nodeId: title.id, path: "states.hover" },
    ]);

    // 走一遍报文：JSON 会丢掉 value=undefined 的键，而少一个键的 set 在服务端是 `value: 非必填` 被拒
    const wire = JSON.parse(JSON.stringify({ patches: [inverse] })) as {
      patches: DesignPatch[];
    };
    expect(wire.patches[0]!.ops[0]).toEqual({
      op: "unset",
      nodeId: title.id,
      path: "states.hover",
    });

    const undone = applyPatch(
      applyPatch(doc, patch).document,
      wire.patches[0]!,
    ).document;
    const node = findPage(undone, patch.pageId ?? undone.activePageId)!.nodes[
      title.id
    ]!;
    expect(node.states?.hover).toBeUndefined();
  });

  it("unset 的逆把原值放回来：删掉一个本来存在的字段可以回滚", () => {
    const { doc, title } = seed();
    const withState = applyPatch(doc, {
      ops: [
        {
          op: "set",
          nodeId: title.id,
          path: "states.hover",
          value: { opacity: 0.5 },
        },
      ],
    }).document;
    const del: DesignPatch = {
      ops: [{ op: "unset", nodeId: title.id, path: "states.hover" }],
    };
    const inverse = invertPatch(withState, del);
    expect(inverse.ops).toEqual([
      {
        op: "set",
        nodeId: title.id,
        path: "states.hover",
        value: { opacity: 0.5 },
      },
    ]);
    const after = applyPatch(applyPatch(withState, del).document, inverse)
      .document;
    expect(
      findPage(after, after.activePageId)!.nodes[title.id]!.states?.hover,
    ).toEqual({ opacity: 0.5 });
  });

  it("unset 对本来就没有的字段是幂等的：不跳过、不报错", () => {
    const { doc, title } = seed();
    const result = applyPatch(doc, {
      ops: [{ op: "unset", nodeId: title.id, path: "states.hover.opacity" }],
    });
    expect(result.skipped).toEqual([]);
    expect(result.touchedNodeIds).toContain(title.id);
    expect(
      findPage(result.document, result.document.activePageId)!.nodes[title.id]!
        .states,
    ).toBeUndefined();
  });

  it("restores merges partially (only patched keys)", () => {
    const { doc, hero } = seed();
    const patch: DesignPatch = {
      ops: [
        { op: "merge", nodeId: hero.id, path: "layout", value: { gap: 99 } },
      ],
    };
    const inverse = invertPatch(doc, patch);
    const after = applyPatch(applyPatch(doc, patch).document, inverse).document;
    expect(after.pages[0]!.nodes[hero.id]!.layout.gap).toBe(0);
  });

  it("re-inserts a removed subtree", () => {
    const { doc, hero, title, button } = seed();
    const patch: DesignPatch = { ops: [{ op: "remove", nodeId: hero.id }] };
    const inverse = invertPatch(doc, patch);
    const after = applyPatch(applyPatch(doc, patch).document, inverse).document;
    const page = after.pages[0]!;
    expect(page.nodes[hero.id]!.name).toBe("Hero");
    expect(page.nodes[page.rootId]!.children).toContain(hero.id);
    // 断言要落在"子节点本身回来了、且只回来一次"上。查 hero.children.length 是查不出问题的：
    // 那份 children 数组跟着克隆节点整体回来，哪怕一个子节点都没重新 insert 也照样是 2。
    expect(page.nodes[title.id]).toBeDefined();
    expect(page.nodes[button.id]).toBeDefined();
    expect(page.nodes[title.id]!.parentId).toBe(hero.id);
    expect(page.nodes[button.id]!.parentId).toBe(hero.id);
    expect(page.nodes[hero.id]!.children).toEqual([title.id, button.id]);
  });

  it("撤销整棵多层子树：节点、父子关系、兄弟顺序与删之前逐项相同", () => {
    // 用真实的起始文档（Section → Hero → 文案/容器 → 按钮），不是三层手工节点
    const doc = createDocument("Starters", "website");
    const page = doc.pages[0]!;
    const hero = Object.values(page.nodes).find((n) => n.name === "Hero")!;
    const before = collectSubtree(page, hero.id);
    expect(before.length).toBeGreaterThanOrEqual(5);

    const patch: DesignPatch = { pageId: page.id, ops: [{ op: "remove", nodeId: hero.id }] };
    const removed = applyPatch(doc, patch);
    expect(removed.skipped).toEqual([]);
    const inverse = invertPatch(doc, patch);
    const restored = applyPatch(removed.document, inverse);
    expect(restored.skipped).toEqual([]);
    const after = restored.document.pages[0]!;

    // ① 一个不少、一个不多（顺序也必须是先根后子：反转两次之后仍是先根后子）
    expect(collectSubtree(after, hero.id)).toEqual(before);
    // ② 每个节点的 parentId 指回原父级，且父级的 children 里没有重复 id——
    //    跟着克隆塞回整份 children 再逐条 insert，会出现"节点数对、画布画两遍"
    for (const id of before) {
      const node = after.nodes[id]!;
      expect(node.parentId).toBe(page.nodes[id]!.parentId);
      expect(new Set(node.children).size).toBe(node.children.length);
    }
    expect(after.nodes[hero.id]!.children).toEqual(page.nodes[hero.id]!.children);
  });

  it("removeAsset 清清单 + 剥图片填充 + 清节点 assetId，且 invert 完整还原", () => {
    const { doc, hero } = seed();
    const page = doc.pages[0]!;
    const asset = {
      id: "a1",
      name: "bg.png",
      kind: "image" as const,
      storageKey: "projects/p/a1",
      mimeType: "image/png",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    doc.assets.push(asset);
    hero.style.fills = [
      { kind: "solid", color: "#ffffff" },
      { kind: "image", assetId: "a1", fit: "cover" },
    ];
    const img = createNode({ type: "image", name: "Pic", parentId: page.rootId });
    img.assetId = "a1";
    img.src = "/api/assets/a1/file";
    page.nodes[img.id] = img;
    page.nodes[page.rootId]!.children = [hero.id, img.id];

    const patch: DesignPatch = { ops: [{ op: "removeAsset", assetId: "a1" }] };
    const removed = applyPatch(doc, patch).document;
    // 清单里没了
    expect(removed.assets.some((a) => a.id === "a1")).toBe(false);
    // 只剩 solid，image 填充被剥掉
    expect(removed.pages[0]!.nodes[hero.id]!.style.fills).toEqual([
      { kind: "solid", color: "#ffffff" },
    ]);
    // image 节点的引用也清掉了
    expect(removed.pages[0]!.nodes[img.id]!.assetId).toBeUndefined();
    expect(removed.pages[0]!.nodes[img.id]!.src).toBeUndefined();

    const inverse = invertPatch(doc, patch);
    expect(inverse.ops[0]!.op).toBe("restoreAsset");
    const restored = applyPatch(removed, inverse).document;
    expect(restored.assets).toEqual([asset]);
    expect(restored.pages[0]!.nodes[hero.id]!.style.fills).toEqual([
      { kind: "solid", color: "#ffffff" },
      { kind: "image", assetId: "a1", fit: "cover" },
    ]);
    expect(restored.pages[0]!.nodes[img.id]!.assetId).toBe("a1");
    expect(restored.pages[0]!.nodes[img.id]!.src).toBe("/api/assets/a1/file");
  });

  it("removeAsset 对不存在的资产记 skipped，不静默", () => {
    const { doc } = seed();
    const result = applyPatch(doc, {
      ops: [{ op: "removeAsset", assetId: "nope" }],
    });
    expect(result.skipped[0]?.reason).toContain("nope");
  });
});


describe("diffPatch (§151)", () => {
  it("summarizes before/after per path", () => {
    const { doc, hero, button } = seed();
    const patch: DesignPatch = {
      ops: [
        { op: "set", nodeId: hero.id, path: "size.height", value: 480 },
        {
          op: "merge",
          nodeId: button.id,
          path: "style",
          value: { opacity: 0.5 },
        },
        { op: "setToken", key: "color.primary", value: "#123456" },
      ],
    };
    const diff = diffPatch(doc, patch);
    expect(diff).toHaveLength(3);
    expect(diff[0]).toMatchObject({
      nodeName: "Hero",
      path: "size.height",
      before: 320,
      after: 480,
      kind: "modified",
    });
    expect(diff[1]).toMatchObject({
      nodeName: "CTA",
      path: "style.opacity",
      before: 1,
      after: 0.5,
    });
    expect(diff[2]).toMatchObject({
      kind: "token",
      path: "tokens.color.primary",
    });
  });
});

describe("page-level patches (§5 Pages)", () => {
  it("adds a page and undo removes it again", () => {
    const { doc } = seed();
    const store = new DesignStore(doc);
    const page = createPage("Pricing");
    store.execute(manualCommand("新建页面", { ops: [{ op: "addPage", page }] }));
    expect(store.getDocument().pages).toHaveLength(2);
    store.undo();
    expect(store.getDocument().pages).toHaveLength(1);
    expect(store.getDocument().pages[0]!.id).toBe(doc.pages[0]!.id);
  });

  it("restores the active page when undoing a removal", () => {
    const { doc } = seed();
    const store = new DesignStore(doc);
    const page = createPage("Pricing");
    store.execute(manualCommand("新建页面", { ops: [{ op: "addPage", page, setActive: true }] }));
    expect(store.getDocument().activePageId).toBe(page.id);
    store.execute(manualCommand("删除页面", { ops: [{ op: "removePage", pageId: page.id }] }));
    expect(store.getDocument().activePageId).toBe(doc.pages[0]!.id);
    store.undo();
    const restored = store.getDocument();
    expect(restored.pages.map((p) => p.id)).toContain(page.id);
    expect(restored.activePageId).toBe(page.id);
  });

  it("refuses to remove the last page instead of silently corrupting the document", () => {
    const { doc } = seed();
    const result = applyPatch(doc, {
      ops: [{ op: "removePage", pageId: doc.pages[0]!.id }],
    });
    expect(result.document.pages).toHaveLength(1);
    expect(result.skipped.some((s) => s.reason.includes("last page"))).toBe(true);
  });
});

describe("DesignStore (§148-150)", () => {
  it("undoes and redoes a manual command", () => {
    const { doc, hero } = seed();
    const store = new DesignStore(doc);
    store.execute(
      manualCommand("resize hero", {
        ops: [{ op: "set", nodeId: hero.id, path: "size.height", value: 500 }],
      }),
    );
    expect(store.getDocument().pages[0]!.nodes[hero.id]!.size.height).toBe(500);
    expect(store.getState().canUndo).toBe(true);

    store.undo();
    expect(store.getDocument().pages[0]!.nodes[hero.id]!.size.height).toBe(320);
    expect(store.getState().canRedo).toBe(true);

    store.redo();
    expect(store.getDocument().pages[0]!.nodes[hero.id]!.size.height).toBe(500);
  });

  it("treats one AI operation as a single undoable transaction (§149)", () => {
    const { doc, hero, title } = seed();
    const store = new DesignStore(doc);
    const capability = {
      provider: "mock",
      model: "mock-design-1",
      demoMode: true,
    };
    store.beginTransaction({
      label: "更电影感",
      source: "ai",
      patches: [],
      capability,
    });
    store.applyWithinTransaction({
      summary: "压暗背景",
      ops: [{ op: "set", nodeId: hero.id, path: "size.height", value: 600 }],
    });
    store.applyWithinTransaction({
      summary: "放大标题",
      ops: [
        { op: "set", nodeId: title.id, path: "typography.fontSize", value: 64 },
      ],
    });
    const entry = store.commitTransaction()!;

    expect(entry.patchCount).toBe(2);
    expect(entry.capability?.demoMode).toBe(true);
    expect(store.getState().undoLabel).toBe("更电影感");

    store.undo();
    const page = store.getDocument().pages[0]!;
    expect(page.nodes[hero.id]!.size.height).toBe(320);
    expect(page.nodes[title.id]!.typography?.fontSize).not.toBe(64);
    expect(store.getState().canUndo).toBe(false);
  });

  it("records the AI diff for the transaction", () => {
    const { doc, hero } = seed();
    const store = new DesignStore(doc);
    store.execute(
      aiCommand(
        "taller hero",
        [
          {
            ops: [
              { op: "set", nodeId: hero.id, path: "size.height", value: 400 },
            ],
          },
        ],
        { provider: "mock", model: "m", demoMode: true },
      ),
    );
    const entry = store.history().undo[0]!;
    expect(entry.diff[0]).toMatchObject({
      nodeName: "Hero",
      path: "size.height",
      after: 400,
    });
  });

  it("clears redo stack on a new command", () => {
    const { doc, hero } = seed();
    const store = new DesignStore(doc);
    store.execute(
      manualCommand("a", {
        ops: [{ op: "set", nodeId: hero.id, path: "name", value: "A" }],
      }),
    );
    store.undo();
    expect(store.getState().canRedo).toBe(true);
    store.execute(
      manualCommand("b", {
        ops: [{ op: "set", nodeId: hero.id, path: "name", value: "B" }],
      }),
    );
    expect(store.getState().canRedo).toBe(false);
  });

  it("jumps back through history (§27 View/Compare)", () => {
    const { doc, hero } = seed();
    const store = new DesignStore(doc);
    const first = store.execute(
      manualCommand("one", {
        ops: [{ op: "set", nodeId: hero.id, path: "name", value: "One" }],
      }),
    );
    store.execute(
      manualCommand("two", {
        ops: [{ op: "set", nodeId: hero.id, path: "size.height", value: 999 }],
      }),
    );
    expect(store.jumpTo(first.id)).toBe(true);
    expect(store.getDocument().pages[0]!.nodes[hero.id]!.name).toBe("One");
    expect(store.getState().canRedo).toBe(true);
  });

  it("aborting a transaction rolls the document back", () => {
    const { doc, hero } = seed();
    const store = new DesignStore(doc);
    store.beginTransaction({ label: "aborted", source: "ai", patches: [] });
    store.applyWithinTransaction({
      ops: [{ op: "set", nodeId: hero.id, path: "size.height", value: 777 }],
    });
    store.abortTransaction();
    expect(store.getDocument().pages[0]!.nodes[hero.id]!.size.height).toBe(320);
    expect(store.getState().canUndo).toBe(false);
  });

  it("emits state to subscribers", () => {
    const { doc, hero } = seed();
    const store = new DesignStore(doc);
    let revisions = 0;
    const unsubscribe = store.subscribe(() => {
      revisions += 1;
    });
    store.execute(
      manualCommand("x", {
        ops: [{ op: "set", nodeId: hero.id, path: "name", value: "X" }],
      }),
    );
    unsubscribe();
    store.execute(
      manualCommand("y", {
        ops: [{ op: "set", nodeId: hero.id, path: "name", value: "Y" }],
      }),
    );
    expect(revisions).toBe(1);
  });
});

describe("setVisualDna（§30/§174）", () => {
  const dna = {
    source: { method: "pixel-stats" as const, extractedAt: "2026-09-22T00:00:00.000Z" },
    palette: [{ role: "background", color: "#0b0d12" }],
    descriptors: ["暗色底", "高对比"],
  };

  it("写入后是文档级真值，撤销回到没有 DNA 的状态", () => {
    const { doc } = seed();
    const patch: DesignPatch = { ops: [{ op: "setVisualDna", dna }] };
    const after = applyPatch(doc, patch).document;
    expect(after.visualDna?.descriptors).toEqual(["暗色底", "高对比"]);
    const restored = applyPatch(after, invertPatch(doc, patch)).document;
    // 之前根本没有 DNA，撤销必须把它整个删掉，而不是留一个空壳冒充"有但为空"
    expect(restored.visualDna).toBeUndefined();
  });

  it("覆盖另一份 DNA 时，撤销恢复的是原来那份", () => {
    const { doc } = seed();
    const first: DesignPatch = {
      ops: [{ op: "setVisualDna", dna: { ...dna, descriptors: ["浅色底"] } }],
    };
    const withFirst = applyPatch(doc, first).document;
    const second: DesignPatch = { ops: [{ op: "setVisualDna", dna }] };
    const withSecond = applyPatch(withFirst, second).document;
    expect(withSecond.visualDna?.descriptors).toEqual(["暗色底", "高对比"]);
    const back = applyPatch(withSecond, invertPatch(withFirst, second)).document;
    expect(back.visualDna?.descriptors).toEqual(["浅色底"]);
  });

  it("存进去的 DNA 与调用方对象脱钩，改不动历史", () => {
    const { doc } = seed();
    const mutable = { ...dna, descriptors: ["暗色底"] };
    const after = applyPatch(doc, { ops: [{ op: "setVisualDna", dna: mutable }] }).document;
    mutable.descriptors.push("被事后篡改");
    expect(after.visualDna?.descriptors).toEqual(["暗色底"]);
  });
});

describe("clone（§146：每次编辑都要整份拷贝文档，所以它在热点路径上）", () => {
  it("保留值为 undefined 的键——JSON 往返会丢，undo 之后节点形状不能变", () => {
    const source = {
      a: 1,
      b: undefined,
      nested: { list: [1, undefined, { c: undefined }], d: undefined },
    } as unknown as Record<string, unknown>;
    const copy = clone(source);
    expect(Object.keys(copy)).toEqual(["a", "b", "nested"]);
    expect("b" in copy).toBe(true);
    expect(copy.b).toBeUndefined();
    const nested = copy.nested as Record<string, unknown>;
    expect(Object.keys(nested)).toEqual(["list", "d"]);
    const list = nested.list as unknown[];
    expect(list.length).toBe(3);
    expect(0 in list).toBe(true);
    // 真的脱钩：改副本不能碰到原件（undo 栈里存的就是原件）
    nested.d = "改了";
    (list[2] as Record<string, unknown>).c = "改了";
    expect((source.nested as Record<string, unknown>).d).toBeUndefined();
  });

  it("非纯数据对象仍走 structuredClone", () => {
    const when = new Date("2026-09-23T00:00:00.000Z");
    const copy = clone({ when, map: new Map([["k", 1]]) });
    expect(copy.when).toBeInstanceOf(Date);
    expect(copy.when).not.toBe(when);
    expect(copy.map.get("k")).toBe(1);
  });

  it("一次 execute 只把补丁应用一遍：插入类补丁不会留下重复节点", () => {
    const { doc, hero } = seed();
    const store = new DesignStore(doc);
    const extra = createNode({ type: "text", name: "Once", text: "只插一次", parentId: hero.id });
    store.execute(
      manualCommand("插入一段", { ops: [{ op: "insert", node: extra, parentId: hero.id }] }),
    );
    const after = findPage(store.getDocument())!;
    expect(Object.values(after.nodes).filter((n) => n.id === extra.id).length).toBe(1);
    expect(after.nodes[hero.id]!.children.filter((id) => id === extra.id).length).toBe(1);
    store.undo();
    expect(findPage(store.getDocument())!.nodes[extra.id]).toBeUndefined();
  });
});

describe("addAsset 的撤销（§150：所有编辑都要可撤销）", () => {
  const assetOf = (id: string, name = `${id}.png`): AssetRef => ({
    id,
    name,
    kind: "image",
    storageKey: `projects/p/${id}.png`,
    mimeType: "image/png",
    width: 8,
    height: 8,
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  /** 上传与生成走的是同一个形状：一次事务 = addAsset + 把图贴到节点上 */
  const fillWith = (nodeId: string, id: string): PatchOp[] => [
    { op: "addAsset", asset: assetOf(id) },
    {
      op: "set",
      nodeId,
      path: "style.fills",
      value: [{ kind: "image", assetId: id, fit: "cover" }],
    },
  ];

  it("撤销把清单条目与画布上的填充一起收回，重做又一起回来", () => {
    const { doc, hero } = seed();
    const store = new DesignStore(doc);
    store.execute(manualCommand("填充图片", { ops: fillWith(hero.id, "a1") }));
    expect(store.getDocument().assets.map((a) => a.id)).toEqual(["a1"]);

    store.undo();
    const after = store.getDocument();
    // 这一条曾经是空的：addAsset 的逆操作没被写出来，撤销只收回填充、目录里那条永远留着
    expect(after.assets, "撤销之后目录里还留着这张图").toHaveLength(0);
    const node = findPage(after, after.activePageId)!.nodes[hero.id]!;
    expect(JSON.stringify(node.style.fills ?? [])).not.toContain("a1");

    store.redo();
    const redone = store.getDocument();
    expect(redone.assets.map((a) => a.id)).toEqual(["a1"]);
    expect(JSON.stringify(findPage(redone, redone.activePageId)!.nodes[hero.id]!.style.fills)).toContain("a1");
  });

  it("覆盖已有条目时撤销是还原而不是删除（别把目录清干净当撤销）", () => {
    const { doc, hero } = seed();
    doc.assets = [assetOf("a2", "旧名字.png")];
    hero.style.fills = [{ kind: "image", assetId: "a2", fit: "cover" }];
    const store = new DesignStore(doc);

    store.execute(
      manualCommand("换一张同名资产", {
        ops: [{ op: "addAsset", asset: assetOf("a2", "新名字.png") }],
      }),
    );
    expect(store.getDocument().assets[0]!.name).toBe("新名字.png");

    store.undo();
    const back = store.getDocument();
    expect(back.assets).toHaveLength(1);
    expect(back.assets[0]!.name, "撤销没还原成目录里原来那一条").toBe("旧名字.png");
    // 原来引用它的节点不该被这次撤销顺带剥空
    expect(JSON.stringify(findPage(back, back.activePageId)!.nodes[hero.id]!.style.fills)).toContain("a2");
  });

  it("逆操作里写的是 removeAsset，而不是又一次 addAsset", () => {
    const { doc } = seed();
    const patch = { pageId: doc.activePageId, ops: [{ op: "addAsset", asset: assetOf("a3") } as PatchOp] };
    const inverse = invertPatch(doc, patch);
    expect(inverse.ops.map((o) => o.op)).toEqual(["removeAsset"]);
    // 目录里本来就有这一条时，逆操作是那一条的还原（同一条 id，旧内容）
    doc.assets = [assetOf("a3", "旧的")];
    const overwrite = invertPatch(doc, { pageId: doc.activePageId, ops: [{ op: "addAsset", asset: assetOf("a3", "新的") } as PatchOp] });
    expect(overwrite.ops.map((o) => `${o.op}:${(o as { asset?: AssetRef }).asset?.name ?? ""}`)).toEqual([
      "addAsset:旧的",
    ]);
  });
});
