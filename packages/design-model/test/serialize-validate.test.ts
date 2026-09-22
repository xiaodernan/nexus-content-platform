import { describe, expect, it } from "vitest";
import { createDocument, createNode, createPage, findPage } from "../src/nodes";
import {
  fromProjectFiles,
  toProjectFiles,
  serializeDocument,
  deserializeDocument,
} from "../src/serialize";
import { applyPatch } from "../src/patch";
import { TokenStore, contrastRatio, parseHex, toHex } from "../src/tokens";
import {
  collectTokenRefs,
  hasErrors,
  lintDesign,
  measureContrast,
  summarizeIssues,
  validateDocument,
} from "../src/validate";

describe(".nexus/ project format (§102)", () => {
  it("round-trips a document through files", () => {
    const doc = createDocument("Cinematic Portfolio", "website");
    const page = doc.pages[0]!;
    const hero = createNode({
      type: "section",
      name: "Hero",
      parentId: page.rootId,
      size: { width: "fill", height: 400 },
    });
    page.nodes[hero.id] = hero;
    page.nodes[page.rootId]!.children = [hero.id];

    const files = toProjectFiles(doc);
    expect(files[".nexus/project.json"]).toBeTruthy();
    expect(
      Object.keys(files).some((k) => k.startsWith(".nexus/design/pages/")),
    ).toBe(true);

    const restored = fromProjectFiles(files);
    expect(restored.name).toBe("Cinematic Portfolio");
    expect(restored.pages[0]!.nodes[hero.id]!.size.height).toBe(400);
    expect(restored.tokens.length).toBe(doc.tokens.length);
    expect(restored.activePageId).toBe(doc.activePageId);
  });

  it("fails loudly on a missing page file rather than inventing defaults (§159)", () => {
    const doc = createDocument("Broken");
    const files = toProjectFiles(doc);
    const pageFile = Object.keys(files).find((k) =>
      k.startsWith(".nexus/design/pages/"),
    )!;
    delete files[pageFile];
    expect(() => fromProjectFiles(files)).toThrow(/missing page file/);
  });

  it("rejects newer formats", () => {
    const doc = createDocument("Future");
    const files = toProjectFiles(doc);
    const manifest = JSON.parse(files[".nexus/project.json"]!) as {
      version: number;
    };
    manifest.version = 999;
    files[".nexus/project.json"] = JSON.stringify(manifest);
    expect(() => fromProjectFiles(files)).toThrow(
      /unsupported project version/,
    );
  });

  it("document JSON round-trips", () => {
    const doc = createDocument("JSON path");
    expect(deserializeDocument(serializeDocument(doc))).toEqual(doc);
  });
});

describe("validateDocument", () => {
  it("accepts a fresh document", () => {
    expect(validateDocument(createDocument("Ok"))).toEqual([]);
  });

  it("starter page has a hero whose colours all come from tokens", () => {
    const page = createDocument("Starter").pages[0]!;
    const hero = Object.values(page.nodes).find((n) => n.name === "Hero");
    const headline = Object.values(page.nodes).find((n) => n.name === "Headline");
    expect(hero?.type).toBe("section");
    expect(headline?.typography?.fontSize).toBeGreaterThanOrEqual(28);
    for (const node of Object.values(page.nodes)) {
      for (const paint of node.style.fills) {
        if (paint.kind === "solid") expect(String(paint.color)).toMatch(/^\{.+\}$/);
      }
    }
  });

  it("flags orphan nodes and dangling children", () => {
    const doc = createDocument("Dirty");
    const page = doc.pages[0]!;
    const orphan = createNode({ type: "text", name: "Orphan", text: "x" });
    page.nodes[orphan.id] = orphan;
    page.nodes[page.rootId]!.children = ["missing-1"];
    const issues = validateDocument(doc);
    expect(issues.map((i) => i.code)).toContain("orphan-node");
    expect(issues.map((i) => i.code)).toContain("missing-child");
    expect(hasErrors(issues)).toBe(true);
  });

  it("flags unknown token references with a suggestion", () => {
    const doc = createDocument("Tokens");
    const page = doc.pages[0]!;
    const node = createNode({
      type: "section",
      name: "S",
      parentId: page.rootId,
    });
    node.style.fills = [{ kind: "solid", color: "{color.does-not-exist}" }];
    page.nodes[node.id] = node;
    const missing = validateDocument(doc).find(
      (i) => i.code === "missing-token",
    );
    expect(missing?.message).toContain("color.does-not-exist");
    expect(missing?.suggestion).toBeTruthy();
  });

  it("requires an existing active page", () => {
    const doc = createDocument("No active");
    doc.activePageId = "nope";
    expect(validateDocument(doc).some((i) => i.severity === "error")).toBe(
      true,
    );
  });
});

describe("lintDesign (§32 / §121)", () => {
  it("collects token refs from a node", () => {
    const node = createNode({ type: "section", name: "S" });
    node.style.fills = [{ kind: "solid", color: "{color.primary}" }];
    node.layout.gap = "{space.4}";
    expect(collectTokenRefs(node).sort()).toEqual(["color.primary", "space.4"]);
  });

  it("reports hardcoded colors and off-grid padding", () => {
    const doc = createDocument("Lint");
    const page = doc.pages[0]!;
    const node = createNode({
      type: "section",
      name: "Block",
      parentId: page.rootId,
    });
    node.style.fills = [{ kind: "solid", color: "#123456" }];
    node.layout.padding = { top: 17, right: 0, bottom: 0, left: 0 };
    page.nodes[node.id] = node;
    page.nodes[page.rootId]!.children = [node.id];
    const codes = lintDesign(doc).map((i) => i.code);
    expect(codes).toContain("hardcoded-style");
    expect(codes).toContain("off-px-spacing");
  });

  it("把 off-grid 判定扩展到 gap（含 token 绑定的解析值），而不只是 padding", () => {
    const doc = createDocument("Gap Grid");
    const page = doc.pages[0]!;
    const node = createNode({ type: "section", name: "Row", parentId: page.rootId });
    // gap 落在栅格外（18），rowGap 是 token 且解析出的值也偏格
    doc.tokens.push({ key: "space.test6", type: "dimension", value: 6 });
    node.layout.gap = 18;
    node.layout.rowGap = "{space.test6}";
    page.nodes[node.id] = node;
    page.nodes[page.rootId]!.children = [node.id];
    const spacingPaths = lintDesign(doc)
      .filter((i) => i.code === "off-px-spacing")
      .map((i) => i.path);
    expect(spacingPaths).toContain("layout.gap");
    expect(spacingPaths).toContain("layout.rowGap");
  });

  it("gap 绑到 4 的倍数 token 时不报 off-grid", () => {
    const doc = createDocument("Gap On Grid");
    const page = doc.pages[0]!;
    const node = createNode({ type: "section", name: "Row", parentId: page.rootId });
    node.layout.gap = "{space.4}";
    node.layout.padding = { top: 0, right: 0, bottom: 0, left: 0 };
    page.nodes[node.id] = node;
    page.nodes[page.rootId]!.children = [node.id];
    const paths = lintDesign(doc)
      .filter((i) => i.code === "off-px-spacing")
      .map((i) => i.path);
    expect(paths).not.toContain("layout.gap");
  });

  it("flags low contrast text against the page background", () => {
    const doc = createDocument("Contrast");
    const page = doc.pages[0]!;
    page.nodes[page.rootId]!.style.fills = [
      { kind: "solid", color: "#ffffff" },
    ];
    const text = createNode({
      type: "text",
      name: "Faint",
      text: "barely visible",
      parentId: page.rootId,
    });
    text.style.fills = [{ kind: "solid", color: "#eeeeee" }];
    text.typography = {
      fontFamily: "Inter",
      fontSize: 14,
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: 0,
      align: "left",
      verticalAlign: "top",
    };
    page.nodes[text.id] = text;
    page.nodes[page.rootId]!.children = [text.id];
    const contrast = lintDesign(doc).find((i) => i.code === "low-contrast");
    expect(contrast?.severity).toBe("warning");
    expect(summarizeIssues(lintDesign(doc)).warning).toBeGreaterThan(0);
  });

  it("requires alt text on images and an accessible name on buttons", () => {
    const doc = createDocument("A11y");
    const page = doc.pages[0]!;
    const image = createNode({
      type: "image",
      name: "Hero shot",
      parentId: page.rootId,
    });
    const emptyButton = createNode({
      type: "button",
      name: "Icon only",
      parentId: page.rootId,
    });
    emptyButton.text = "   ";
    page.nodes[image.id] = image;
    page.nodes[emptyButton.id] = emptyButton;
    page.nodes[page.rootId]!.children = [image.id, emptyButton.id];
    const codes = lintDesign(doc).map((i) => i.code);
    expect(codes).toContain("missing-alt");
    expect(codes).toContain("no-text-on-button");
  });

  it("flags tap targets that resolve too small", () => {
    const doc = createDocument("Targets");
    const page = doc.pages[0]!;
    const tiny = createNode({
      type: "button",
      name: "Tiny",
      parentId: page.rootId,
      text: "ok",
    });
    tiny.size = { width: 20, height: 20 };
    page.nodes[tiny.id] = tiny;
    page.nodes[page.rootId]!.children = [tiny.id];
    const codes = lintDesign(doc, { [tiny.id]: { width: 20, height: 20 } }).map(
      (i) => i.code,
    );
    expect(codes).toContain("tap-target-small");
  });
});

describe("measureContrast（§90：测不出来就不报，绝不编一个 1:1）", () => {
  const tokenHex = (doc: ReturnType<typeof createDocument>, key: string) => {
    const token = doc.tokens.find((t) => t.key === key);
    return toHex(token!.value);
  };
  /** 起手页自带 hero 文案，会混进体检结果；这些用例只要一张白纸 */
  const bareDoc = (name: string) => {
    const doc = createDocument(name);
    const page = createPage("Home");
    doc.pages = [page];
    doc.activePageId = page.id;
    return doc;
  };
  /** 默认主题是深底浅字，这几个用例把纸面钉成白底，就得自己钉一个深色正文 */
  const setTextToken = (doc: ReturnType<typeof createDocument>, hex: string) => {
    doc.tokens = doc.tokens.map((t) =>
      t.key === "color.text" ? { ...t, value: hex, modes: undefined } : t,
    );
  };

  it("token 引用先解析：正确使用 token 的设计不会被误判成 1:1", () => {
    const doc = bareDoc("Tokens");
    setTextToken(doc, "#111111");
    const page = doc.pages[0]!;
    const root = page.nodes[page.rootId]!;
    root.style.fills = [{ kind: "solid", color: "#ffffff" }];
    const text = createNode({ type: "text", name: "Body", text: "正文", parentId: root.id });
    text.style.fills = [{ kind: "solid", color: "{color.text}" }];
    page.nodes[text.id] = text;
    root.children = [text.id];

    const measured = measureContrast(page, text, new TokenStore(doc.tokens), doc.activeMode);
    expect(measured).not.toBeNull();
    expect(measured!.foreground).toBe(tokenHex(doc, "color.text"));
    expect(measured!.background).toBe("#ffffff");
    expect(measured!.ratio).toBeCloseTo(contrastRatio(measured!.foreground, "#ffffff"), 5);
    expect(lintDesign(doc).some((i) => i.code === "low-contrast")).toBe(false);
  });

  it("背景沿祖先链取：卡片上的字比的是卡片，不是页面底色", () => {
    const doc = bareDoc("Ancestors");
    setTextToken(doc, "#111111");
    const page = doc.pages[0]!;
    const root = page.nodes[page.rootId]!;
    root.style.fills = [{ kind: "solid", color: "#ffffff" }];
    const card = createNode({ type: "section", name: "Card", parentId: root.id });
    card.style.fills = [{ kind: "solid", color: "#000000" }];
    const text = createNode({ type: "text", name: "OnCard", text: "卡片里", parentId: card.id });
    text.style.fills = [{ kind: "solid", color: "{color.text}" }];
    page.nodes[card.id] = card;
    page.nodes[text.id] = text;
    root.children = [card.id];
    card.children = [text.id];

    const measured = measureContrast(page, text, new TokenStore(doc.tokens), doc.activeMode)!;
    expect(measured.background).toBe("#000000");
    // 深色 token 文字放进黑卡片 = 真不达标，这条必须报出来
    expect(measured.ratio).toBeLessThan(4.5);
    expect(lintDesign(doc).find((i) => i.code === "low-contrast")?.message).toContain("#000000");
  });

  it("半透明层先合成再比：不把 rgba 当成它自己的颜色", () => {
    const doc = bareDoc("Composite");
    const page = doc.pages[0]!;
    const root = page.nodes[page.rootId]!;
    root.style.fills = [{ kind: "solid", color: "#ffffff" }];
    const veil = createNode({ type: "section", name: "Veil", parentId: root.id });
    veil.style.fills = [{ kind: "solid", color: { r: 0, g: 0, b: 0, a: 0.5 } }];
    const text = createNode({ type: "text", name: "Under", text: "纱层下", parentId: veil.id });
    text.style.fills = [{ kind: "solid", color: "#ffffff" }];
    page.nodes[veil.id] = veil;
    page.nodes[text.id] = text;
    root.children = [veil.id];
    veil.children = [text.id];

    const measured = measureContrast(page, text, new TokenStore(doc.tokens), doc.activeMode)!;
    const bg = parseHex(measured.background)!;
    expect(bg.r).toBeGreaterThan(120);
    expect(bg.r).toBeLessThan(136);
    expect(measured.ratio).toBeLessThan(4.5);
  });

  it("按钮的正文颜色取 typography.color，不是它自己的填充", () => {
    const doc = bareDoc("Button");
    const page = doc.pages[0]!;
    const root = page.nodes[page.rootId]!;
    root.style.fills = [{ kind: "solid", color: "#ffffff" }];
    const button = createNode({ type: "button", name: "CTA", text: "开始", parentId: root.id });
    button.style.fills = [{ kind: "solid", color: "{color.primary}" }];
    button.typography = { ...button.typography!, color: "{color.on-primary}" };
    page.nodes[button.id] = button;
    root.children = [button.id];

    const measured = measureContrast(page, button, new TokenStore(doc.tokens), doc.activeMode)!;
    expect(measured.foreground).toBe(tokenHex(doc, "color.on-primary"));
    expect(measured.background).toBe(tokenHex(doc, "color.primary"));
  });

  it("渐变文字算不出前景色：返回 null，不报也不假装达标", () => {
    const doc = bareDoc("Gradient");
    const page = doc.pages[0]!;
    const root = page.nodes[page.rootId]!;
    root.style.fills = [{ kind: "solid", color: "#ffffff" }];
    const text = createNode({ type: "text", name: "Shiny", text: "渐变字", parentId: root.id });
    text.style.fills = [
      { kind: "gradient", type: "linear", stops: [{ at: 0, color: "#ffffff" }, { at: 1, color: "#000000" }] },
    ];
    page.nodes[text.id] = text;
    root.children = [text.id];

    expect(measureContrast(page, text, new TokenStore(doc.tokens), doc.activeMode)).toBeNull();
    expect(lintDesign(doc).some((i) => i.code === "low-contrast")).toBe(false);
  });
});

describe("token bindings survive patching (§12)", () => {  it("a token edit is the single change point for every bound node", () => {
    const doc = createDocument("Bound");
    const page = doc.pages[0]!;
    const a = createNode({ type: "section", name: "A", parentId: page.rootId });
    a.style.fills = [{ kind: "solid", color: "{color.primary}" }];
    const b = createNode({
      type: "button",
      name: "B",
      parentId: page.rootId,
      text: "Go",
    });
    b.style.fills = [{ kind: "solid", color: "{color.primary}" }];
    page.nodes[a.id] = a;
    page.nodes[b.id] = b;
    page.nodes[page.rootId]!.children = [a.id, b.id];

    const patched = applyPatch(doc, {
      ops: [{ op: "setToken", key: "color.primary", value: "#ff0000" }],
    });
    const pageAfter = findPage(patched.document)!;
    // 节点仍存引用，渲染层解析后取到新值 —— 这是"改一处、全局生效"的机制
    expect(
      (pageAfter.nodes[a.id]!.style.fills[0] as { color: string }).color,
    ).toBe("{color.primary}");
    expect(
      patched.document.tokens.find((t) => t.key === "color.primary")!.value,
    ).toBe("#ff0000");
  });
});
