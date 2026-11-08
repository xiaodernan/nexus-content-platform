import { describe, expect, it } from "vitest";
import { DEFAULT_TOKENS, starterPage } from "../src/nodes";
import { generatePageComponent } from "../src/codegen";
import { codeToPageOps } from "../src/code-parse";
import type { Page } from "../src/types";

/**
 * Code → Design 的状态层往返（ADR-0062 part ②）。
 * 核心验收：带 states 的模型 parse(generate(page)) 仍零补丁、零 unmapped（§19）；
 * 状态类只认 fills/strokes/effects/opacity 四通道，越界的一律如实 unmapped。
 */

const source = (page: Page): string =>
  generatePageComponent(page, { cssVarPrefix: "nx" }, "Home").contents;

const parse = (page: Page, code = source(page)) =>
  codeToPageOps(code, page, { cssVarPrefix: "nx", tokens: DEFAULT_TOKENS });

const nodeId = (page: Page, name: string): string => {
  const node = Object.values(page.nodes).find((n) => n.name === name);
  if (!node) throw new Error(`没有节点 ${name}`);
  return node.id;
};

/** 往某个节点生成出来的 className 里插入一个类（最小真实编辑） */
const injectClass = (code: string, id: string, cls: string): string => {
  const lines = code.split("\n");
  const at = lines.findIndex((l) => l.includes(`data-nexus-id="${id}"`));
  if (at < 0) throw new Error(`找不到节点 ${id} 的元素行`);
  lines[at] = lines[at]!.replace('className="', `className="${cls} `);
  return lines.join("\n");
};

const statesOp = (page: Page, code: string) =>
  parse(page, code).ops.find(
    (op) => op.op === "set" && "path" in op && op.path === "states",
  );

describe("状态类 → states 补丁（ADR-0062 part ②）", () => {
  it("带 states 的模型往返：零补丁、零 unmapped（§19 扩展到状态层）", () => {
    const page = starterPage();
    const hero = page.nodes[nodeId(page, "Hero")]!;
    hero.states = {
      hover: { fills: [{ kind: "solid", color: "#123456" }], opacity: 0.8 },
      focus: {
        strokes: [{ paints: [{ kind: "solid", color: "#ff0000" }], width: 2, position: "inside" }],
      },
    };
    const result = parse(page);
    expect(result.ops).toEqual([]);
    expect(result.mappings.flatMap((m) => m.unmapped)).toEqual([]);
  });

  it("hover:bg-[…] → states.hover.fills（新增状态补丁）", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    const code = injectClass(source(page), id, "hover:bg-[#123456]");
    expect(statesOp(page, code)).toMatchObject({
      op: "set",
      nodeId: id,
      path: "states",
      value: { hover: { fills: [{ kind: "solid", color: "#123456" }] } },
    });
    expect(parse(page, code).mappings.find((m) => m.nodeId === id)?.unmapped).toEqual([]);
  });

  it("text 节点的 hover:text-[…] 是字色 fills，不是背景", () => {
    const page = starterPage();
    const id = nodeId(page, "Headline");
    const code = injectClass(source(page), id, "hover:text-[#abcdef]");
    expect(statesOp(page, code)).toMatchObject({
      value: { hover: { fills: [{ kind: "solid", color: "#abcdef" }] } },
    });
  });

  it("hover:border-[2px] + hover:border-[#ff0000] → states.hover.strokes", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    let code = injectClass(source(page), id, "hover:border-[2px]");
    code = injectClass(code, id, "hover:border-[#ff0000]");
    expect(statesOp(page, code)).toMatchObject({
      value: {
        hover: {
          strokes: [
            { paints: [{ kind: "solid", color: "#ff0000" }], width: 2, position: "inside" },
          ],
        },
      },
    });
  });

  it("hover:shadow-[…] → states.hover.effects", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    const code = injectClass(source(page), id, "hover:shadow-[0px_4px_8px_0px_rgba(0,0,0,0.4)]");
    expect(statesOp(page, code)).toMatchObject({
      value: {
        hover: {
          effects: [
            { kind: "drop-shadow", offsetX: 0, offsetY: 4, blur: 8, spread: 0, color: "rgba(0,0,0,0.4)" },
          ],
        },
      },
    });
  });

  it("data-[state=loading]:opacity-[0.5] → states.loading.opacity", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    const code = injectClass(source(page), id, "data-[state=loading]:opacity-[0.5]");
    expect(statesOp(page, code)).toMatchObject({
      value: { loading: { opacity: 0.5 } },
    });
  });

  it("hover:bg-[var(--nx-color-primary)] → token 引用反解成 {color.primary}", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    const code = injectClass(source(page), id, "hover:bg-[var(--nx-color-primary)]");
    expect(statesOp(page, code)).toMatchObject({
      value: { hover: { fills: [{ kind: "solid", color: "{color.primary}" }] } },
    });
  });

  it("整通道替换：hover 只剩 opacity 类时，fills 通道整个删掉", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    const hero = page.nodes[id]!;
    hero.states = { hover: { fills: [{ kind: "solid", color: "#111111" }] } };
    const code = injectClass(source(page), id, "hover:opacity-[0.5]").replace(
      " hover:bg-[#111111]",
      "",
    );
    // toEqual 而不是 toMatchObject：整通道替换的验收就是"旧 fills 不许残留"
    expect(statesOp(page, code)).toEqual({
      op: "set",
      nodeId: id,
      path: "states",
      value: { hover: { opacity: 0.5 } },
    });
  });

  it("hover:bg-none + hover:bg-transparent → fills: []（显式重置）", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    let code = injectClass(source(page), id, "hover:bg-none");
    code = injectClass(code, id, "hover:bg-transparent");
    expect(statesOp(page, code)).toEqual({
      op: "set",
      nodeId: id,
      path: "states",
      value: { hover: { fills: [] } },
    });
  });

  it("hover:border-0 + hover:border-[transparent] → strokes: []", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    let code = injectClass(source(page), id, "hover:border-0");
    code = injectClass(code, id, "hover:border-[transparent]");
    expect(statesOp(page, code)).toEqual({
      op: "set",
      nodeId: id,
      path: "states",
      value: { hover: { strokes: [] } },
    });
  });

  it("hover:shadow-none → effects: []", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    const code = injectClass(source(page), id, "hover:shadow-none");
    expect(statesOp(page, code)).toMatchObject({
      value: { hover: { effects: [] } },
    });
  });

  it("text 节点 hover:text-inherit → fills: []", () => {
    const page = starterPage();
    const id = nodeId(page, "Headline");
    const code = injectClass(source(page), id, "hover:text-inherit");
    expect(statesOp(page, code)).toMatchObject({
      value: { hover: { fills: [] } },
    });
  });

  it("重置与取值同时出现：重置优先，取值类如实 unmapped", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    let code = injectClass(source(page), id, "hover:bg-none");
    code = injectClass(code, id, "hover:bg-[#ffffff]");
    const result = parse(page, code);
    const mapping = result.mappings.find((m) => m.nodeId === id)!;
    expect(mapping.unmapped.map((u) => u.token)).toContain("hover:bg-[#ffffff]");
    expect(statesOp(page, code)).toMatchObject({ value: { hover: { fills: [] } } });
  });

  it("显式重置的模型往返：零补丁、零 unmapped（§19 扩展到重置通道）", () => {
    const page = starterPage();
    const hero = page.nodes[nodeId(page, "Hero")]!;
    hero.states = { hover: { fills: [], strokes: [], effects: [] } };
    const result = parse(page);
    expect(result.ops).toEqual([]);
    expect(result.mappings.flatMap((m) => m.unmapped)).toEqual([]);
  });

  it("hover:rounded-[8px] 不在四通道里：如实 unmapped，且不回写任何 states", () => {
    const page = starterPage();
    const id = nodeId(page, "Hero");
    const code = injectClass(source(page), id, "hover:rounded-[8px]");
    const result = parse(page, code);
    const mapping = result.mappings.find((m) => m.nodeId === id)!;
    expect(mapping.unmapped.map((u) => u.token)).toContain("hover:rounded-[8px]");
    expect(result.ops.filter((op) => "nodeId" in op && op.nodeId === id)).toEqual([]);
  });
});
