import { describe, expect, it } from "vitest";
import { createNode, DEFAULT_TOKENS, radius, starterPage } from "../src/nodes";
import { generatePageComponent } from "../src/codegen";
import {
  changedNodeIds,
  codeToPageOps,
  parseJsx,
  summarizeCodeEdit,
  type ParseIssue,
} from "../src/code-parse";
import { RESPONSIVE_PATCH_GROUPS } from "../src/types";
import type { Page, ResponsivePatchGroup } from "../src/types";

/**
 * Code → Design（§17-19）。核心验收：`parse(generate(page))` 必须零补丁、零 unmapped——
 * 反向解析如果和生成器不一致，回写就会让画布与代码漂移（§16）。
 */

const source = (page: Page): string =>
  generatePageComponent(page, { cssVarPrefix: "nx" }, "Home").contents;

const parse = (page: Page, code = source(page)) =>
  codeToPageOps(code, page, { cssVarPrefix: "nx", tokens: DEFAULT_TOKENS });

const msgs = (issues: readonly ParseIssue[]): string =>
  issues.map((i) => `${i.line}:${i.message}`).join(" ");

const replace = (code: string, from: string, to: string): string => {
  if (!code.includes(from)) throw new Error(`源码里没有 ${from}`);
  return code.replace(from, to);
};

/** 元素在生成结果里总是独占连续若干行：从开标签到它的闭标签 */
const blockOf = (code: string, openNeedle: string): string => {
  const lines = code.split("\n");
  const start = lines.findIndex((l) => l.includes(openNeedle));
  if (start < 0) throw new Error(`源码里找不到 ${openNeedle}`);
  const tag = /<(\w+)/.exec(lines[start]!)?.[1];
  let end = start;
  while (end < lines.length && !lines[end]!.includes(`</${tag}>`)) end += 1;
  if (end >= lines.length) throw new Error(`${openNeedle} 没有闭合标签`);
  return lines.slice(start, end + 1).join("\n");
};

/** 交换两个元素块：这是"打乱顺序"的最小真实编辑 */
const swapBlocks = (code: string, n1: string, n2: string): string => {
  const a = blockOf(code, n1);
  const b = blockOf(code, n2);
  return code.replace(a, "\u0000").replace(b, a).replace("\u0000", b);
};

const nodeId = (page: Page, name: string): string => {
  const node = Object.values(page.nodes).find((n) => n.name === name);
  if (!node) throw new Error(`没有节点 ${name}`);
  return node.id;
};

/** 元素开标签那一行：className 全在那里 */
const lineOf = (code: string, needle: string): string => {
  const line = code.split("\n").find((l) => l.includes(needle));
  if (!line) throw new Error(`源码里找不到 ${needle}`);
  return line;
};

describe("受限 JSX 解析", () => {
  it("认出根元素与全部带 id 的元素，且没有解析问题", () => {
    const page = starterPage();
    const result = parseJsx(source(page));
    expect(result.issues).toEqual([]);
    expect(result.root?.tag).toBe("main");
    expect(classIds(result.root!)).toHaveLength(8);
  });

  it("越界语法如实报错，不静默产出半成品", () => {
    const broken = parseJsx("export function Home() { return (<div>{state.value}</div>); }");
    expect(broken.root?.tag).toBe("div");
    expect(msgs(broken.issues)).toContain("不是字面量");
    expect(msgs(parseJsx("没有 return 的文件").issues)).toContain("return (");
  });

  it("字面量子节点还原成模型文本，注释与空行不算内容", () => {
    const page = starterPage();
    const code = replace(
      source(page),
      "          从一句话到一个可发布的产品",
      '          {"1 < 2 && {x}"}',
    );
    const result = parse(page, code);
    const headline = Object.values(page.nodes).find((n) => n.name === "Headline")!;
    expect(result.ops.find((op) => op.op === "set" && op.nodeId === headline.id && "path" in op && op.path === "text")).toMatchObject({
      value: "1 < 2 && {x}",
    });
    // 生成器写出的说明注释不会被当成正文
    expect(parse(page).ops).toEqual([]);
  });
});

describe("类名 → 模型属性", () => {
  it("生成结果的往返：零补丁、零 unmapped（§19 的关键验收）", () => {
    const result = parse(starterPage());
    expect(result.issues).toEqual([]);
    expect(result.ops).toEqual([]);
    expect(result.mappings.flatMap((m) => m.unmapped)).toEqual([]);
  });

  it("改字号：text-[56px] → text-[40px]", () => {
    const page = starterPage();
    const code = replace(source(page), "text-[56px]", "text-[40px]");
    const result = parse(page, code);
    expect(result.ops).toEqual([
      { op: "set", nodeId: nodeId(page, "Headline"), path: "typography.fontSize", value: 40 },
    ]);
    expect(result.mappings.find((m) => m.nodeName === "Headline")?.unmapped).toEqual([]);
  });

  it("改文案与改 token 绑定：字色 var 反解成 {color.*}", () => {
    const page = starterPage();
    let code = replace(source(page), "          从一句话到一个可发布的产品", "          从一句话到一个可发布的产品！");
    code = replace(code, "text-[var(--nx-color-accent)]", "text-[#ff0000]");
    const result = parse(page, code);
    expect(result.ops).toEqual(
      expect.arrayContaining([
        { op: "set", nodeId: nodeId(page, "Headline"), path: "text", value: "从一句话到一个可发布的产品！" },
        {
          op: "set",
          nodeId: nodeId(page, "Eyebrow"),
          path: "style.fills",
          value: [{ kind: "solid", color: "#ff0000" }],
        },
      ]),
    );
  });

  it("把 token 尺寸写回模型：w-[1440px] → w-[var(--nx-space-8)] 反解为 {space.8}", () => {
    const page = starterPage();
    const code = replace(source(page), "w-[1440px]", "w-[var(--nx-space-8)]");
    const result = parse(page, code);
    expect(result.ops).toEqual([
      { op: "set", nodeId: page.rootId, path: "size.width", value: "{space.8}" },
    ]);
  });

  it("删除类名等于取消该属性：rounded-[10px] 去掉后圆角归零", () => {
    const page = starterPage();
    // 先退回字面数值：token 绑定的节点走的是另一条保护，见下一个用例
    page.nodes[nodeId(page, "Primary CTA")]!.style.cornerRadius = {
      topLeft: 10,
      topRight: 10,
      bottomRight: 10,
      bottomLeft: 10,
    };
    const code = replace(source(page), " rounded-[10px]", "");
    const result = parse(page, code);
    const ops = result.ops.filter((op) => "nodeId" in op && op.nodeId === nodeId(page, "Primary CTA"));
    expect(ops).toEqual([
      {
        op: "set",
        nodeId: nodeId(page, "Primary CTA"),
        path: "style.cornerRadius",
        value: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      },
    ]);
  });

  it("删掉 token 绑定的圆角类不会把绑定写成 0：反向同步不破坏 §12 的绑定", () => {
    const page = starterPage();
    const code = replace(source(page), " rounded-[var(--nx-radius-md)]", "");
    const result = parse(page, code);
    const cta = nodeId(page, "Primary CTA");
    expect(
      result.ops.filter(
        (op) => "nodeId" in op && "path" in op && op.nodeId === cta && op.path === "style.cornerRadius",
      ),
    ).toEqual([]);
    expect(page.nodes[cta]!.style.cornerRadius.topLeft).toBe("{radius.md}");
  });

  it("统一 padding 展开成四条边", () => {
    const page = starterPage();
    const code = replace(
      source(page),
      "pt-[var(--nx-space-16)] pr-[var(--nx-space-8)] pb-[var(--nx-space-16)] pl-[var(--nx-space-8)]",
      "p-[32px]",
    );
    const result = parse(page, code);
    const hero = nodeId(page, "Hero");
    expect(
      result.ops.filter(
        (op) => "nodeId" in op && "path" in op && op.nodeId === hero && op.path.startsWith("layout.padding"),
      ),
    ).toEqual([
      { op: "set", nodeId: hero, path: "layout.padding.top", value: 32 },
      { op: "set", nodeId: hero, path: "layout.padding.right", value: 32 },
      { op: "set", nodeId: hero, path: "layout.padding.bottom", value: 32 },
      { op: "set", nodeId: hero, path: "layout.padding.left", value: 32 },
    ]);
  });

  it("背景与字色按节点类型分流：button 改背景，text 改字色", () => {
    const page = starterPage();
    let code = replace(source(page), "bg-[var(--nx-color-primary)]", "bg-[#123456]");
    code = replace(code, "text-[var(--nx-color-on-primary)]", "text-[var(--nx-color-text)]");
    const result = parse(page, code);
    const cta = nodeId(page, "Primary CTA");
    expect(result.ops).toEqual(
      expect.arrayContaining([
        { op: "set", nodeId: cta, path: "style.fills", value: [{ kind: "solid", color: "#123456" }] },
        { op: "set", nodeId: cta, path: "typography.color", value: "{color.text}" },
      ]),
    );
  });

  it("渐变反解成 stops", () => {
    const page = starterPage();
    const code = replace(
      source(page),
      "bg-[var(--nx-color-surface)]",
      "bg-[linear-gradient(135deg,#ffffff_0%_#7c5cff_100%)]",
    );
    const result = parse(page, code);
    expect(result.ops).toEqual([
      {
        op: "set",
        nodeId: nodeId(page, "Hero"),
        path: "style.fills",
        value: [
          {
            kind: "gradient",
            type: "linear",
            angle: 135,
            stops: [
              { at: 0, color: "#ffffff" },
              { at: 1, color: "#7c5cff" },
            ],
          },
        ],
      },
    ]);
  });

  it("响应式前缀写进同一条规则的 patch", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "tablet", patch: { layout: { gap: 16 } } }],
        },
      },
    };
    const code = replace(source(withRule), "md:gap-[16px]", "md:flex-row md:gap-[12px]");
    const result = parse(withRule, code);
    const op = result.ops.find((o) => "path" in o && o.path === "responsive");
    expect(op).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "tablet", patch: { layout: { gap: 12, mode: "horizontal" } } }],
    });
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
  });

  it("断点发的排布/列数/padding/透明度往返：零补丁、零 unmapped（§14）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [
            {
              breakpoint: "tablet",
              patch: {
                layout: { mode: "grid", columns: 2, padding: { top: 24, right: 8, bottom: 24, left: 8 } },
                style: { opacity: 0.6 },
              },
            },
            {
              breakpoint: "desktop",
              patch: {
                layout: { mode: "wrap", padding: { top: "{space.12}", right: "{space.12}", bottom: "{space.12}", left: "{space.12}" } },
              },
            },
          ],
        },
      },
    };
    const code = source(withRule);
    // 发射那一侧真的发出了这些类（否则下面的"零补丁"是空对空：没发的东西当然读不回）
    const line = lineOf(code, hero);
    expect(line).toContain("md:grid");
    expect(line).toContain("md:grid-cols-[repeat(2,minmax(0,1fr))]");
    expect(line).toContain("md:pt-[24px]");
    expect(line).toContain("md:opacity-[0.6]");
    expect(line).toContain("lg:flex lg:flex-wrap");
    expect(line).toContain("lg:p-[var(--nx-space-12)]");
    const result = parse(withRule, code);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === hero)).toEqual([]);
  });

  it("断点对齐两键的往返：发得出、读得回、一个补丁都不发（§14 第六片）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [
            { breakpoint: "tablet", patch: { layout: { justify: "space-between", items: "center" } } },
            // 更宽那档翻成网格：这一档的 justify 求解器不看，代码里本来就没有它——
            // 往返仍是零补丁（读侧不该凭一条没发的类编出键来）
            { breakpoint: "desktop", patch: { layout: { mode: "grid", columns: 2, justify: "center" } } },
          ],
        },
      },
    };
    const code = source(withRule);
    const line = lineOf(code, hero);
    expect(line).toContain("md:justify-between");
    expect(line).toContain("md:items-center");
    expect(line).toContain("lg:grid");
    expect(line).not.toContain("lg:justify");
    const result = parse(withRule, code);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === hero)).toEqual([]);
  });

  it("手写 md:justify-* 落在网格那一档：如实不收，同档别的键照旧回写（§14 第六片 × §19）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "tablet", patch: { layout: { mode: "grid", columns: 2, gap: 16 } } }],
        },
      },
    };
    const code = replace(source(withRule), "md:gap-[16px]", "md:justify-center md:gap-[24px]");
    const result = parse(withRule, code);
    const mapping = result.mappings.find((m) => m.nodeId === hero)!;
    // 不收这一条**不能**把整个节点的回写作废：同档那条 gap 是真改动，照旧写回去
    expect(result.ops.find((o) => "path" in o && o.path === "responsive")).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "tablet", patch: { layout: { mode: "grid", columns: 2, gap: 24 } } }],
    });
    expect(mapping.applied).toContain("responsive");
    expect(mapping.unmapped).toEqual([
      { token: "md:justify-center", reason: expect.stringContaining("这一档解出来的排布是 grid") },
    ]);
  });

  it("手写 md:justify- / md:items- 落在自动布局那一档：读进这一档的 patch，同档第二条报冲突", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "tablet", patch: { layout: { gap: 16 } } }],
        },
      },
    };
    const code = replace(
      source(withRule),
      "md:gap-[16px]",
      "md:items-end md:justify-center md:justify-end md:gap-[16px]",
    );
    const result = parse(withRule, code);
    const mapping = result.mappings.find((m) => m.nodeId === hero)!;
    expect(result.ops.find((o) => "path" in o && o.path === "responsive")).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "tablet", patch: { layout: { gap: 16, items: "end", justify: "center" } } }],
    });
    expect(mapping.unmapped).toEqual([
      { token: "md:justify-end", reason: expect.stringContaining("只取第一条") },
    ]);
  });

  it("手写 md:flex-col-reverse 落在横排那一档：方向与反向两个键一起读进来（§14 第七片）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const heroNode = page.nodes[hero]!;
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...heroNode,
          // 设计值是横排，作者在这一档手写一条"竖着反过来"的类
          layout: { ...heroNode.layout, mode: "horizontal" },
          responsive: [{ breakpoint: "tablet", patch: { layout: { gap: 16 } } }],
        },
      },
    };
    const code = replace(source(withRule), "md:gap-[16px]", "md:flex-col-reverse md:gap-[24px]");
    const result = parse(withRule, code);
    const mapping = result.mappings.find((m) => m.nodeId === hero)!;
    // 这一档本来解出来是横排 ⇒ 那条类说的方向与它不一致，`mode` 必须一起写：
    // 只写 reverse 的话重投影发出的是 `md:flex-row-reverse`，自检认不出作者写的那条，
    // 整个节点的回写作废（§19）——作者那次编辑在代码里看着成功了，画布没动。
    expect(result.ops.find((o) => "path" in o && o.path === "responsive")).toMatchObject({
      nodeId: hero,
      value: [
        { breakpoint: "tablet", patch: { layout: { gap: 24, mode: "vertical", reverse: true } } },
      ],
    });
    expect(mapping.unmapped, "反向类不该在读侧被当成没映射的键").toEqual([]);
    expect(mapping.applied).toContain("responsive");
  });

  it("手写 md:flex-col-reverse 落在本来就是竖排的那一档：只补 reverse，不凭空写 mode（§14 第七片）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "tablet", patch: { layout: { gap: 16 } } }],
        },
      },
    };
    const code = replace(source(withRule), "md:gap-[16px]", "md:flex-col-reverse md:gap-[24px]");
    const result = parse(withRule, code);
    // 基线就是竖排，重投影照发 `md:flex-col-reverse` ⇒ mode 是多余的键，别写进模型（§16）
    expect(result.ops.find((o) => "path" in o && o.path === "responsive")).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "tablet", patch: { layout: { gap: 24, reverse: true } } }],
    });
  });

  it("反向那一档的往返：md:flex-col-reverse 发得出也读得回，一个补丁都不发（§14 第七片）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [
            { breakpoint: "tablet", patch: { layout: { reverse: true } } },
            // 更宽那档翻成网格：求解器不看 reverse，代码里本来就没有它——
            // 往返仍是零补丁（读侧不该凭一条没发的类编出键来）
            { breakpoint: "desktop", patch: { layout: { mode: "grid", columns: 2, reverse: true } } },
          ],
        },
      },
    };
    const code = source(withRule);
    const line = lineOf(code, hero);
    expect(line).toContain("md:flex-col-reverse");
    expect(line).not.toContain("lg:flex");
    const result = parse(withRule, code);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === hero)).toEqual([]);
  });

  /** 设计值本身就是反向的：第八片那一寸的载体（更窄那档反向、更宽那档要取消） */
  const reversedHero = (page: Page): Page => {
    const hero = nodeId(page, "Hero");
    return {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          layout: { ...page.nodes[hero]!.layout, reverse: true },
        },
      },
    };
  };

  it("这一档取消更窄那档的反向：重发正向方向类，发得出也读得回，一个补丁都不发（§14 第八片）", () => {
    const page = reversedHero(starterPage());
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: { ...page.nodes[hero]!, responsive: [{ breakpoint: "tablet", patch: { layout: { reverse: false } } }] },
      },
    };
    const code = source(withRule);
    const line = lineOf(code, hero);
    // 基线那条反向类留着（<48rem 它还得赢），取消靠的是排在它后面的那条 md:flex-col
    expect(line).toContain("flex-col-reverse");
    expect(line).toContain("md:flex-col");
    const result = parse(withRule, code);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === hero)).toEqual([]);
  });

  it("更宽那档取消 md 的反向：lg 那一条重发正向方向类，往返零补丁（§14 第八片）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [
            { breakpoint: "tablet", patch: { layout: { reverse: true } } },
            { breakpoint: "desktop", patch: { layout: { reverse: false } } },
          ],
        },
      },
    };
    const code = source(withRule);
    const line = lineOf(code, hero);
    expect(line).toContain("md:flex-col-reverse");
    expect(line).toContain("lg:flex-col");
    const result = parse(withRule, code);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === hero)).toEqual([]);
  });

  it("手写 md:flex-col 落在本来反向的那一档：只补 reverse:false，不凭空写 mode（§14 第八片）", () => {
    const page = reversedHero(starterPage());
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: { ...page.nodes[hero]!, responsive: [{ breakpoint: "tablet", patch: { layout: { gap: 16 } } }] },
      },
    };
    // 这条类说的排布就是这一档本来的排布（竖排），它真正新说的只有「这一档不反向」。
    // 用 toEqual 而不是 toMatchObject：这一条说的就是"只补 reverse，不凭空写 mode"，
    // toMatchObject 认不出多出来的 `mode` 键，那句标题就没人管（臂 H8 实测把它放过去了）。
    const code = replace(source(withRule), "md:gap-[16px]", "md:flex-col md:gap-[24px]");
    const result = parse(withRule, code);
    const responsiveOp = result.ops.find((o) => "path" in o && o.path === "responsive");
    expect(responsiveOp && "value" in responsiveOp ? responsiveOp.value : undefined).toEqual([
      { breakpoint: "tablet", patch: { layout: { gap: 24, reverse: false } } },
    ]);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
  });

  it("这一档声明的 reverse:false 没顶掉任何东西：什么都不发，往返也零补丁（§14 第八片）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: { ...page.nodes[hero]!, responsive: [{ breakpoint: "tablet", patch: { layout: { reverse: false } } }] },
      },
    };
    const line = lineOf(source(withRule), hero);
    // 没反向可取消时这条键不改任何东西：发一条读者不会认的类，等于代码里有个模型不认的表态（§16）
    expect(line).not.toContain("md:flex-col");
    expect(line).not.toContain("md:flex-row");
    const result = parse(withRule);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === hero)).toEqual([]);
  });

  it("同一档既改排布又取消反向：md:flex-col 只发一条，读回来 mode 与 reverse 都在（§14 第八片）", () => {
    const page = reversedHero(starterPage());
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "tablet", patch: { layout: { mode: "vertical", reverse: false } } }],
        },
      },
    };
    const code = source(withRule);
    const line = lineOf(code, hero);
    // 排布那一条已经发过 md:flex-col 了，取消反向那一支不能再发第二遍
    expect(line.match(/md:flex-col(?!-)/g)).toHaveLength(1);
    const result = parse(withRule, code);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === hero)).toEqual([]);
    // 「读回来 mode 与 reverse 都在」不能只靠"一个补丁都不发"来评：读者干脆不认领这条类时
    // 也是零补丁（臂 H7 实测把往返那几条全放过去了）。把模型这一档的 reverse 键抽掉再读同一份
    // 代码，认领与不认领就差在这一条补丁上——这一寸才是"读得回来"本身。
    const withoutKey: Page = {
      ...withRule,
      nodes: {
        ...withRule.nodes,
        [hero]: {
          ...withRule.nodes[hero]!,
          responsive: [{ breakpoint: "tablet", patch: { layout: { mode: "vertical" } } }],
        },
      },
    };
    const reread = parse(withoutKey, code);
    const rereadResponsiveOp = reread.ops.find((o) => "path" in o && o.path === "responsive");
    expect(rereadResponsiveOp && "value" in rereadResponsiveOp ? rereadResponsiveOp.value : undefined).toEqual([
      { breakpoint: "tablet", patch: { layout: { mode: "vertical", reverse: false } } },
    ]);
    expect(reread.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
  });

  it("断点裁剪/滚动往返：overflow 类发得出也读得回，取消更窄裁剪用 overflow-visible（§14）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const clipped: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          layout: { ...page.nodes[hero]!.layout, clipContent: true },
          responsive: [
            { breakpoint: "tablet", patch: { layout: { clipContent: false, scroll: "none" } } },
            { breakpoint: "desktop", patch: { layout: { scroll: "vertical" } } },
          ],
        },
      },
    };
    const code = source(clipped);
    const line = lineOf(code, hero);
    expect(line).toContain("overflow-hidden");
    expect(line).toContain("md:overflow-visible");
    expect(line).toContain("lg:overflow-y-auto");
    const result = parse(clipped, code);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === hero)).toEqual([]);
  });

  it("断点字重/行高往返：发射与回写共用 font-*/leading-* 处方，往返零补丁（§14）", () => {
    const page = starterPage();
    const headline = nodeId(page, "Headline");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [headline]: {
          ...page.nodes[headline]!,
          responsive: [
            { breakpoint: "tablet", patch: { typography: { fontWeight: 600, lineHeight: 1.8 } } },
          ],
        },
      },
    };
    const code = source(withRule);
    const line = lineOf(code, headline);
    expect(line).toContain("md:font-semibold");
    expect(line).toContain("md:leading-[1.8]");
    const result = parse(withRule, code);
    expect(result.mappings.find((m) => m.nodeId === headline)?.unmapped).toEqual([]);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === headline)).toEqual([]);
  });

  it("断点字距/大小写/装饰往返：发射与回写共用 tracking/uppercase/underline 处方，零补丁（§14）", () => {
    const page = starterPage();
    const headline = nodeId(page, "Headline");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [headline]: {
          ...page.nodes[headline]!,
          responsive: [
            {
              breakpoint: "tablet",
              patch: { typography: { letterSpacing: 2, textCase: "upper", decoration: "underline", align: "center" } },
            },
          ],
        },
      },
    };
    const code = source(withRule);
    const line = lineOf(code, headline);
    expect(line).toContain("md:tracking-[2px]");
    expect(line).toContain("md:uppercase");
    expect(line).toContain("md:underline");
    expect(line).toContain("md:text-center");
    const result = parse(withRule, code);
    expect(result.mappings.find((m) => m.nodeId === headline)?.unmapped).toEqual([]);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === headline)).toEqual([]);
  });
  it("断点绝对定位往返：父级自由定位时 md:left/top 发得出也读得回，零补丁（§14）", () => {
    const page = starterPage();
    const root = nodeId(page, "Home");
    // 父级自己写出 free 定位逃生口（mode=none），子节点的位置覆盖才能在 md 档生效
    const parent = createNode({
      type: "section",
      name: "AbsParent",
      layout: { mode: "none", gap: 0 },
      size: { width: 400, height: 300 },
    });
    parent.parentId = root;
    const rootNode = page.nodes[root]!;
    rootNode.children = [parent.id];
    page.nodes[parent.id] = parent;
    const child = createNode({
      type: "section",
      name: "AbsChild",
      layout: { mode: "vertical", gap: 0 },
      size: { width: 80, height: 60 },
      position: { x: 12, y: 14 },
    });
    parent.children = [child.id];
    child.parentId = parent.id;
    page.nodes[child.id] = {
      ...child,
      responsive: [{ breakpoint: "tablet", patch: { position: { x: 44, y: 52 } } }],
    };
    const code = source(page);
    const line = lineOf(code, child.id);
    expect(line).toContain("md:left-[44px]");
    expect(line).toContain("md:top-[52px]");
    const result = parse(page, code);
    expect(result.mappings.find((m) => m.nodeId === child.id)?.unmapped).toEqual([]);
    expect(result.ops.filter((o) => "nodeId" in o && o.nodeId === child.id)).toEqual([]);
  });

  it("手机那一档的覆盖往返：发在基线上、读得回来、一个补丁都不发（§14 第五片）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [
            {
              breakpoint: "mobile",
              patch: {
                layout: { mode: "horizontal", gap: 8 },
                size: { width: 280 },
                style: { opacity: 0.5 },
              },
            },
            { breakpoint: "tablet", patch: { layout: { mode: "vertical" } } },
          ],
        },
      },
    };
    const code = source(withRule);
    const line = lineOf(code, hero);
    // 手机那四条在**没有前缀**的位置上：窄档的覆盖向上一直有效，与 CSS 级联同一条序
    expect(line).toContain("flex flex-row");
    expect(line).toContain("gap-[8px]");
    expect(line).toContain("w-[280px]");
    expect(line).toContain("opacity-[0.5]");
    expect(line).toContain("md:flex md:flex-col");
    const result = parse(withRule, code);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
    expect(result.ops).toEqual([]);
  });

  it("从代码改一条基线类：值落进手机那条规则，不写设计值（§14 第五片）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "mobile", patch: { layout: { mode: "horizontal" } } }],
        },
      },
    };
    const original = source(withRule);
    const line = lineOf(original, hero);
    expect(line).toContain("flex flex-row");
    const edited = original.replace(line, line.replace(" flex-row", " flex-col"));
    const result = parse(withRule, edited);
    const op = result.ops.find((o) => "path" in o && o.path === "responsive");
    expect(op).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "mobile", patch: { layout: { mode: "vertical" } } }],
    });
    // 设计值那一寸没被碰。写进去的话那条规则照样盖着它，重投影自检会放弃整个节点——
    // 界面上一句"已回写"，模型里什么都没变（§19 说的是同一件事）。
    expect(result.ops.some((o) => "path" in o && o.path === "layout.mode")).toBe(false);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
  });

  it("手机那条规则没声明的键照旧写设计值——归属分流只认声明过的那几个", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "mobile", patch: { layout: { gap: 8 } } }],
        },
      },
    };
    const original = source(withRule);
    const line = lineOf(original, hero);
    expect(line).toContain("gap-[8px]");
    const edited = original.replace(line, line.replace(" justify-start", " justify-center"));
    const result = parse(withRule, edited);
    const paths = result.ops.filter((o) => "path" in o).map((o) => o.path);
    expect(paths).toContain("layout.justify");
    expect(paths).not.toContain("responsive");
  });

  it("手机那条规则声明了对齐键：改基线那一条落进那条规则，不写设计值（§14 第六片 × 第五片）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "mobile", patch: { layout: { justify: "center" } } }],
        },
      },
    };
    const original = source(withRule);
    const line = lineOf(original, hero);
    // 这一档没改排布，Hero 的竖排基线照旧发对齐两键，只是值来自那条规则
    expect(line).toContain("justify-center");
    const edited = original.replace(line, line.replace(" justify-center", " justify-between"));
    const result = parse(withRule, edited);
    expect(result.ops.find((o) => "path" in o && o.path === "responsive")).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "mobile", patch: { layout: { justify: "space-between" } } }],
    });
    expect(result.ops.some((o) => "path" in o && o.path === "layout.justify")).toBe(false);
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
  });

  it("手机那一档藏起来的东西：基线上的 hidden 改回来落进那条规则", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "mobile", patch: { visible: false } }],
        },
      },
    };
    const original = source(withRule);
    const line = lineOf(original, hero);
    expect(line).toContain("hidden");
    expect(parse(withRule, original).ops).toEqual([]);
    const edited = original.replace(line, line.replace(" hidden", ""));
    const op = parse(withRule, edited).ops.find((o) => "path" in o && o.path === "responsive");
    expect(op).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "mobile", patch: { visible: true } }],
    });
  });

  it("父级手机那一档改了排布，孩子的尺寸类按解出来的父级读（§14 第五片）", () => {
    const page = starterPage();
    const root = page.nodes[page.rootId]!;
    const hero = nodeId(page, "Hero");
    // 根节点设计值是竖排，Hero 的 `width: fill` 在竖排里是交叉轴（self-stretch）；
    // 手机那一档把根节点改成横排，同一条 fill 变成主轴（flex-1）。
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [page.rootId]: {
          ...root,
          responsive: [{ breakpoint: "mobile", patch: { layout: { mode: "horizontal" } } }],
        },
      },
    };
    const code = source(withRule);
    expect(lineOf(code, hero)).toContain("flex-1");
    const result = parse(withRule, code);
    // 按设计值那份父级读会把 flex-1 解释成 height: fill——重投影对不上，整节点的回写被放弃
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
    expect(result.ops).toEqual([]);
  });

  it("手机那一档的位置覆盖也按归属分流：分组名单少一组的话这次编辑静默丢掉", () => {
    const page = starterPage();
    const root = page.nodes[page.rootId]!;
    const hero = nodeId(page, "Hero");
    // 根节点手机那一档换成 stack，Hero 才谈得上自由定位；Hero 自己的位置覆盖也在 mobile 那一档。
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [page.rootId]: {
          ...root,
          responsive: [{ breakpoint: "mobile", patch: { layout: { mode: "stack" } } }],
        },
        [hero]: {
          ...page.nodes[hero]!,
          position: { x: 10, y: 10 },
          responsive: [{ breakpoint: "mobile", patch: { position: { x: 60, y: 30 } } }],
        },
      },
    };
    const original = source(withRule);
    const line = lineOf(original, hero);
    // 基线发的是解出来的那份位置，不是设计值那份
    expect(line).toContain("left-[60px] top-[30px]");
    expect(parse(withRule, original).ops).toEqual([]);

    const edited = original.replace(line, line.replace("left-[60px]", "left-[72px]"));
    const result = parse(withRule, edited);
    expect(result.ops.find((o) => "path" in o && o.path === "position.x")).toBeUndefined();
    expect(result.ops.find((o) => "path" in o && o.path === "responsive")).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "mobile", patch: { position: { x: 72, y: 30 } } }],
    });
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
  });

  it("分组白名单与 `ResponsiveRule.patch` 同源——模型里多一组而表没跟上的话这里编译不过", () => {
    const EVERY_GROUP: Record<ResponsivePatchGroup, true> = {
      layout: true,
      size: true,
      position: true,
      style: true,
      typography: true,
    };
    expect([...RESPONSIVE_PATCH_GROUPS].sort()).toEqual(Object.keys(EVERY_GROUP).sort());
  });

  it("代码视图改一条边：另外三条边留在模型里（padding 按边回写）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [
            { breakpoint: "tablet", patch: { layout: { padding: { top: 24, right: 8, bottom: 24, left: 8 } } } },
          ],
        },
      },
    };
    const code = replace(source(withRule), "md:pt-[24px]", "md:pt-[40px]");
    const result = parse(withRule, code);
    const op = result.ops.find((o) => "path" in o && o.path === "responsive");
    expect(op).toMatchObject({
      nodeId: hero,
      value: [
        { breakpoint: "tablet", patch: { layout: { padding: { top: 40, right: 8, bottom: 24, left: 8 } } } },
      ],
    });
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
  });

  it("手写的 md:grid 读回排布，光一个 md:flex 不表态（三种排布都发它）", () => {
    const page = starterPage();
    const hero = nodeId(page, "Hero");
    const withRule: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [hero]: {
          ...page.nodes[hero]!,
          responsive: [{ breakpoint: "tablet", patch: { layout: { gap: 16 } } }],
        },
      },
    };
    const code = replace(source(withRule), "md:gap-[16px]", "md:flex md:grid md:gap-[16px]");
    const result = parse(withRule, code);
    const op = result.ops.find((o) => "path" in o && o.path === "responsive");
    // `grid` 是唯一属于网格的那条 display 类，所以它说话算数；`flex` 跟着被消费掉但不改排布
    expect(op).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "tablet", patch: { layout: { gap: 16, mode: "grid" } } }],
    });
    expect(result.mappings.find((m) => m.nodeId === hero)?.unmapped).toEqual([]);
  });

  it("模型经序列化后键顺序不同：不算改动，不产生假回写", () => {
    const page = starterPage();
    const id = nodeId(page, "Secondary CTA");
    const reordered: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [id]: {
          ...page.nodes[id]!,
          style: {
            ...page.nodes[id]!.style,
            // 服务端 schema 按定义顺序回键，与构造时的字面量顺序相反
            strokes: [
              { position: "inside", width: 1, paints: [{ color: "{color.border}", kind: "solid" }] },
            ],
            cornerRadius: { bottomLeft: 10, bottomRight: 10, topRight: 10, topLeft: 10 },
          },
        },
      },
    };
    expect(parse(reordered).ops).toEqual([]);
  });

  it("隐藏与显示：hidden 类映射到 visible", () => {
    const page = starterPage();
    const code = replace(source(page), 'w-fit font-[family-name:var(--nx-font-mono)]', 'hidden w-fit font-[family-name:var(--nx-font-mono)]');
    const result = parse(page, code);
    expect(result.ops).toEqual([
      { op: "set", nodeId: nodeId(page, "Eyebrow"), path: "visible", value: false },
    ]);
  });
});

describe("无法映射的片段如实保留（§19）", () => {
  it("删除元素属于结构性变更：不回写 remove，只报告", () => {
    const page = starterPage();
    const code = replace(source(page), blockOf(source(page), "nx-font-mono"), "");
    const result = parse(page, code);
    expect(result.ops.filter((op) => op.op === "remove")).toEqual([]);
    expect(msgs(result.issues)).toMatch(/缺少/);
  });

  it("新增元素没有 data-nexus-id：保留为 code-only，不建节点", () => {
    const page = starterPage();
    const code = replace(source(page), "<section", '<aside className="w-fit" />\n      <section');
    const result = parse(page, code);
    expect(result.ops.filter((op) => op.op === "insert")).toEqual([]);
    expect(msgs(result.issues)).toContain("code-only");
  });

  it("打乱子节点顺序只报告，不重排", () => {
    const page = starterPage();
    const swapped = swapBlocks(source(page), "nx-font-mono", "text-[56px]");
    const result = parse(page, swapped);
    expect(result.ops.filter((op) => op.op === "reorder" || op.op === "reparent")).toEqual([]);
    expect(msgs(result.issues)).toContain("顺序");
  });

  it("白名单外的类名逐条给出原因", () => {
    const page = starterPage();
    const code = replace(source(page), "text-[56px]", "text-3xl");
    const result = parse(page, code);
    const reasons = result.mappings.flatMap((m) => m.unmapped.map((u) => u.reason));
    expect(reasons.join(" ")).toContain("白名单");
    expect(result.ops).toEqual([]);
  });

  it("text 节点写背景会被拒：字色才是它的语义", () => {
    const page = starterPage();
    const code = replace(source(page), "w-fit font-[family-name", "w-fit bg-[#ff0000] font-[family-name");
    const result = parse(page, code);
    const eyebrow = result.mappings.find((m) => m.nodeName === "Eyebrow")!;
    expect(eyebrow.unmapped.map((u) => u.reason).join(" ")).toContain("字色");
    expect(eyebrow.applied).toEqual([]);
  });

  it("锁定节点不回写", () => {
    const page = starterPage();
    const id = nodeId(page, "Headline");
    const locked: Page = { ...page, nodes: { ...page.nodes, [id]: { ...page.nodes[id]!, locked: true } } };
    const result = parse(locked, replace(source(locked), "text-[56px]", "text-[40px]"));
    expect(result.ops).toEqual([]);
    expect(result.mappings.find((m) => m.nodeId === id)?.unmapped[0]?.reason).toContain("锁定");
  });

  it("识别不了的写法不会半个模型：重投影自检放弃该节点", () => {
    const page = starterPage();
    // 自动布局父级下的子元素写 w-full 不是生成器会产出的形态 → 自检必须拦下来
    const code = replace(source(page), "self-stretch font-[family-name", "w-full font-[family-name");
    const result = parse(page, code);
    const headline = result.mappings.find((m) => m.nodeName === "Headline")!;
    expect(headline.applied).toEqual([]);
    expect(headline.unmapped.map((u) => u.reason).join(" ")).toContain("重新生成");
  });

  it("code-only 区域按字面保留，改内容只改 content", () => {
    const page = starterPage();
    const root = page.nodes[page.rootId]!;
    const codeNode = createNode({
      type: "code",
      name: "Custom",
      parentId: root.id,
      size: { width: "fill", height: "hug" },
    });
    // CreateNodeInput 不接受 code：它是模型侧的容器字段，只能建好节点再填
    codeNode.code = { language: "tsx", content: "<Widget />", readOnly: false };
    const withCode: Page = {
      ...page,
      nodes: { ...page.nodes, [codeNode.id]: codeNode },
    };
    withCode.nodes[root.id] = { ...root, children: [...root.children, codeNode.id] };
    const generated = source(withCode);
    expect(generated).toContain("code-only 区域");
    expect(parse(withCode, generated).ops).toEqual([]);
    const edited = replace(generated, '{"<Widget />"}', '{"<Widget tint=\\"blue\\" />"}');
    const result = parse(withCode, edited);
    expect(result.ops).toEqual([
      { op: "set", nodeId: codeNode.id, path: "code.content", value: '<Widget tint="blue" />' },
    ]);
  });

  it("changedNodeIds 只标出真正改过的节点，供 UI 过滤噪音", () => {
    const page = starterPage();
    const before = source(page);
    const after = replace(before, "text-[56px]", "text-[40px]");
    expect(changedNodeIds(before, after)).toEqual(new Set([nodeId(page, "Headline")]));
    expect(summarizeCodeEdit(parse(page, after)).changed).toEqual([
      { nodeName: "Headline", line: expect.any(Number), paths: ["typography.fontSize"] },
    ]);
  });

  it("radius 助手生成的多角圆角可反解为逐角类名", () => {
    const page = starterPage();
    const id = nodeId(page, "Primary CTA");
    const shaped: Page = {
      ...page,
      nodes: {
        ...page.nodes,
        [id]: { ...page.nodes[id]!, style: { ...page.nodes[id]!.style, cornerRadius: radius(0) } },
      },
    };
    const code = replace(
      source(shaped),
      'className="h-fit flex flex-row',
      'className="h-fit rounded-tl-[12px] rounded-br-[4px] flex flex-row',
    );
    const result = parse(shaped, code);
    expect(result.ops).toEqual([
      {
        op: "set",
        nodeId: id,
        path: "style.cornerRadius",
        value: { topLeft: 12, topRight: 0, bottomRight: 4, bottomLeft: 0 },
      },
    ]);
  });
});

function classIds(el: NonNullable<ReturnType<typeof parseJsx>["root"]>): string[] {
  const out: string[] = [];
  const walk = (node: typeof el): void => {
    const id = node.attrs["data-nexus-id"];
    if (id) out.push(id);
    node.children.forEach(walk);
  };
  walk(el);
  return out;
}
