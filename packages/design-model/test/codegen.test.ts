import { describe, expect, it } from "vitest";
import ts from "typescript";
import { createDocument, createNode, radius, starterPage } from "../src/nodes";
import {
  generatePageComponent,
  generateProject,
  generateTokenCss,
  DIRECTION_CLASS,
  DISPLAY_CLASSES,
} from "../src/codegen";
import type { DesignNode, GeneratedFile } from "../src/index";
import { ALIGNABLE_MODES, type Layout, type LayoutMode } from "../src/types";

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

/**
 * 那一行的类名清单。整行 `toContain` 在断点这一寸上会说谎：`md:flex-col` 里含着
 * `flex-col` 这三个连字符，"基线没有 flex-col" 用子串永远证不出来。
 */
const tokensOf = (source: string, needle: string): string[] => {
  const value = /className="([^"]*)"/.exec(lineWith(source, needle))?.[1] ?? "";
  return value.split(" ").filter(Boolean);
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
    expect(tokens).toContain("--nx-color-primary: #6b4ff0;");
    expect(tokens).toContain("--nx-motion-fast: 120ms;");
    expect(tokens).toContain("--nx-space-4: 16px;");
    expect(tokens).toContain('[data-theme="light"]');
    expect(tokens).toContain("--nx-color-primary: #5b3df5;");
    expect(page.contents).toContain("bg-[var(--nx-color-surface)]");
    expect(page.contents).not.toContain("#6b4ff0");
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

  it("几何只来自模型：token 绑定写成 CSS 变量，字面数值写成任意值类", () => {
    // 起手页的间距/圆角绑的是 space.* / radius.*（§12），所以生成的代码里出现的是变量而不是烤死的 px
    const hero = lineWith(page.contents, "pt-[var(--nx-space-16)]");
    expect(hero).toContain("flex flex-col");
    expect(hero).toContain("gap-[var(--nx-space-6)]");
    expect(hero).toContain("justify-start");
    expect(hero).toContain("items-start");
    expect(hero).toContain("pr-[var(--nx-space-8)]");
    expect(hero).toContain("pb-[var(--nx-space-16)]");
    expect(hero).toContain("pl-[var(--nx-space-8)]");
    expect(attrsBefore(page.contents, "开始设计")).toContain("rounded-[var(--nx-radius-md)]");
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
      { breakpoint: "desktop", patch: { layout: { mode: "grid", columns: 2 }, size: { width: 900 } } },
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
    // 排布类带着 display：基线是 `flex flex-col`，`md:flex-row` 不改 display 就翻不回横排
    expect(line).toContain("md:flex");
    expect(line).toContain("lg:grid");
    expect(line).toContain("lg:grid-cols-[repeat(2,minmax(0,1fr))]");
    expect(line).toContain("xl:hidden");
  });

  it("断点只写列数不改排布：网格类整条不发（§159 的\"不动的类\"）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "ColumnsOnly",
      layout: { mode: "vertical", gap: 16 },
      size: { width: 300, height: 200 },
    });
    node.responsive = [{ breakpoint: "tablet", patch: { layout: { columns: 3 } } }];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const line = lineWith(generatePageComponent(page2, {}, "Home").contents, node.id);
    // 这一档解出来的排布还是竖排：`grid-cols-[…]` 落在 flex 容器上浏览器什么都不做，
    // 发出去就是代码视图在说"生效了"而画布没动。模型里那一条键留着（徽标会数到它）。
    expect(line).not.toContain("grid-cols");
    expect(line).not.toContain("md:grid");
  });

  it("断点的 padding 与透明度发得出来（§14）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "PadOpacity",
      layout: { mode: "vertical", gap: 16 },
      size: { width: 300, height: 200 },
    });
    node.responsive = [
      {
        breakpoint: "tablet",
        patch: { layout: { padding: { top: 24, right: 8, bottom: 24, left: 8 } }, style: { opacity: 0.6 } },
      },
      { breakpoint: "desktop", patch: { layout: { padding: { top: 32, right: 32, bottom: 32, left: 32 } } } },
      // 只有 top 的 patch 是 `ResponsiveRule` 摆不出、库里却躺着的那种（`layout.ts:370` 同一句：
      // 老行或绕过校验写进来的残缺节点）。补齐另外三条 = 把模型里没有的键写进代码，也读不回来。
      { breakpoint: "wide", patch: { layout: { padding: { left: 4 } as Layout["padding"] } } },
    ];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const line = lineWith(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(line).toContain("md:pt-[24px]");
    expect(line).toContain("md:pr-[8px]");
    expect(line).toContain("md:opacity-[0.6]");
    // 四边同值折成一条 p-，与基线同一个拼法
    expect(line).toContain("lg:p-[32px]");
    // patch 只写了一条边就只发那一条：凭空补齐另外三条会把模型里没有的东西写进代码
    expect(line).toContain("xl:pl-[4px]");
    expect(line).not.toContain("xl:pt-");
  });

  it("mobile 那一档走基线：无前缀那组类就是「设计 + 手机规则」那份投影（§14 第五片）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "MobileRule",
      layout: { mode: "vertical", gap: 16 },
      size: { width: 300, height: 200 },
    });
    node.responsive = [
      { breakpoint: "mobile", patch: { layout: { mode: "horizontal", gap: 8 } } },
      { breakpoint: "tablet", patch: { layout: { mode: "vertical" } } },
    ];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const source = generatePageComponent(page2, {}, "Home").contents;
    const tokens = tokensOf(source, node.id);
    // 手机那两条覆盖进了基线，设计值留下的那两条**一个都不剩**——留着就是两组同特异性互相抢，
    // 谁赢由框架的产出顺序决定（这正是旧口径"照实不发"的理由，见 ADR-0069）。
    expect(tokens).toContain("flex");
    expect(tokens).toContain("flex-row");
    expect(tokens).toContain("gap-[8px]");
    expect(tokens).not.toContain("flex-col");
    expect(tokens).not.toContain("gap-[16px]");
    // 更宽那档从整条级联解：tablet 自己改回竖排，`md:` 那组顶掉基线；
    // 它没声明 gap，所以没有 `md:gap-`——基线那条 8px 本来就一直生效到这一档。
    expect(tokens).toContain("md:flex");
    expect(tokens).toContain("md:flex-col");
    expect(tokens.filter((token) => token.startsWith("md:gap-"))).toEqual([]);
  });

  it("没有手机那一档的覆盖时，基线一个字节都不为这条链让路（§14 第五片的反面）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "NoMobileRule",
      layout: { mode: "vertical", gap: 16 },
      size: { width: 300, height: 200 },
    });
    // 只有 tablet 及更宽的规则：基线仍读设计值，`applyResponsive(node,"mobile")` 在这里返回同一个引用
    node.responsive = [{ breakpoint: "tablet", patch: { layout: { mode: "horizontal" } } }];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(tokens).toContain("flex-col");
    expect(tokens).toContain("gap-[16px]");
    expect(tokens).not.toContain("flex-row");
    expect(tokens).toContain("md:flex");
    expect(tokens).toContain("md:flex-row");
  });

  it("对齐两键跟着这一档解出来的排布走：grid / wrap 那两档一条都不发（§14 第六片）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "Align",
      layout: { mode: "vertical", gap: 16 },
      size: { width: 300, height: 200 },
    });
    node.responsive = [
      // 这一档没改排布，级联解出来还是竖排 → 求解器真会按这两键摆放，发
      { breakpoint: "tablet", patch: { layout: { justify: "space-between", items: "center" } } },
      // 这一档自己翻成网格：`layout.ts` 的 grid 分支在碰 justify/items 之前就 return，画布什么都不摆，
      // 而 `justify-content` 在 CSS 的网格容器上真会挪东西——发出去等于两份投影互相矛盾（§16），
      // 画布没动、预览与访客动了（§159 说的是同一件事）
      { breakpoint: "desktop", patch: { layout: { mode: "grid", columns: 2, justify: "center" } } },
      // wrap 同理。而且 tablet 那两条 `items: center` 会级联进来——一并压住，
      // 不然宽档代码里挂着的是一条本档没声明、也没生效的类
      { breakpoint: "wide", patch: { layout: { mode: "wrap", items: "end" } } },
    ];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(tokens).toContain("md:justify-between");
    expect(tokens).toContain("md:items-center");
    expect(tokens.filter((token) => token.startsWith("lg:justify"))).toEqual([]);
    expect(tokens.filter((token) => token.startsWith("lg:items"))).toEqual([]);
    expect(tokens.filter((token) => token.startsWith("xl:justify"))).toEqual([]);
    expect(tokens.filter((token) => token.startsWith("xl:items"))).toEqual([]);
    // 压住的是**类**，不是模型里那几条键：断点面板与徽标照样数得到它们（读的是 patch）
    expect(node.responsive?.[1]?.patch.layout).toMatchObject({ mode: "grid", justify: "center" });
  });

  it("反向那一格跟着这一档解出来的排布走：自动布局发方向类，grid 一档不发（§14 第七片）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "Reverse",
      layout: { mode: "vertical", gap: 16 },
      size: { width: 300, height: 200 },
    });
    node.responsive = [
      // 这一档没改排布，级联解出来还是竖排 ⇒ 求解器真会镜像主轴，这条类发得出来
      { breakpoint: "tablet", patch: { layout: { reverse: true } } },
      // 这一档自己翻成网格：`layout.ts` 的 grid 分支在碰主轴分配之前就 return，reverse 在那里
      // 什么都不摆；而 `lg:grid` 之后 `flex-direction` 也不管事——发出去等于凭空一条类（§16）
      { breakpoint: "desktop", patch: { layout: { mode: "grid", columns: 2, reverse: true } } },
    ];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(tokens).toContain("md:flex-col-reverse");
    expect(tokens.filter((token) => token.startsWith("lg:flex"))).toEqual([]);
    // 设计值没写 reverse ⇒ 无前缀那一条也不该冒出来（那是手机档的基线，读的是解出来的那一份）
    expect(tokens).not.toContain("flex-col-reverse");
  });

  it("设计值本来就是网格时，反向那条类一个字都不发（§14 第七片 × §16）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "GridReverse",
      // 网格 + reverse：`layout.ts` 的 grid 分支在碰主轴分配之前就 return ⇒ 画布什么都不动，
      // 而发出去的 `flex-col-reverse` 会把 display 从 grid 顶成 flex（访客动了、画布没动）。
      layout: { mode: "grid", columns: 2, gap: 16, reverse: true },
      size: { width: 300, height: 200 },
    });
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(tokens.filter((token) => token.endsWith("-reverse"))).toEqual([]);
    expect(tokens).toContain("grid");
  });

  it("设计值自己就是反向的：那条类发在无前缀基线上（第七片补的正向腿——上面只有\"不该发\"那半）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      // 起手只有"不该发"那一条（`not.toContain`）：删掉基线那处的发射它照样绿。
      // 这一条钉的是另一头——求解器认这个键之后，设计值反着的元素在代码里也得是反着的。
      layout: { mode: "vertical", gap: 16, reverse: true },
      size: { width: 300, height: 200 },
    });
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(tokens).toContain("flex-col-reverse");
    // 正向那一条还在（`layout.mode` 自己声明的）：反向类靠框架产出顺序赢，量过的，见 ADR-0069 第七片
    expect(tokens).toContain("flex-col");
  });

  it("这一档取消更窄那档的反向：重发正向方向类，没得取消时一个字都不发（§14 第八片）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "ReverseCancel",
      layout: { mode: "vertical", gap: 16, reverse: true },
      size: { width: 300, height: 200 },
    });
    node.responsive = [
      // 基线（设计 + mobile 档）是反着的 ⇒ tablet 这一句真顶掉了什么：CSS 没有"取消反向"的类，
      // 靠的是重说一遍方向，`md:flex-col` 排在基线那条之后才赢（量的过程见 ADR-0069）
      { breakpoint: "tablet", patch: { layout: { reverse: false } } },
      // desktop 这一句面对的是已经不反着的 tablet ⇒ 什么都不改，也就不发：
      // 发一条回写侧不认的类，等于代码里多一个模型不认的表态（§16）
      { breakpoint: "desktop", patch: { layout: { reverse: false } } },
      // 排布是网格时更窄那档的 reverse 本来就没被求解器读过（第七片），这一句顶不掉东西
      { breakpoint: "wide", patch: { layout: { mode: "grid", columns: 2, reverse: false } } },
    ];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(tokens).toContain("flex-col-reverse");
    expect(tokens).toContain("md:flex-col");
    expect(tokens.filter((token) => token.startsWith("lg:flex"))).toEqual([]);
    // 全页只有基线那一条反向类：这一片的三句 `reverse:false` 里只有 tablet 那句顶掉东西，
    // desktop 与 wide 那句都被判据挡下（发射侧与回写侧读的是同一寸）
    expect(tokens.filter((token) => token.includes("reverse"))).toEqual(["flex-col-reverse"]);
    expect(tokens).toContain("xl:grid");
  });

  it("正向方向类那张表在两档自动布局各挑得出唯一一条（§14 第八片的前提）", () => {
    // `DIRECTION_CLASS` 从 `DISPLAY_CLASSES` 派生，判据是"在这一档只出现过一次的类名"，
    // 挑不出唯一一条就不填。今天这条判据永远吃得着（`flex` 竖/横/换行共用被排除，各剩一条），
    // 所以把 `=== 1` 改成别的比较符是一次等价变异，臂测不出东西——真正会悄悄失灵的是以后有人
    // 往表里给同一档加第二条类名：那时这一档挑不出唯一一条，取消反向那一支一个字都不发，
    // 画布与模型都动了而代码不动（§16）。这一条钉的就是那个前提，让改表的人在发射失灵之前先红。
    expect(DIRECTION_CLASS.vertical).toBe("flex-col");
    expect(DIRECTION_CLASS.horizontal).toBe("flex-row");
    expect(ALIGNABLE_MODES.every((mode) => DIRECTION_CLASS[mode] !== undefined)).toBe(true);
    // 非自动布局那几档不能有条目：发了方向类而求解器不看，代码里就多一条模型不认的表态
    const nonAlignable = (Object.keys(DISPLAY_CLASSES) as LayoutMode[]).filter(
      (mode) => !ALIGNABLE_MODES.includes(mode),
    );
    expect(nonAlignable.length).toBe(4);
    expect(nonAlignable.map((mode) => DIRECTION_CLASS[mode])).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("手机那一档的对齐发在无前缀基线上（§14 第五片 × 第六片）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "MobileAlign",
      layout: { mode: "vertical", gap: 16, justify: "start", items: "start" },
      size: { width: 300, height: 200 },
    });
    node.responsive = [{ breakpoint: "mobile", patch: { layout: { justify: "end" } } }];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    // 基线读的是「设计 + mobile 规则」那份投影：那一条 `justify-end` 本来就一路生效到最宽档，
    // 再补一条 `md:justify-end` 是同一特异性的重复
    expect(tokens).toContain("justify-end");
    expect(tokens).not.toContain("justify-start");
    expect(tokens.filter((token) => token.endsWith("justify-end"))).toEqual(["justify-end"]);
    // items 这一档没声明 → 基线沿用设计值那一条，不凭空发 `md:items-`
    expect(tokens).toContain("items-start");
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

  it("断点绝对化翻转只在对应 tier 发：desktop-only 的 none 不会漏进 md（§14）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const parent = createNode({
      type: "section",
      name: "WideFlipParent",
      layout: { mode: "horizontal", gap: 8 },
      size: { width: 400, height: 300 },
    });
    parent.parentId = root.id;
    root.children = [parent.id];
    page2.nodes[parent.id] = parent;
    const child = createNode({
      type: "section",
      name: "WideFlipChild",
      layout: { mode: "vertical", gap: 0 },
      position: { x: 30, y: 60 },
      size: { width: 80, height: 60 },
    });
    child.parentId = parent.id;
    parent.children = [child.id];
    page2.nodes[child.id] = child;
    // 只在 wide 档把父级翻到 none：md: 不该发、xl: 才发
    page2.nodes[parent.id] = {
      ...page2.nodes[parent.id]!,
      responsive: [{ breakpoint: "wide", patch: { layout: { mode: "none" } } }],
    };
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, child.id);
    expect(tokens).not.toContain("md:absolute");
    expect(tokens).not.toContain("md:left-[30px]");
    expect(tokens).not.toContain("md:top-[60px]");
    expect(tokens).not.toContain("lg:absolute");
    expect(tokens).toContain("xl:absolute");
    expect(tokens).toContain("xl:left-[30px]");
    expect(tokens).toContain("xl:top-[60px]");
  });

  it("断点绝对化翻转：父级 md 档变 none/horizontal 时子节点的 absolute/static（§14）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const parent = createNode({
      type: "section",
      name: "FlipParent",
      layout: { mode: "horizontal", gap: 8 },
      size: { width: 400, height: 300 },
    });
    parent.parentId = root.id;
    root.children = [parent.id];
    page2.nodes[parent.id] = parent;
    const child = createNode({
      type: "section",
      name: "FlipChild",
      layout: { mode: "vertical", gap: 0 },
      position: { x: 30, y: 60 },
      size: { width: 80, height: 60 },
    });
    child.parentId = parent.id;
    parent.children = [child.id];
    page2.nodes[child.id] = child;
    page2.nodes[parent.id] = {
      ...page2.nodes[parent.id]!,
      responsive: [{ breakpoint: "tablet", patch: { layout: { mode: "none" } } }],
    };
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, child.id);
    expect(tokens).toContain("md:absolute");
    expect(tokens).toContain("md:left-[30px]");
    expect(tokens).toContain("md:top-[60px]");

    // 反向：base 是 none，md 把父级翻回 horizontal——`md:static` 顶掉窄档那条 absolute
    const page3 = starterPage("Home");
    const root3 = page3.nodes[page3.rootId]!;
    const parent3 = createNode({
      type: "section",
      name: "RevertParent",
      layout: { mode: "none", gap: 0 },
      size: { width: 400, height: 300 },
    });
    parent3.parentId = root3.id;
    root3.children = [parent3.id];
    page3.nodes[parent3.id] = parent3;
    const child3 = createNode({
      type: "section",
      name: "RevertChild",
      layout: { mode: "vertical", gap: 0 },
      position: { x: 30, y: 60 },
      size: { width: 80, height: 60 },
    });
    child3.parentId = parent3.id;
    parent3.children = [child3.id];
    page3.nodes[child3.id] = child3;
    page3.nodes[parent3.id] = {
      ...page3.nodes[parent3.id]!,
      responsive: [{ breakpoint: "tablet", patch: { layout: { mode: "horizontal" } } }],
    };
    const tokens3 = tokensOf(generatePageComponent(page3, {}, "Home").contents, child3.id);
    expect(tokens3).toContain("absolute");
    expect(tokens3).toContain("md:static");
    expect(tokens3).not.toContain("md:absolute");
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

  it("页面名没有 ASCII 字符时回落到 PageN，而不是生成一个叫 undefined 的组件", () => {
    // 中文页面名是这个产品的常态，不是边角：曾经生成出 components/nexus/undefined.tsx
    // 与 `export function undefined()`，是 §69 的代码目录把它照出来的。
    const document = createDocument("中文页名");
    const a = starterPage("结算页");
    const b = starterPage("关于");
    document.pages = [a, b];
    const generated = generateProject(document, {});
    expect(generated.map((f) => f.path)).toEqual([
      "styles/tokens.css",
      "components/nexus/Page1.tsx",
      "components/nexus/Page2.tsx",
      "components/nexus/index.ts",
    ]);
    const pageFile = generated.find((f) => f.path.endsWith("Page1.tsx"))!;
    expect(pageFile.contents).toContain("export function Page1()");
    expect(pageFile.contents).not.toContain("function undefined");
    expect(transpileDiagnostics(pageFile)).toEqual([]);
    // 文件名丢了页面名，所以归属必须由发射器标注，不能靠目录去猜
    expect(pageFile.origin).toEqual({ kind: "page", pageId: a.id, pageName: "结算页" });
  });

  it("断点裁剪/滚动发射：clip/scroll 覆盖发 overflow 类，取消更窄裁剪发 overflow-visible（§14）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({
      type: "section",
      name: "ClipScroll",
      layout: { mode: "vertical", gap: 8, clipContent: true },
      size: { width: 300, height: 200 },
    });
    node.responsive = [
      { breakpoint: "tablet", patch: { layout: { clipContent: false, scroll: "none" } } },
      { breakpoint: "desktop", patch: { layout: { scroll: "vertical" } } },
    ];
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(tokens).toContain("overflow-hidden");
    expect(tokens).toContain("md:overflow-visible");
    expect(tokens).toContain("lg:overflow-y-auto");
  });

  it("断点字重/行高发射：typography patch 发出 font-*/leading-* 类（§14）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({ type: "text", name: "TypoSlice", text: "字重行高" });
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const withRule: DesignNode = {
      ...node,
      responsive: [
        { breakpoint: "tablet", patch: { typography: { fontWeight: 600, lineHeight: 1.8 } } },
      ],
    };
    page2.nodes[node.id] = withRule;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(tokens).toContain("md:font-semibold");
    expect(tokens).toContain("md:leading-[1.8]");
  });

  it("断点字距/大小写/装饰发射：typography patch 发 tracking/uppercase/underline 类（§14）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const node = createNode({ type: "text", name: "TypoCase", text: "lc case" });
    node.parentId = root.id;
    root.children = [node.id];
    page2.nodes[node.id] = node;
    const withRule: DesignNode = {
      ...node,
      responsive: [
        {
          breakpoint: "tablet",
          patch: { typography: { letterSpacing: 2, textCase: "upper", decoration: "underline", align: "center" } },
        },
      ],
    };
    page2.nodes[node.id] = withRule;
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, node.id);
    expect(tokens).toContain("md:tracking-[2px]");
    expect(tokens).toContain("md:uppercase");
    expect(tokens).toContain("md:underline");
    expect(tokens).toContain("md:text-center");
  });

  it("断点位置发射：绝对定位父级里的位置覆盖发 md:left-*/md:top-* 类（§14）", () => {
    const page2 = starterPage("Home");
    const root = page2.nodes[page2.rootId]!;
    const parent = createNode({
      type: "section",
      name: "AbsParent",
      layout: { mode: "none", gap: 0 },
      size: { width: 400, height: 300 },
    });
    parent.parentId = root.id;
    root.children = [parent.id];
    page2.nodes[parent.id] = parent;
    const child = createNode({
      type: "section",
      name: "AbsChild",
      layout: { mode: "vertical", gap: 0 },
      size: { width: 80, height: 60 },
      position: { x: 12, y: 14 },
    });
    child.parentId = parent.id;
    parent.children = [child.id];
    page2.nodes[child.id] = child;
    page2.nodes[child.id] = {
      ...child,
      responsive: [{ breakpoint: "tablet", patch: { position: { x: 44, y: 52 } } }],
    };
    const tokens = tokensOf(generatePageComponent(page2, {}, "Home").contents, child.id);
    expect(tokens).toContain("absolute");
    expect(tokens).toContain("md:left-[44px]");
    expect(tokens).toContain("md:top-[52px]");
    expect(tokens).not.toContain("md:absolute");
  });
});
