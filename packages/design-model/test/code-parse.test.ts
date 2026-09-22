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
import type { Page } from "../src/types";

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
    const ops = result.ops.filter((op) => op.nodeId === nodeId(page, "Primary CTA"));
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
      result.ops.filter((op) => op.nodeId === cta && "path" in op && op.path === "style.cornerRadius"),
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
      result.ops.filter((op) => op.nodeId === hero && "path" in op && op.path.startsWith("layout.padding")),
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
    const op = result.ops.find((o) => o.path === "responsive");
    expect(op).toMatchObject({
      nodeId: hero,
      value: [{ breakpoint: "tablet", patch: { layout: { gap: 12, mode: "horizontal" } } }],
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
