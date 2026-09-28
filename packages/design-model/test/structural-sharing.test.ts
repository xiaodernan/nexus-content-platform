import { describe, expect, it } from "vitest";
import {
  clone,
  createDocument,
  createNode,
  createPage,
  sameValue,
} from "../src/nodes";
import { applyPatch, invertPatch } from "../src/patch";
import type { DesignPatch } from "../src/patch";
import type { AssetRef, ComponentDefinition, DesignDocument } from "../src/types";
import { DesignStore, manualCommand } from "../src/commands";

/**
 * `applyPatch` 的结构共享（`docs/PERFORMANCE.md` §147 第一条欠账）。
 *
 * 改法是写时拷贝：文档只浅拷会被改写的容器，页面首写拷一次，节点首写深拷那一个。
 * 因此**历史版本从此共享未被触碰的子树**——这三组用例钉的是它的两个代价：
 * ① 谁都不许原地改输入（深冻结：谁改谁当场抛 TypeError，ESM 是严格模式）；
 * ② 共享只共享、不串味（改 v2 不会动到 v0/v1）。
 * 另有一条身份断言证明"共享真的发生了"——不然这套改动在测试上是看不见的
 * （同 §51 那次的教训：DOM 存在不等于画出来了）。
 */

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function componentOf(id: string, name = id): ComponentDefinition {
  return { id, name, rootId: "n_root", props: [], variants: [], slots: [] };
}

const assetOf = (id: string): AssetRef => ({
  id,
  name: `${id}.png`,
  kind: "image",
  storageKey: `k/${id}`,
  mimeType: "image/png",
  createdAt: new Date().toISOString(),
});

/**
 * 双页文档：第一页 Hero(含 Title/CTA/组件实例/图片填充)，第二页一个节点。
 * 文档级容器（token / 组件 / 资产）各放一条，让 document 级 op 有东西可动。
 */
function seed() {
  const doc = createDocument("Share", "website");
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
    text: "before",
  });
  const button = createNode({
    type: "button",
    name: "CTA",
    parentId: hero.id,
    text: "Create",
  });
  const instance = createNode({
    type: "instance",
    name: "实例",
    parentId: hero.id,
    componentId: "cmp-1",
    style: { fills: [{ kind: "image", assetId: "a1" }] },
  });
  instance.assetId = "a1";
  page.nodes[hero.id] = hero;
  page.nodes[title.id] = title;
  page.nodes[button.id] = button;
  page.nodes[instance.id] = instance;
  hero.children = [title.id, button.id, instance.id];
  page.nodes[page.rootId]!.children = [hero.id];

  const second = createPage("About");
  const lone = createNode({ type: "text", name: "Lone", parentId: second.rootId, text: "第 2 页" });
  second.nodes[lone.id] = lone;
  second.nodes[second.rootId]!.children = [lone.id];
  doc.pages.push(second);

  doc.components = [componentOf("cmp-1", "卡片")];
  doc.assets = [assetOf("a1")];
  return { doc, page, hero, title, button, instance, second, lone };
}

const nodeOpsPatch = (heroId: string, titleId: string, buttonId: string, rootId: string): DesignPatch => ({
  ops: [
    { op: "set", nodeId: heroId, path: "size.height", value: 500 },
    { op: "merge", nodeId: heroId, path: "layout", value: { gap: 32 } },
    { op: "reorder", parentId: heroId, from: 0, to: 2 },
    { op: "reparent", nodeId: buttonId, parentId: rootId },
    { op: "remove", nodeId: titleId },
  ],
});

/**
 * `applyPatch` 每次都会把 `metadata.updatedAt` 推到"现在"，那是设计如此（§16 文档要写最后修改时间）。
 * 比较"还原得回来吗"时按同一时刻读，否则永远红在这一列上、把真正的差异淹掉。
 */
function asOf(doc: DesignDocument, reference: DesignDocument): DesignDocument {
  const copy = clone(doc);
  copy.metadata.updatedAt = reference.metadata.updatedAt;
  return copy;
}

describe("结构共享：没被这条补丁碰过的东西必须还是输入里那一个对象", () => {
it("触碰的节点换成新对象，没触碰的节点与页面原样共享", () => {
    const { doc, page, hero, title, button, instance } = seed();
    const result = applyPatch(
      doc,
      nodeOpsPatch(hero.id, title.id, button.id, page.rootId),
    );
    const out = result.document;
    // 触碰过的：Hero 换新对象、页面与 nodes 表换新对象
    expect(out.pages[0]!.nodes[hero.id]).not.toBe(page.nodes[hero.id]);
    expect(out.pages[0]).not.toBe(page);
    // 没触碰的 instance（在 Hero 里但没被任何 op 改）与输入同一对象
    expect(out.pages[0]!.nodes[instance.id]).toBe(page.nodes[instance.id]);
    // 第二页整页共享（这条补丁没写它）
    expect(out.pages[1]).toBe(doc.pages[1]);
    // 文档级容器：被改过的 pages 数组是新的，没被改的 variables 原样
    expect(out.pages).not.toBe(doc.pages);
    expect(out.variables).toBe(doc.variables);
  });

  it("输入文档 apply 之后逐字段原样", () => {
    const { doc, page, hero, title, button } = seed();
    const before = clone(doc);
    applyPatch(doc, nodeOpsPatch(hero.id, title.id, button.id, page.rootId));
    expect(sameValue(doc, before), "输入文档被改了").toBe(true);
  });

  it("removePage 之后输入里那一页仍然原样在、原样深", () => {
    const { doc, second, lone } = seed();
    const before = clone(doc);
    const out = applyPatch(doc, {
      ops: [{ op: "removePage", pageId: second.id }],
    });
    expect(out.document.pages).toHaveLength(1);
    expect(sameValue(doc, before), "删页把输入也删了").toBe(true);
    expect(doc.pages[1]!.nodes[lone.id]).toBeDefined();
  });
});

describe("输入与 op payload 深冻结：谁原地写，谁当场抛 TypeError", () => {
  it("节点级 ops 在冻结的文档上照跑", () => {
    const { doc, page, hero, title, button } = seed();
    const extra = createNode({ type: "text", name: "Extra", text: "x" });
    deepFreeze(doc);
    const patch: DesignPatch = {
      ops: [
        ...nodeOpsPatch(hero.id, title.id, button.id, page.rootId).ops,
        { op: "insert", node: extra, parentId: hero.id, index: 0 },
      ],
    };
    deepFreeze(patch);
    const result = applyPatch(doc, patch);
    expect(result.skipped).toEqual([]);
    expect(result.document.pages[0]!.nodes[extra.id]).toBeDefined();
    expect(result.document.pages[0]!.nodes[hero.id]!.size.height).toBe(500);
  });

  it("document 级 ops（token / 组件 / 资产 / 页面 / DNA）在冻结的文档上照跑", () => {
    const { doc, page, instance, second } = seed();
    const fresh = createPage("第三页");
    const dna = { palette: [{ role: "primary", color: "#123456" }], descriptors: [] };
    const before = clone(doc);
    deepFreeze(doc);
    const patch: DesignPatch = {
      ops: [
        { op: "setToken", key: "color.primary", value: "#ff0000" },
        { op: "addToken", token: { key: "space.test", type: "dimension", value: 4 } },
        { op: "addComponent", component: componentOf("cmp-2", "新组件") },
        { op: "removeComponent", componentId: "cmp-1" },
        {
          op: "restoreComponent",
          component: componentOf("cmp-1", "卡片"),
          nodes: [{ pageId: page.id, nodeId: instance.id }],
        },
        { op: "addAsset", asset: assetOf("a2") },
        { op: "removeAsset", assetId: "a1" },
        {
          op: "restoreAsset",
          asset: assetOf("a1"),
          paints: [{ pageId: page.id, nodeId: instance.id, fills: [{ kind: "image", assetId: "a1" }] }],
          nodes: [{ pageId: page.id, nodeId: instance.id, assetId: "a1" }],
        },
        { op: "addPage", page: fresh, setActive: true },
        { op: "removePage", pageId: second.id },
        { op: "setVisualDna", dna },
      ],
    };
    deepFreeze(patch);
    const result = applyPatch(doc, patch);
    expect(result.skipped).toEqual([]);
    const out = result.document;
    expect(out.tokens.find((t) => t.key === "color.primary")!.value).toBe("#ff0000");
    expect(out.components.map((c) => c.id)).toEqual(["cmp-2", "cmp-1"]);
    expect(out.assets.map((a) => a.id)).toEqual(["a2", "a1"]);
    expect(out.pages.map((p) => p.id)).toEqual([page.id, fresh.id]);
    expect(out.activePageId).toBe(fresh.id);
    expect(out.visualDna).toEqual(dna);
    // 输入仍冻结且原样
    expect(sameValue(doc, before), "document 级 op 写到了输入上").toBe(true);
  });

  it("跨页引用清理（removeComponent / removeAsset）也不碰另一页", () => {
    const { doc, instance, second, lone } = seed();
    second.nodes[lone.id]!.componentId = "cmp-1";
    second.nodes[lone.id]!.assetId = "a1";
    const before = clone(doc);
    deepFreeze(doc);
    const result = applyPatch(doc, {
      ops: [
        { op: "removeComponent", componentId: "cmp-1" },
        { op: "removeAsset", assetId: "a1" },
      ],
    });
    expect(result.skipped).toEqual([]);
    expect(result.document.pages[0]!.nodes[instance.id]!.componentId).toBeUndefined();
    expect(result.document.pages[1]!.nodes[lone.id]!.componentId).toBeUndefined();
    expect(result.document.pages[1]!.nodes[lone.id]!.assetId).toBeUndefined();
    expect(sameValue(doc, before), "跨页清理写到了输入上").toBe(true);
  });
});

describe("共享的历史版本互不污染", () => {
  it("改 v2 不会动到 v0 / v1 里共享着的那些节点", () => {
    const { doc, hero, title } = seed();
    const v0 = clone(doc);
    const v1 = applyPatch(doc, {
      ops: [{ op: "set", nodeId: title.id, path: "text", value: "v1" }],
    }).document;
    const v2 = applyPatch(v1, {
      ops: [{ op: "set", nodeId: hero.id, path: "name", value: "v2" }],
    }).document;
    // 共享发生在没被碰过的支路：Hero 没在 v1 被改，所以 v1 与 v0 共享 Hero
    expect(v1.pages[0]!.nodes[hero.id]).toBe(doc.pages[0]!.nodes[hero.id]);
    // 但被碰过的 Title 在 v1 里是新对象
    expect(v1.pages[0]!.nodes[title.id]).not.toBe(doc.pages[0]!.nodes[title.id]);

    const snapV0 = clone(doc);
    const snapV1 = clone(v1);
    const v3 = applyPatch(v2, {
      ops: [
        { op: "set", nodeId: title.id, path: "text", value: "v3" },
        { op: "set", nodeId: hero.id, path: "name", value: "v3" },
      ],
    }).document;

    expect(sameValue(doc, snapV0), "v0 被后面的编辑改了").toBe(true);
    expect(sameValue(v1, snapV1), "v1 被后面的编辑改了").toBe(true);
    expect(v3.pages[0]!.nodes[title.id]!.text).toBe("v3");
    expect(v2.pages[0]!.nodes[title.id]!.text).toBe("v1");
    expect(v0.pages[0]!.nodes[title.id]!.text).toBe("before");
  });

  it("冻结的输入上 execute → undo → redo 全程还原", () => {
    const { doc, hero, title } = seed();
    const original = clone(doc);
    deepFreeze(doc);
    const store = new DesignStore(doc);
    store.execute(
      manualCommand("改名", {
        ops: [{ op: "set", nodeId: hero.id, path: "name", value: "改过的 Hero" }],
      }),
    );
    store.execute(
      manualCommand("删标题", { ops: [{ op: "remove", nodeId: title.id }] }),
    );
    expect(store.getDocument().pages[0]!.nodes[title.id]).toBeUndefined();
    store.undo();
    store.undo();
    expect(
      sameValue(asOf(store.getDocument(), original), original),
      "两次撤销没还原回输入",
    ).toBe(true);
    store.redo(); // 只重做第一步：改名
    expect(store.getDocument().pages[0]!.nodes[hero.id]!.name).toBe("改过的 Hero");
    expect(store.getDocument().pages[0]!.nodes[title.id]).toBeDefined(); // 删标题还没重做
    store.redo(); // 再重做第二步：删标题
    expect(store.getDocument().pages[0]!.nodes[title.id]).toBeUndefined();
  });

  it("逆补丁在冻结的 v1 上也能跑（invert 的 payload 自带副本，不借 v1 的对象）", () => {
    const { doc, hero, title } = seed();
    const patch: DesignPatch = {
      ops: [
        { op: "set", nodeId: hero.id, path: "size.height", value: 640 },
        { op: "remove", nodeId: title.id },
      ],
    };
    const inverse = invertPatch(doc, patch);
    deepFreeze(doc);
    const v1 = applyPatch(doc, patch).document;
    deepFreeze(v1);
    const back = applyPatch(v1, inverse).document;
    expect(
      sameValue(asOf(back, doc), doc),
      "撤销结果与冻结的输入不逐字段相等",
    ).toBe(true);
    expect(inverse).toEqual(invertPatch(doc, patch));
  });
});
