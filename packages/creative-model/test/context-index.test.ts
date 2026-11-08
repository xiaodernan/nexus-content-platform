import { describe, expect, it } from "vitest";
import {
  SELECTION_DIGEST_LIMIT,
  buildDesignIndex,
  buildSelectionDigest,
  createDocument,
  createNode,
  createPage,
  designDocumentChars,
  designIndexChars,
  fitIndexToBudget,
  type ComponentDefinition,
  type DesignDocument,
  type DesignNode,
  type Interaction,
} from "../src";

/**
 * §70 Design Index 的测试。重点不在"能不能算出个对象"，而在四条容易造假的边界：
 * 走不到的节点不能被当成不存在、引用了却没声明的 token 不能被静默吞掉、
 * 同一份文档两次索引必须逐字节相同、索引真的比文档小（否则 §68 那句"别整个塞进去"是空话）。
 */

function doc(): DesignDocument {
  return createDocument("索引测试");
}

function page(document: DesignDocument, idOrIndex: string | number = 0): Page | undefined {
  return typeof idOrIndex === "number"
    ? document.pages[idOrIndex]
    : document.pages.find((p) => p.id === idOrIndex);
}

type Page = NonNullable<DesignDocument["pages"][number]>;

function root(document: DesignDocument, index = 0): DesignNode {
  const p = page(document, index)!;
  return p.nodes[p.rootId]!;
}

function add(
  document: DesignDocument,
  input: Parameters<typeof createNode>[0],
  pageIndex = 0,
): DesignNode {
  const p = page(document, pageIndex)!;
  const parent = input.parentId ? p.nodes[input.parentId]! : root(document, pageIndex);
  const node = createNode({ ...input, parentId: parent.id });
  p.nodes[node.id] = node;
  parent.children.push(node.id);
  return node;
}

function attach(node: DesignNode, input: Partial<Interaction> & { id: string }): void {
  const interaction: Interaction = { trigger: "click", action: "navigate", ...input };
  node.interactions = [...(node.interactions ?? []), interaction];
}

function asset(id: string, name: string) {
  return {
    id,
    name,
    kind: "image" as const,
    storageKey: `projects/p/${id}.png`,
    mimeType: "image/png",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildDesignIndex（§70 目录 + §68 交叉引用）", () => {
  it("起手页能被索引：页面、结构层级、文字量都对得上", () => {
    const document = doc();
    const index = buildDesignIndex(document);

    expect(index.schemaVersion).toBe(1);
    expect(index.generatedFrom.documentId).toBe(document.id);
    expect(index.pages).toHaveLength(1);
    const home = index.pages[0]!;
    expect(home.name).toBe("Home");
    expect(home.nodeCount).toBe(Object.keys(page(document)!.nodes).length);
    expect(home.reachable).toBe(home.nodeCount);
    expect(home.frames).toBe(1); // 页面根框
    expect(home.sections).toBe(1); // Hero
    expect(home.maxDepth).toBeGreaterThan(2);
    expect(home.textChars).toBeGreaterThan(0);
    expect(index.totals.textChars).toBe(home.textChars);

    const hero = index.frames.find((f) => f.name === "Hero")!;
    expect(hero.kind).toBe("section");
    expect(hero.parent).toBe("Home");
    // 预览取子树里第一段文字（Eyebrow），不是整段抄走
    expect(hero.textPreview).toBe("NEXUS STUDIO");
  });

  it("两次索引逐字节相同；改一处就会变", () => {
    const document = doc();
    const first = JSON.stringify(buildDesignIndex(document));
    expect(JSON.stringify(buildDesignIndex(document))).toBe(first);

    add(document, { type: "text", name: "Extra", text: "多出来的一段" });
    expect(JSON.stringify(buildDesignIndex(document))).not.toBe(first);
  });

  it("索引明显比文档小：否则 §68 的「别整个塞进去」就是空话", () => {
    const document = doc();
    for (let i = 0; i < 60; i += 1) {
      add(document, {
        type: "text",
        name: `T${i}`,
        text: `第 ${i} 段正文，长一点才有对比意义。`.repeat(3),
      });
    }
    const index = buildDesignIndex(document);
    expect(index.totals.nodes).toBeGreaterThan(60);
    const ratio = designIndexChars(index) / designDocumentChars(document);
    expect(ratio).toBeLessThan(0.4);
  });

  it("走不到的节点如实计入 totals，不当它不存在", () => {
    const document = doc();
    const p = page(document)!;
    // 手动塞一个孤儿：不在任何父节点的 children 里，walk 到不了
    const orphan = createNode({ type: "text", name: "孤儿", text: "没人引用我", parentId: null });
    p.nodes[orphan.id] = orphan;

    const index = buildDesignIndex(document);
    const home = index.pages[0]!;
    expect(index.totals.unreachableNodes).toBe(1);
    expect(home.nodeCount).toBe(home.reachable + 1);
    expect(index.totals.nodes).toBe(home.nodeCount);
  });

  it("组件按引用计数：没用过的标 unused，不假装组件库全是活的", () => {
    const document = doc();
    const components: ComponentDefinition[] = [
      {
        id: "cmp_used",
        name: "Used Button",
        rootId: root(document)!.id,
        pageId: document.pages[0]!.id,
        props: [{ name: "label", type: "text", default: "按钮" }],
        variants: [{ id: "v1", props: { state: "hover" }, overrides: {} }],
        slots: [{ name: "icon", nodeId: root(document)!.id }],
      },
      {
        id: "cmp_dead",
        name: "Retired Card",
        rootId: root(document)!.id,
        props: [],
        variants: [],
        slots: [],
      },
    ];
    document.components = components;
    add(document, { type: "instance", name: "Used Button", componentId: "cmp_used" });

    const index = buildDesignIndex(document);
    expect(index.components.map((c) => c.name)).toEqual(["Retired Card", "Used Button"]);

    const usedEntry = index.components.find((c) => c.id === "cmp_used")!;
    expect(usedEntry.instances).toBe(1);
    expect(usedEntry.unused).toBe(false);
    expect(usedEntry.usedOnPages).toEqual(["Home"]);
    expect(usedEntry.props).toEqual(["label"]);
    expect(usedEntry.variants).toBe(1);
    expect(usedEntry.slots).toEqual(["icon"]);
    expect(usedEntry.definedOnPage).toBe("Home");

    const deadEntry = index.components.find((c) => c.id === "cmp_dead")!;
    expect(deadEntry.unused).toBe(true);
    expect(deadEntry.instances).toBe(0);
    expect(deadEntry.definedOnPage).toBeNull();

    expect(index.totals.instances).toBe(1);
    expect(index.totals.unusedComponents).toBe(1);
    expect(index.edges.filter((e) => e.kind === "instance")).toHaveLength(1);
    expect(index.pages[0]!.components).toEqual(["Used Button"]);
  });

  it("资产：image paint 与 assetId 都算引用，没被用的标 orphaned", () => {
    const document = doc();
    document.assets = [asset("ast_used", "hero.png"), asset("ast_orphan", "unused.png")];

    const byField = add(document, { type: "image", name: "ByField" });
    byField.assetId = "ast_used";
    const byPaint = add(document, { type: "shape", name: "Painted" });
    byPaint.style.fills = [{ kind: "image", assetId: "ast_used", fit: "cover" }];

    const index = buildDesignIndex(document);
    const used = index.assets.find((a) => a.id === "ast_used")!;
    expect(used.usedByNodes).toBe(2);
    expect(used.orphaned).toBe(false);
    expect(used.usedOnPages).toEqual(["Home"]);
    expect(index.assets.find((a) => a.id === "ast_orphan")!.orphaned).toBe(true);
    expect(index.totals.orphanAssets).toBe(1);
    expect(index.edges.filter((e) => e.kind === "asset")).toHaveLength(2);
    expect(index.pages[0]!.assets).toEqual(["hero.png"]);
  });

  it("token：字段字面量走 value、绑定表走 binding，两条路都数得到", () => {
    const document = doc();
    const text = add(document, { type: "text", name: "Colored", text: "字色来自 token" });
    text.style.fills = [{ kind: "solid", color: "{color.primary}" }];
    text.bindingsMap = { "layout.gap": "space.12" };

    const index = buildDesignIndex(document);
    const primary = index.tokens.find((t) => t.key === "color.primary")!;
    expect(primary.used).toBe(true);
    expect(primary.via).toEqual(["value"]);
    expect(typeof primary.value).toBe("string");

    const space = index.tokens.find((t) => t.key === "space.12")!;
    expect(space.via).toEqual(["binding"]);
    expect(space.usedByNodes).toBe(1);

    const tokenEdges = index.edges.filter((e) => e.kind === "token");
    expect(tokenEdges.some((e) => e.from === text.id && e.to === "color.primary")).toBe(true);
    expect(tokenEdges.some((e) => e.from === text.id && e.to === "space.12")).toBe(true);
  });

  it("引用了却没声明的 token：单列一条 undeclared，不自愈也不消失", () => {
    const document = doc();
    const text = add(document, { type: "text", name: "Ghost", text: "幽灵色" });
    text.style.fills = [{ kind: "solid", color: "{color.ghost}" }];

    const index = buildDesignIndex(document);
    expect(index.totals.undeclaredTokenRefs).toBe(1);
    expect(index.totals.tokens).toBe(document.tokens.length);
    const ghost = index.tokens.find((t) => t.key === "color.ghost")!;
    expect(ghost.type).toBe("undeclared");
    expect(ghost.usedByNodes).toBe(1);
    expect(ghost.value).toBe("<complex>");
  });

  it("交互：能解析出目标名字，解析不到就写 null", () => {
    const document = doc();
    document.pages.push(createPage("Pricing"));
    const cta = add(document, { type: "button", name: "CTA", text: "去看看" });
    const pricingPage = page(document, 1)!;
    attach(cta, { id: "int_nav", target: pricingPage.id });

    const anchor = add(document, { type: "text", name: "Anchor", text: "锚点" });
    attach(cta, { id: "int_scroll", action: "scroll-to", target: anchor.id });
    attach(cta, { id: "int_missing", action: "scroll-to", target: "n_nowhere" });

    const index = buildDesignIndex(document);
    expect(index.totals.interactions).toBe(3);
    const byId = Object.fromEntries(index.interactions.map((i) => [i.id, i]));
    expect(byId.int_nav?.nodeName).toBe("CTA");
    expect(byId.int_nav?.targetName).toBe("Pricing");
    expect(byId.int_scroll?.targetName).toBe("Anchor");
    expect(byId.int_missing?.targetName).toBeNull();
    expect(index.pages.find((p) => p.name === "Pricing")!.interactions).toBe(0);
    expect(index.edges.filter((e) => e.kind === "interaction")).toHaveLength(3);
  });

  it("多页时不串页：每页的节点数、文字量、结构各算各的", () => {
    const document = doc();
    document.pages.push(createPage("About"));
    add(document, { type: "text", name: "Only on About", text: "关于页的一段" }, 1);

    const index = buildDesignIndex(document);
    const about = index.pages.find((p) => p.name === "About")!;
    const home = index.pages.find((p) => p.name === "Home")!;
    expect(about.nodeCount).toBe(about.reachable);
    expect(about.textChars).toBe("关于页的一段".length);
    expect(home.textChars).not.toBe(about.textChars);
    expect(about.frames).toBe(1);
    expect(new Set(index.frames.map((f) => f.pageId))).toEqual(
      new Set(index.pages.map((p) => p.id)),
    );
    // 第二页的节点不会混进第一页的结构目录
    expect(index.frames.filter((f) => f.pageId === home.id).every((f) => f.name !== "About")).toBe(
      true,
    );
  });

  it("omissions 写清楚这份索引没带什么，并且随索引一起出去", () => {
    const index = buildDesignIndex(starterDoc());
    expect(index.omissions.some((o) => o.includes("Code Index"))).toBe(true);
    expect(index.omissions.some((o) => o.includes("语义检索"))).toBe(true);
  });
});

describe("fitIndexToBudget（§68：索引自己也不能无限大）", () => {
  function bigDoc(): DesignDocument {
    const document = doc();
    for (let i = 0; i < 400; i += 1) {
      add(document, { type: "text", name: `T${i}`, text: `第 ${i} 段` });
    }
    return document;
  }

  it("预算够用时原样返回，不多删一条", () => {
    const index = buildDesignIndex(bigDoc());
    const fitted = fitIndexToBudget(index, designIndexChars(index) + 1000);
    expect(fitted.dropped).toBeUndefined();
    expect(fitted.trimmed).toBeUndefined();
    expect(JSON.stringify(fitted)).toBe(JSON.stringify(index));
  });

  it("压进预算：totals 仍是未裁剪的那份，被省掉的条目逐条交代", () => {
    const index = buildDesignIndex(bigDoc());
    const fitted = fitIndexToBudget(index, 6000);

    expect(designIndexChars(fitted)).toBeLessThanOrEqual(6000);
    expect(designIndexChars(index)).toBeGreaterThan(6000);
    expect(fitted.totals).toEqual(index.totals);
    expect(fitted.pages).toEqual(index.pages);

    const dropped = fitted.dropped!;
    expect(dropped.edges).toBe(index.edges.length - fitted.edges.length);
    expect(dropped.frames).toBe(index.frames.length - fitted.frames.length);
    expect(dropped.textPreviews).toBeGreaterThan(0);
    expect(fitted.frames.every((f) => f.textPreview === "")).toBe(true);
    expect(fitted.trimmed!.join("\n")).toContain("文字预览");
    // 页面清单是目录的骨架，任何预算下都不许缺页
    expect(fitted.pages.map((p) => p.name)).toEqual(index.pages.map((p) => p.name));
  });

  it("预算小到装不下骨架时如实说，而不是假装压好了", () => {
    const index = buildDesignIndex(bigDoc());
    const fitted = fitIndexToBudget(index, 120);
    expect(designIndexChars(fitted)).toBeGreaterThan(120);
    expect(fitted.trimmed!.some((line) => line.includes("比这份项目的最小目录还小"))).toBe(true);
  });

  it("maxChars<=0 视为不裁剪：不拿「0 字符」当目标骗自己", () => {
    const index = buildDesignIndex(bigDoc());
    expect(fitIndexToBudget(index, 0).dropped).toBeUndefined();
    expect(fitIndexToBudget(index, -1).dropped).toBeUndefined();
  });
});

function starterDoc(): DesignDocument {
  const document = createDocument("起手");
  return document;
}

describe("buildSelectionDigest（§68 第三笔：现场由服务端按权威文档回答）", () => {
  /** Hero 框 + 一个引用了 token 的标题，够覆盖"层级 / 意图尺寸 / token 来源"三类事实 */
  function heroWithHeadline(document: DesignDocument) {
    const hero = add(document, { type: "frame", name: "Hero", size: { width: "fill", height: "hug" } });
    const headline = add(document, {
      type: "text",
      name: "Headline",
      parentId: hero.id,
      text: "从一句话到一个可发布的产品",
      typography: { fontFamily: "{font.body}", fontSize: 56, fontWeight: 700 },
      style: { fills: [{ kind: "solid", color: "{color.primary}" }] },
    });
    return { hero, headline };
  }

  it("认得的 id 给出一组可核对的事实，不是只有个 id", () => {
    const document = doc();
    const { hero, headline } = heroWithHeadline(document);
    const digest = buildSelectionDigest(document, {
      pageId: page(document)!.id,
      selection: [headline.id, hero.id],
    });

    expect(digest.schemaVersion).toBe(1);
    expect(digest.requested).toBe(2);
    expect(digest.missing).toEqual([]);
    expect(digest.unreachable).toEqual([]);

    const byId = new Map(digest.entries.map((e) => [e.nodeId, e]));
    const h = byId.get(headline.id)!;
    expect(h.pageId).toBe(page(document)!.id);
    expect(h.pageName).toBe("Home");
    expect(h.type).toBe("text");
    expect(h.parent).toBe("Hero"); // 给名字：模型引用上一层时不用反查 id
    expect(h.depth).toBe(2); // 页面根 → Hero → Headline
    expect(h.childCount).toBe(0);
    expect(h.text).toBe("从一句话到一个可发布的产品");
    expect(h.fontSize).toBe(56);
    // 与 collectTokenRefs 同一口径：默认字体那条 {font.body} 引用也算，不挑只挑"显式改过的"
    expect(h.tokenRefs).toEqual(["color.primary", "font.body"]);
    // 尺寸是**意图**不是像素：hug / fill 原样带出，换算要浏览器参与
    expect(byId.get(hero.id)!.size).toEqual({ width: "fill", height: "hug" });
  });

  it("谎报的 id 记进 missing：不静默丢，也不换一个像样的顶上", () => {
    const document = doc();
    const { headline } = heroWithHeadline(document);
    const digest = buildSelectionDigest(document, {
      pageId: page(document)!.id,
      selection: ["node_不存在", headline.id, "node_不存在"],
    });

    expect(digest.missing).toEqual(["node_不存在"]);
    expect(digest.requested).toBe(2); // 去重后仍有两条：谎报那条也计数
    expect(digest.entries.map((e) => e.nodeId)).toEqual([headline.id]);
  });

  it("文档里有但走不到的节点：标 unreachable + depth null，样式信息照给", () => {
    const document = doc();
    const p = page(document)!;
    const orphan = createNode({ type: "text", name: "Orphan", text: "挂在 nodes 里，没有父节点指向它" });
    p.nodes[orphan.id] = orphan; // 刻意不进任何 children —— 就是 totals.unreachableNodes 那类

    const digest = buildSelectionDigest(document, { pageId: p.id, selection: [orphan.id] });
    expect(digest.unreachable).toEqual([orphan.id]);
    expect(digest.missing).toEqual([]); // 它确实在文档里，说"不存在"就是谎报

    const [entry] = digest.entries;
    expect(entry!.depth).toBeNull();
    expect(entry!.parent).toBeNull();
    expect(entry!.text).toBe("挂在 nodes 里，没有父节点指向它");
  });

  it("条目顺序由文档位置定，客户端用点击顺序带节奏无效", () => {
    const document = doc();
    const { hero, headline } = heroWithHeadline(document);
    const footer = add(document, { type: "text", name: "Footer", text: "页脚" });
    const ids = [footer.id, headline.id, hero.id];
    const p = page(document)!.id;

    const scrambled = buildSelectionDigest(document, { pageId: p, selection: ids });
    const ordered = buildSelectionDigest(document, { pageId: p, selection: [...ids].reverse() });
    expect(scrambled.entries.map((e) => e.nodeId)).toEqual(ordered.entries.map((e) => e.nodeId));
    expect(ordered.entries.map((e) => e.name)).toEqual(["Hero", "Headline", "Footer"]);
  });

  it("当前页排在前面；超出 limit 的进 dropped，requested 记的是全部", () => {
    const document = doc();
    const { headline } = heroWithHeadline(document);
    document.pages.push(createPage("Pricing"));
    const other = add(document, { type: "text", name: "OnPricing", text: "另一页的一段" }, 1);

    const digest = buildSelectionDigest(document, {
      pageId: page(document)!.id,
      selection: [other.id, headline.id],
      limit: 1,
    });
    expect(digest.entries.map((e) => e.pageName)).toEqual(["Home"]);
    expect(digest.dropped).toEqual([other.id]);
    expect(digest.requested).toBe(2);
    expect(digest.limit).toBe(1);
  });

  it("字号引用 token 时给的是那个引用；显式绑定也算引用（与目录同一口径）", () => {
    const document = doc();
    const tokenized = add(document, {
      type: "text",
      name: "H1",
      text: "标题",
      typography: { fontFamily: "{font.body}", fontSize: "{typography.h1}", fontWeight: 700 },
    });
    const bound = add(document, { type: "text", name: "Bound", text: "绑定" });
    bound.bindingsMap = { cornerRadius: "radius.lg" }; // 裸 key 形态的显式绑定

    const digest = buildSelectionDigest(document, { pageId: null, selection: [tokenized.id, bound.id] });
    const byId = new Map(digest.entries.map((e) => [e.nodeId, e]));
    expect(byId.get(tokenized.id)!.fontSize).toBe("{typography.h1}");
    expect(byId.get(tokenized.id)!.tokenRefs).toContain("typography.h1");
    expect(byId.get(bound.id)!.tokenRefs).toContain("radius.lg");
  });

  it("实例与资产给名字；名字查不到时退回 id，而不是 null 假装没绑", () => {
    const document = doc();
    const component: ComponentDefinition = {
      id: "cmp_1",
      name: "PrimaryButton",
      rootId: "n_ghost",
      props: [],
      variants: [],
      slots: [],
    };
    document.components.push(component);
    const instance = add(document, { type: "frame", name: "Instance" });
    instance.componentId = component.id;
    const dangling = add(document, { type: "frame", name: "Dangling" });
    dangling.componentId = "cmp_gone";
    dangling.assetId = "ast_gone";

    const digest = buildSelectionDigest(document, { selection: [instance.id, dangling.id] });
    const byId = new Map(digest.entries.map((e) => [e.nodeId, e]));
    expect(byId.get(instance.id)!.componentOf).toBe("PrimaryButton");
    expect(byId.get(dangling.id)!.componentOf).toBe("cmp_gone");
    expect(byId.get(dangling.id)!.assetRef).toBe("ast_gone");
  });

  it("长文字截到 60 字加省略号：既不发整段正文，也不假装那就是全文", () => {
    const document = doc();
    const long = add(document, { type: "text", name: "Long", text: "啊".repeat(200) });
    const empty = add(document, { type: "frame", name: "Empty" });

    const digest = buildSelectionDigest(document, { selection: [long.id, empty.id] });
    const text = digest.entries.find((e) => e.nodeId === long.id)!.text!;
    expect(text).toHaveLength(61); // 60 字 + 省略号
    expect(text.endsWith("…")).toBe(true);
    expect(digest.entries.find((e) => e.nodeId === empty.id)!.text).toBeNull();
  });

  it("没选中东西也是一份完整目录：空表 + 上限 + omissions 一样不缺", () => {
    const document = doc();
    const digest = buildSelectionDigest(document, { selection: [] });
    expect(digest.entries).toEqual([]);
    expect(digest.requested).toBe(0);
    expect(digest.limit).toBe(SELECTION_DIGEST_LIMIT);
    const omissions = digest.omissions.join("\n");
    expect(omissions).toContain("浏览器量出来的实际盒模型");
    expect(omissions).toContain("选中顺序");
  });

  it("同一份输入两次调用逐字节相同（§68：目录要能当夹具用）", () => {
    const document = doc();
    const { hero, headline } = heroWithHeadline(document);
    const args = { pageId: page(document)!.id, selection: [headline.id, hero.id] };
    expect(JSON.stringify(buildSelectionDigest(document, args))).toBe(
      JSON.stringify(buildSelectionDigest(document, args)),
    );
  });
});
