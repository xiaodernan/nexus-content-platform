import { describe, expect, it } from "vitest";
import {
  clone,
  createDocument,
  createNode,
  duplicateDocument,
  findPage,
  remapAssetIds,
  starterPage,
  uid,
  type AssetRef,
  type ComponentDefinition,
  type DesignDocument,
} from "../src/index";

/**
 * §27 Duplicate：副本必须是一份能独立存在的新文档。
 * 这里守的是"换号换干净"——库里页面 id 和组件 id 是全局主键，
 * 只要有一个引用没跟着换，副本就会写回源项目的页面上（或者直接撞主键）。
 */

const withExtras = (): DesignDocument => {
  const doc = createDocument("副本源");
  const home = findPage(doc, doc.activePageId)!;
  const second = starterPage("关于");
  const button = createNode({ type: "button", name: "去关于页", parentId: home.rootId });
  // createNode 不吃 interactions（那是属性面板/AI 补丁的活儿），测试里直接挂上
  button.interactions = [{ id: "i1", trigger: "click", action: "navigate", target: second.id }];
  home.nodes[button.id] = button;
  home.nodes[home.rootId]!.children = [...home.nodes[home.rootId]!.children, button.id];
  doc.pages = [home, second];
  const component: ComponentDefinition = {
    id: uid("c"),
    name: "CTA",
    rootId: button.id,
    pageId: second.id,
    props: [],
    variants: [],
    slots: [],
  };
  doc.components = [component];
  button.componentId = component.id;
  doc.variables = [
    { id: "v1", name: "落地页", scope: "page", refId: second.id, value: "", type: "string" },
  ];
  return doc;
};

describe("duplicateDocument", () => {
  it("内容照搬，页面与组件 id 全部换号", () => {
    const source = withExtras();
    const copy = duplicateDocument(source);
    expect(copy.pages.map((p) => p.nodes[p.rootId]!.name)).toEqual(
      source.pages.map((p) => p.nodes[p.rootId]!.name),
    );
    expect(copy.pages.map((p) => p.id)).not.toEqual(source.pages.map((p) => p.id));
    expect(copy.components.map((c) => c.id)).not.toEqual(source.components.map((c) => c.id));
    // 节点 id 在页面内唯一，跟着页面走，不需要换
    expect(
      Object.keys(copy.pages[0]!.nodes).sort(),
    ).toEqual(Object.keys(source.pages[0]!.nodes).sort());
  });

  it("所有指向旧 id 的引用都跟着换：activePageId / component.pageId / node.componentId / 交互目标 / 变量作用域", () => {
    const source = withExtras();
    const copy = duplicateDocument(source);
    const pageMap = new Map(source.pages.map((p, i) => [p.id, copy.pages[i]!.id]));
    const compMap = new Map(source.components.map((c, i) => [c.id, copy.components[i]!.id]));

    expect(copy.activePageId).toBe(pageMap.get(source.activePageId));
    expect(copy.components[0]!.pageId).toBe(pageMap.get(source.components[0]!.pageId!));
    expect(copy.variables[0]!.refId).toBe(pageMap.get(source.variables[0]!.refId!));

    const copiedHome = copy.pages[0]!;
    const button = Object.values(copiedHome.nodes).find((n) => n.name === "去关于页")!;
    const sourceButton = source.pages[0]!.nodes[button.id]!;
    expect(button.componentId).toBe(compMap.get(sourceButton.componentId!));
    // 跨页跳转指向新页面，而不是源项目的页面
    const target = button.interactions?.[0]?.target;
    expect(target).toBeTruthy();
    expect(source.pages.some((p) => p.id === target)).toBe(false);
    expect(copy.pages.some((p) => p.id === target)).toBe(true);
  });

  it("改名可选，且不会碰到源文档", () => {
    const source = withExtras();
    const untouched = clone(source);
    const renamed = duplicateDocument(source, "另一种可能");
    expect(renamed.name).toBe("另一种可能");
    expect(source).toEqual(untouched);
    // token 是要跟着副本走的（同一套设计语言），key 不应变
    expect(renamed.tokens.map((t) => t.key)).toEqual(source.tokens.map((t) => t.key));
  });
});

describe("remapAssetIds（§27 Duplicate 的资产一半）", () => {
  const asset = (id: string): AssetRef => ({
    id,
    name: `${id}.png`,
    kind: "image",
    storageKey: `projects/p/${id}.png`,
    mimeType: "image/png",
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  const docWithImage = (): DesignDocument => {
    const doc = createDocument("带图");
    const home = findPage(doc, doc.activePageId)!;
    const frame = createNode({ type: "frame", name: "封面", parentId: home.rootId });
    frame.style.fills = [{ kind: "image", assetId: "a-old", fit: "cover" }];
    home.nodes[frame.id] = frame;
    home.nodes[home.rootId]!.children = [...home.nodes[home.rootId]!.children, frame.id];
    doc.assets = [asset("a-old")];
    return doc;
  };

  it("清单与 paint 引用一起换号，且不动源文档", () => {
    const source = docWithImage();
    const untouched = clone(source);
    const copy = remapAssetIds(source, new Map([["a-old", "a-new"]]));
    expect(copy.assets.map((a) => a.id)).toEqual(["a-new"]);
    const frame = Object.values(findPage(copy, copy.activePageId)!.nodes).find(
      (n) => n.name === "封面",
    )!;
    const paint = frame.style.fills[0]!;
    expect(paint.kind === "image" && paint.assetId).toBe("a-new");
    expect(paint.kind === "image" && paint.fit).toBe("cover");
    // 源文档保持原样：换号只发生在返回的新副本上
    expect(source).toEqual(untouched);
  });

  it("空映射返回等价副本；Record 与 Map 两种入参等价", () => {
    const source = docWithImage();
    expect(remapAssetIds(source, new Map())).toEqual(source);
    expect(remapAssetIds(source, { "a-old": "a-x" })).toEqual(remapAssetIds(source, new Map([["a-old", "a-x"]])));
  });
});
