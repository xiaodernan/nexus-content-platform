import { describe, expect, it } from "vitest";
import {
  CONCEPT_LANGUAGES,
  CONCEPT_STRUCTURES,
  applyConceptLanguage,
  applyConceptStructure,
  buildConcepts,
  clone,
  createDocument,
  findPage,
  mergeConceptDocuments,
  TokenStore,
  validateDocument,
  type DesignDocument,
  type Page,
} from "../src/index";

/**
 * §28/§29 多方案。这里守的是两个轴真的能各自搬走：
 * 结构方向只动节点、视觉语言只动 token，"A 的布局 + C 的视觉"才不是句空话。
 * id 是随机的，所以比较一律走 shapeOf/stableKey，不比 JSON.stringify。
 */

const shapeOf = (page: Page) => ({
  name: page.name,
  nodes: Object.values(page.nodes)
    .map((n) => [
      n.name,
      n.type,
      n.parentId ? page.nodes[n.parentId]?.name ?? "?" : "(root)",
      n.text ?? "",
      n.layout.mode,
      n.layout.gap,
      n.layout.justify,
      n.layout.items,
      JSON.stringify(n.layout.padding),
      String(n.size.width),
      String(n.size.height),
      n.typography?.align ?? "",
      JSON.stringify(n.style.fills),
    ].join("|"))
    .sort(),
});

const tokenValues = (doc: DesignDocument) =>
  doc.tokens.map((t) => `${t.key}=${JSON.stringify(t.value)}`).sort().join(";");

const source = () => createDocument("首页方案");

describe("多方案生成（§29）", () => {
  it("四个方向：结构与视觉同时变化，且都改动了源文档", () => {
    const doc = source();
    const specs = buildConcepts(doc, 4);
    expect(specs.map((s) => s.letter)).toEqual(["A", "B", "C", "D"]);
    expect(specs.map((s) => s.branchName)).toEqual([
      "concept-a",
      "concept-b",
      "concept-c",
      "concept-d",
    ]);
    for (const spec of specs) {
      expect(spec.structureLabel).not.toBe("");
      expect(spec.languageLabel).not.toBe("");
      const before = shapeOf(findPage(doc, doc.activePageId)!);
      const after = shapeOf(findPage(spec.document, spec.document.activePageId)!);
      expect(after.nodes.length).toBeGreaterThan(0);
      expect(after.nodes.join("\n") === before.nodes.join("\n")).toBe(false);
      expect(tokenValues(spec.document)).not.toBe(tokenValues(doc));
      // 采纳一条方向不该顺手把项目改名：方案名是分支与快照的事
      expect(spec.document.name).toBe("首页方案");
    }
    // 两两不同：并排比较时不能出现两张一样的卡
    const shapes = specs.map((s) => shapeOf(findPage(s.document, s.document.activePageId)!).nodes.join("\n"));
    expect(new Set(shapes).size).toBe(4);
    const tokens = specs.map((s) => tokenValues(s.document));
    expect(new Set(tokens).size).toBe(4);
  });

  it("同一份输入两次生成得到同一组方向（确定性，没有随机数）", () => {
    const doc = source();
    const first = buildConcepts(doc, 4);
    const second = buildConcepts(doc, 4);
    expect(first.map((s) => [s.structureKey, s.languageKey])).toEqual(
      second.map((s) => [s.structureKey, s.languageKey]),
    );
    for (let i = 0; i < first.length; i += 1) {
      expect(shapeOf(findPage(first[i]!.document, first[i]!.document.activePageId)!))
        .toEqual(shapeOf(findPage(second[i]!.document, second[i]!.document.activePageId)!));
      expect(tokenValues(first[i]!.document)).toBe(tokenValues(second[i]!.document));
    }
  });

  it("每个方案都仍然是合法文档（结构改动不会留下悬空父子）", () => {
    for (const spec of buildConcepts(source(), 4)) {
      const errors = validateDocument(spec.document).filter((i) => i.severity === "error");
      expect(errors.map((e) => e.message)).toEqual([]);
      const page = findPage(spec.document, spec.document.activePageId)!;
      for (const node of Object.values(page.nodes)) {
        if (node.parentId) expect(page.nodes[node.parentId]).toBeTruthy();
        for (const child of node.children) expect(page.nodes[child]).toBeTruthy();
      }
    }
  });

  it("视觉语言只改 token 与 visualDna，一个节点都不碰", () => {
    const doc = source();
    const before = clone(findPage(doc, doc.activePageId)!);
    const { document, notes } = applyConceptLanguage(doc, CONCEPT_LANGUAGES[0]!);
    expect(notes).toEqual([]);
    expect(shapeOf(findPage(document, document.activePageId)!)).toEqual(shapeOf(before));
    expect(tokenValues(document)).not.toBe(tokenValues(doc));
    expect(document.visualDna?.descriptors).toEqual(CONCEPT_LANGUAGES[0]!.descriptors);
    expect(document.visualDna?.palette.length).toBeGreaterThan(0);
  });

  it("结构方向只改节点，token 原样保留", () => {
    const doc = source();
    for (const structure of CONCEPT_STRUCTURES) {
      const { document, notes } = applyConceptStructure(doc, structure);
      expect(notes).toEqual([]);
      expect(tokenValues(document)).toBe(tokenValues(doc));
      expect(document.visualDna).toBeUndefined();
    }
  });

  it("居中开场：首屏居中、文案居中", () => {
    const { document } = applyConceptStructure(source(), CONCEPT_STRUCTURES[0]!);
    const page = findPage(document, document.activePageId)!;
    const hero = Object.values(page.nodes).find((n) => n.name === "Hero")!;
    expect(hero.layout.items).toBe("center");
    expect(hero.layout.justify).toBe("center");
    const headline = page.nodes[hero.children.find((id) => page.nodes[id]?.name === "Headline")!]!;
    expect(headline.typography?.align).toBe("center");
  });

  it("左右分栏：原文案收进左栏，右栏是视觉主体位", () => {
    const { document } = applyConceptStructure(source(), CONCEPT_STRUCTURES[1]!);
    const page = findPage(document, document.activePageId)!;
    const hero = Object.values(page.nodes).find((n) => n.name === "Hero")!;
    expect(hero.layout.mode).toBe("horizontal");
    const kids = hero.children.map((id) => page.nodes[id]!);
    expect(kids.map((k) => k.name)).toEqual(["Copy", "Visual"]);
    const copy = kids[0]!;
    expect(copy.children.map((id) => page.nodes[id]!.name).sort()).toEqual(
      ["Actions", "Eyebrow", "Headline", "Subhead"].sort(),
    );
    for (const id of copy.children) expect(page.nodes[id]!.parentId).toBe(copy.id);
    expect(kids[1]!.children.length).toBe(1);
  });

  it("三卡并列：首屏之后插入三列卡片", () => {
    const { document } = applyConceptStructure(source(), CONCEPT_STRUCTURES[2]!);
    const page = findPage(document, document.activePageId)!;
    const root = page.nodes[page.rootId]!;
    const names = root.children.map((id) => page.nodes[id]!.name);
    expect(names).toEqual(["Hero", "Highlights"]);
    const grid = Object.values(page.nodes).find((n) => n.name === "Highlights Grid")!;
    expect(grid.layout.mode).toBe("grid");
    expect(grid.layout.columns).toBe(3);
    expect(grid.children).toHaveLength(3);
  });

  it("导航开场：导航条排在首屏之前", () => {
    const { document } = applyConceptStructure(source(), CONCEPT_STRUCTURES[3]!);
    const page = findPage(document, document.activePageId)!;
    const root = page.nodes[page.rootId]!;
    expect(root.children.map((id) => page.nodes[id]!.name)).toEqual(["Top Bar", "Hero"]);
    const bar = page.nodes[root.children[0]!]!;
    expect(bar.children.map((id) => page.nodes[id]!.name)).toEqual(["Brand", "Nav", "Nav CTA"]);
    const nav = page.nodes[bar.children[1]!]!;
    expect(nav.children.map((id) => page.nodes[id]!.text)).toEqual(["产品", "模板", "定价"]);
  });

  it("页面结构缺失时如实说明，不静默跳过", () => {
    const empty = createDocument("空文档");
    empty.pages = [];
    empty.activePageId = "";
    const { notes } = applyConceptStructure(empty, CONCEPT_STRUCTURES[1]!);
    expect(notes.join("")).toContain("没有页面");
    const noTokens = createDocument("无 token");
    noTokens.tokens = [];
    const lang = applyConceptLanguage(noTokens, CONCEPT_LANGUAGES[1]!);
    expect(lang.notes.length).toBeGreaterThan(0);
    expect(lang.notes.join("")).toContain("没有落上去");
  });

  it("Combine：布局取自 A、视觉取自 C，两轴各自搬得动", () => {
    const doc = source();
    const [a, , c] = buildConcepts(doc, 4);
    const { document, notes } = mergeConceptDocuments(a!.document, c!.document, "A 的布局 + C 的视觉");
    expect(notes).toEqual([]);
    expect(document.name).toBe("A 的布局 + C 的视觉");
    expect(shapeOf(findPage(document, document.activePageId)!))
      .toEqual(shapeOf(findPage(a!.document, a!.document.activePageId)!));
    expect(tokenValues(document)).toBe(tokenValues(c!.document));
    expect(document.visualDna?.descriptors).toEqual(c!.document.visualDna?.descriptors);
    // 合成结果仍然是合法文档，并且与两个来源都不一样
    expect(validateDocument(document).filter((i) => i.severity === "error")).toEqual([]);
    expect(tokenValues(document)).not.toBe(tokenValues(a!.document));
  });

  it("源文档不受影响：生成方案是纯函数", () => {
    const doc = source();
    const frozen = JSON.stringify(shapeOf(findPage(doc, doc.activePageId)!)) + tokenValues(doc);
    buildConcepts(doc, 4);
    expect(JSON.stringify(shapeOf(findPage(doc, doc.activePageId)!)) + tokenValues(doc)).toBe(frozen);
  });
});

describe("视觉语言的几何旋钮（§12 / §29）", () => {
  const languageOf = (key: string) => CONCEPT_LANGUAGES.find((l) => l.key === key)!;
  const tokenValue = (doc: DesignDocument, key: string) =>
    doc.tokens.find((t) => t.key === key)?.value;
  const nodeNamed = (doc: DesignDocument, name: string) =>
    Object.values(findPage(doc)!.nodes).find((n) => n.name === name)!;

  it("「直角」把 radius.* 压成 0：节点上的引用不用改就跟着变", () => {
    const doc = createDocument("旋钮");
    expect(tokenValue(doc, "radius.md")).toBe(10);
    const { document: cyber, notes } = applyConceptLanguage(doc, languageOf("cyber"));
    expect(notes).toEqual([]);
    expect(tokenValue(cyber, "radius.md")).toBe(0);
    // 节点仍然只存引用（不是被改写成 0 这个数字）——这是"改一处、全局生效"的前提
    expect(nodeNamed(cyber, "Primary CTA").style.cornerRadius.topLeft).toBe("{radius.md}");
    expect(new TokenStore(cyber.tokens).resolveValue("{radius.md}", null)).toBe(0);
  });

  it("同一份结构在 warm 与 editorial 下圆角不同：语言轴真的换得动几何", () => {
    const source = createDocument("同一份结构");
    const warm = applyConceptLanguage(source, languageOf("warm")).document;
    const editorial = applyConceptLanguage(source, languageOf("editorial")).document;
    expect(new TokenStore(warm.tokens).resolveValue("{radius.md}", null)).toBe(20);
    expect(new TokenStore(editorial.tokens).resolveValue("{radius.md}", null)).toBe(2);
    expect(new TokenStore(warm.tokens).resolveValue("{space.16}", null)).toBe(72);
    expect(new TokenStore(editorial.tokens).resolveValue("{space.16}", null)).toBe(80);
  });

  it("DNA 的 radius / spacingScale 从落好 token 的文档里读，不是抄一份常量", () => {
    const { document } = applyConceptLanguage(createDocument("DNA"), languageOf("cinematic"));
    expect(document.visualDna?.radius).toBe(14);
    const scale = document.tokens
      .filter((t) => t.key.startsWith("space.") && typeof t.value === "number")
      .map((t) => t.value as number)
      .sort((a, b) => a - b);
    expect(document.visualDna?.spacingScale).toEqual(scale);
    expect(scale).toContain(96);
  });

  it("结构方向新增的卡片也引用 token：它跟着语言换圆角，而不是钉死", () => {
    const cards = CONCEPT_STRUCTURES.find((s) => s.key === "cards")!;
    const { document } = applyConceptStructure(createDocument("三卡"), cards);
    const card = nodeNamed(document, "Highlight 1");
    expect(card.style.cornerRadius.topLeft).toBe("{radius.md}");
    const warm = applyConceptLanguage(document, languageOf("warm")).document;
    expect(new TokenStore(warm.tokens).resolveValue("{radius.md}", null)).toBe(20);
  });
});
