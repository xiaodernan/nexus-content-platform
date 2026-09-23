import { describe, expect, it } from "vitest";
import {
  buildDesignIndex,
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
