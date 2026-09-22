import { describe, expect, it } from "vitest";
import { createDocument, createNode, createPage, findPage } from "../src/nodes";
import {
  applyPatch,
  collectSubtree,
  diffPatch,
  invertPatch,
} from "../src/patch";
import type { DesignPatch } from "../src/patch";
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
    const { doc, hero } = seed();
    const patch: DesignPatch = { ops: [{ op: "remove", nodeId: hero.id }] };
    const inverse = invertPatch(doc, patch);
    const after = applyPatch(applyPatch(doc, patch).document, inverse).document;
    const page = after.pages[0]!;
    expect(page.nodes[hero.id]!.name).toBe("Hero");
    expect(page.nodes[page.rootId]!.children).toContain(hero.id);
    // 子节点必须重新挂回父级
    expect(page.nodes[hero.id]!.children.length).toBe(2);
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
