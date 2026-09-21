import { describe, expect, it } from "vitest";
import ts from "typescript";
import { createDocument, createNode, radius, starterPage } from "../src/nodes";
import {
  generatePageComponent,
  generateProject,
  generateTokenCss,
} from "../src/codegen";
import type { DesignNode, GeneratedFile } from "../src/index";

/** §192：生成的代码必须真的能编译，而不是"看起来像 TSX" */
function transpileDiagnostics(file: GeneratedFile): string[] {
  const result = ts.transpileModule(file.contents, {
    fileName: file.path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
    },
  });
  return (result.diagnostics ?? []).map(
    (d) => ts.flattenDiagnosticMessageText(d.messageText, " "),
  );
}

const findByTag = (files: GeneratedFile[], tag: string): GeneratedFile => {
  const hit = files.find((f) => f.contents.includes(tag));
  if (!hit) throw new Error(`没有文件包含 ${tag}`);
  return hit;
}

const attrsBefore = (source: string, text: string): string => {
  const lines = source.split("\n");
  const at = lines.findIndex((l) => l.trim() === text);
  if (at < 0) throw new Error(`找不到文本行 ${text}`);
  for (let j = at - 1; j >= 0; j -= 1) {
    const line = lines[j]!;
    if (line.includes('className="')) return line.trim();
  }
  throw new Error(`找不到 ${text} 的元素属性行`);
};

const lineWith = (source: string, needle: string): string => {
  const line = source.split("\n").find((l) => l.includes(needle));
  if (!line) throw new Error(`找不到包含 ${needle} 的行`);
  return line;
};

describe("Design → Code（§17-19）", () => {
  const doc = createDocument("Demo");
  const files = generateProject(doc, {});
  const page = findByTag(files, "NEXUS STUDIO");

  it("产出 tokens.css + 每个页面一个组件 + 入口索引", () => {
    expect(files.map((f) => f.path)).toEqual([
      "styles/tokens.css",
      "components/nexus/Home.tsx",
      "components/nexus/index.ts",
    ]);
    expect(page.contents).toContain("export function Home()");
    expect(findByTag(files, "nexusPages").contents).toContain(
      'import { Home } from "./Home";',
    );
  });

  it("生成的 TSX 能被 TypeScript 编译，且没有语法诊断", () => {
    for (const file of files.filter((f) => f.path.endsWith(".tsx"))) {
      expect(transpileDiagnostics(file)).toEqual([]);
    }
  });

  it("同一份模型两次生成结果完全一致（确定性投影）", () => {
    const again = generateProject(doc, {});
    expect(again).toEqual(files);
  });

  it("token 引用生成 CSS 变量，而不是把值烤死进代码（§12）", () => {
    const tokens = generateTokenCss(doc.tokens);
    expect(tokens).toContain("--nx-color-primary: #7c5cff;");
    expect(tokens).toContain("--nx-motion-fast: 120ms;");
    expect(tokens).toContain("--nx-space-4: 16px;");
    expect(tokens).toContain('[data-theme="light"]');
    expect(tokens).toContain("--nx-color-primary: #5b3df5;");
    expect(page.contents).toContain("bg-[var(--nx-color-surface)]");
    expect(page.contents).not.toContain("#7c5cff");
  });

  it("按钮背景来自 fills，字色来自 typography.color；文本节点反过来", () => {
    const cta = attrsBefore(page.contents, "开始设计");
    expect(cta).toContain('type="button"');
    expect(cta).toContain("bg-[var(--nx-color-primary)]");
    expect(cta).toContain("text-[var(--nx-color-on-primary)]");

    const eyebrow = attrsBefore(page.contents, "NEXUS STUDIO");
    expect(eyebrow).toContain("text-[var(--nx-color-accent)]");
    expect(eyebrow).not.toContain("bg-[var(--nx-color-accent)]");

    const secondary = attrsBefore(page.contents, "查看文档");
    expect(secondary).not.toContain("bg-[");
    expect(secondary).toContain("border-[var(--nx-color-border)]");
    expect(secondary).toContain("text-[var(--nx-color-text)]");
  });

  it("几何只来自模型：padding / gap / 尺寸都写成任意值类", () => {
    const hero = lineWith(page.contents, "pt-[64px]");
    expect(hero).toContain("flex flex-col");
    expect(hero).toContain("gap-[24px]");
    expect(hero).toContain("justify-start");
    expect(hero).toContain("items-start");
    expect(hero).toContain("pr-[40px]");
    expect(hero).toContain("pb-[64px]");
    expect(hero).toContain("pl-[40px]");
    const root = lineWith(page.contents, "<main");
    expect(root).toContain("w-[1440px]");
    expect(root).toContain("h-[900px]");
    const eyebrow = attrsBefore(page.contents, "NEXUS STUDIO");
    expect(eyebrow).toContain("w-fit");
    const headline = attrsBefore(page.contents, "从一句话到一个可发布的产品");
    expect(headline).toContain("self-stretch");
  });

  it("fill / hug / fixed 在 flex 主轴与交叉轴上分别映射为 flex-1 / self-stretch / w-fit", () => {
    const vertical = createNode({ type: "section", name: "V", layout: { mode: "vertical" } });
    const child = createNode({ type: "container", name: "C", size: { width: "fill", height: 40 } });
    const page2 = starterPage("P");
    const root = page2.nodes[page2.rootId]!;
    root.children = [vertical.id];
    vertical.parentId = root.id;
    vertical.children = [child.id];
    child.parentId = vertical.id;
    page2.nodes[vertical.id] = vertical;
    page2.nodes[child.id] = child;
    const file = generatePageComponent(page2, {}, "Probe");
    // 垂直父级：交叉轴（宽）fill → self-stretch；主轴（高）fixed → h-[40px]
    expect(file.contents).toContain("self-stretch");
    expect(file.contents).toContain("h-[40px]");
    const horizontal = createNode({ type: "section", name: "H", layout: { mode: "horizontal" } });
    const fill = createNode({ type: "container", name: "F", size: { width: "fill", height: "hug" } });
    fill.parentId = horizontal.id;
    horizontal.children = [fill.id];
    horizontal.parentId = root.id;
    root.children.push(horizontal.id);
    page2.nodes[horizontal.id] = horizontal;
    page2.nodes[fill.id] = fill;
    const file2 = generatePageComponent(page2, {}, "Probe");
    // 水平父级：主轴 fill → flex-1
    expect(file2.contents).toContain("flex-1");
  });

  it("hug 宽度的文字用 whitespace-pre，避免 DOM 二次换行（§16）", () => {
    expect(attrsBefore(page.contents, "NEXUS STUDIO")).toContain("whitespace-pre ");
    expect(attrsBefore(page.contents, "从一句话到一个可发布的产品")).toContain("whitespace-pre-wrap");
  });

  it("大字重文本映射成语义标签，其它文本保持段落", () => {
    expect(page.contents).toContain("<h1 ");
    expect(page.contents).toContain("<p className");
  });

  it("mode='light' 时根元素带 data-theme，交由 tokens.css 切换变量", () => {
    const file = generatePageComponent(starterPage("Home"), { mode: "light" }, "Home");
    expect(file.contents.split("\n").find((l) => l.trim().startsWith("<main"))).toContain(
      'data-theme="light"',
    );
  });

  it("响应式覆盖 → 断点前缀（§14）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "R",
      size: { width: "fill", height: "hug" },
      layout: { mode: "vertical", gap: 16 },
    });
    node.responsive = [
      { breakpoint: "tablet", patch: { layout: { mode: "horizontal", gap: 24 }, size: { height: 200 } } },
      { breakpoint: "desktop", patch: { layout: { columns: 2 }, size: { width: 900 } } },
      { breakpoint: "wide", patch: { visible: false } },
    ];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const file = generatePageComponent(page2, {}, "Home");
    const line = lineWith(file.contents, "md:flex-row");
    expect(line).toContain("md:gap-[24px]");
    expect(line).toContain("md:h-[200px]");
    expect(line).toContain("lg:w-[900px]");
    expect(line).toContain("lg:grid-cols-[repeat(2,minmax(0,1fr))]");
    expect(line).toContain("xl:hidden");
  });

  it("mode=none 的父级里子节点用绝对定位，跟画布同一份几何", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const box = createNode({
      type: "group",
      name: "Absolute",
      layout: { mode: "none" },
      size: { width: 300, height: 200 },
    });
    const dot = createNode({ type: "shape", name: "Dot", size: { width: 20, height: 20 } });
    dot.position = { x: 120, y: 60 };
    dot.parentId = box.id;
    box.children = [dot.id];
    box.parentId = root.id;
    root.children = [box.id];
    page2.nodes[box.id] = box;
    page2.nodes[dot.id] = dot;
    const file = generatePageComponent(page2, {}, "Home");
    expect(lineWith(file.contents, box.id)).toContain("relative");
    expect(lineWith(file.contents, box.id)).not.toContain("absolute");
    expect(lineWith(file.contents, dot.id)).toContain("absolute left-[120px] top-[60px]");
  });

  it("隐藏节点保留在代码里但标记 hidden，与画布一致地不占位", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const ghost = createNode({ type: "text", name: "Ghost", text: "看不见" });
    ghost.visible = false;
    ghost.parentId = root.id;
    root.children = [ghost.id];
    page2.nodes[ghost.id] = ghost;
    const file = generatePageComponent(page2, {}, "Home");
    expect(lineWith(file.contents, ghost.id)).toContain("whitespace-pre hidden");
    expect(lineWith(file.contents, ghost.id)).toContain("w-fit");
  });

  it("含 JSX 特殊字符的文本走字符串字面量，不破坏结构", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const risky = createNode({ type: "text", name: "Risky", text: "1 < 2 && {x}" });
    risky.parentId = root.id;
    root.children = [risky.id];
    page2.nodes[risky.id] = risky;
    const file = generatePageComponent(page2, {}, "Home");
    expect(file.contents).toContain('{"1 < 2 && {x}"}');
    expect(transpileDiagnostics(file)).toEqual([]);
  });

  it("code-only 区域原样保留（§19）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const region: DesignNode = createNode({ type: "code", name: "Canvas widget" });
    region.code = { language: "tsx", content: "<canvas ref={r} />", readOnly: true };
    region.parentId = root.id;
    root.children = [region.id];
    page2.nodes[region.id] = region;
    const file = generatePageComponent(page2, {}, "Home");
    expect(file.contents).toContain("code-only 区域");
    expect(file.contents).toContain('{"<canvas ref={r} />"}');
    expect(transpileDiagnostics(file)).toEqual([]);
  });

  it("three / webgl 节点保留占位容器并注明由 Runtime 承载（§50）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const scene = createNode({ type: "three", name: "Scene", size: { width: "fill", height: 480 } });
    scene.parentId = root.id;
    root.children = [scene.id];
    page2.nodes[scene.id] = scene;
    const file = generatePageComponent(page2, {}, "Home");
    expect(file.contents).toContain("由 NEXUS Runtime 承载");
    expect(transpileDiagnostics(file)).toEqual([]);
  });

  it("同名页面不会生成同名导出", () => {
    const doc2 = createDocument("Demo");
    doc2.pages.push(starterPage("Home"));
    const names = generateProject(doc2, {})
      .filter((f) => f.path.endsWith(".tsx"))
      .map((f) => /export function (\w+)/.exec(f.contents)?.[1]);
    expect(names).toEqual(["Home", "HomeX"]);
  });

  it("圆角/描边/阴影按模型值生成，不做二次设计", () => {
    const node = createNode({ type: "card", name: "Card", size: { width: 200, height: 100 } });
    node.style.cornerRadius = radius(12);
    node.style.strokes = [
      { paints: [{ kind: "solid", color: "#ff0000" }], width: 1.5, position: "inside" },
    ];
    node.style.effects = [
      { kind: "drop-shadow", offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: "rgba(0,0,0,0.32)" },
    ];
    node.style.opacity = 0.9;
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const line = generatePageComponent(page2, {}, "Home").contents
      .split("\n")
      .find((l) => l.includes(node.id));
    expect(line).toContain("rounded-[12px]");
    expect(line).toContain("border-[1.5px]");
    expect(line).toContain("border-[#ff0000]");
    expect(line).toContain("shadow-[0px_8px_24px_0px_rgba(0,0,0,0.32)]");
    expect(line).toContain("opacity-[0.9]");
  });
});
