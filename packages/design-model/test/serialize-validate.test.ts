import { describe, expect, it } from "vitest";
import { createDocument, createNode, findPage } from "../src/nodes";
import {
  fromProjectFiles,
  toProjectFiles,
  serializeDocument,
  deserializeDocument,
} from "../src/serialize";
import { applyPatch } from "../src/patch";
import {
  collectTokenRefs,
  hasErrors,
  lintDesign,
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

describe("token bindings survive patching (§12)", () => {
  it("a token edit is the single change point for every bound node", () => {
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
