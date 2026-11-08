import { describe, expect, it } from "vitest";
import { createNode, starterPage } from "../src/nodes";
import { generatePageComponent } from "../src/codegen";
import { NODE_STATES, STATE_VARIANT } from "../src/states";
import type { DesignNode, NodeStates } from "../src/index";

/** 造一个挂着 states 补丁的节点，拿它生成出来的那一行 className */
function nodeLineWithStates(
  states: NodeStates,
  type: DesignNode["type"] = "card",
): string {
  const node = createNode({ type, name: "N", size: { width: 100, height: 50 } });
  node.states = states;
  const page = starterPage("Home");
  const root = page.nodes[page.rootId]!;
  node.parentId = root.id;
  root.children = [node.id];
  page.nodes[node.id] = node;
  const line = generatePageComponent(page, {}, "Home").contents
    .split("\n")
    .find((l) => l.includes(node.id));
  if (!line) throw new Error("找不到节点行");
  return line;
}

const solidFills = (color: string) => [{ kind: "solid" as const, color }];

describe("§124 状态层 → 变体类（ADR-0062 part ①）", () => {
  it("hover 的 fills 发射 hover:bg-[…]，且不波及其它状态", () => {
    const line = nodeLineWithStates({ hover: { fills: solidFills("#00ff88") } });
    expect(line).toContain("hover:bg-[#00ff88]");
    expect(line).not.toContain("active:bg-");
    expect(line).not.toContain("focus:bg-");
  });

  it("没有 states 的节点不发射任何变体类（空补丁 ≠ 隐藏状态）", () => {
    const line = nodeLineWithStates({});
    for (const variant of Object.values(STATE_VARIANT)) {
      expect(line).not.toContain(variant);
    }
  });

  it("七个状态各自的前缀都从 STATE_VARIANT 那张表发射", () => {
    for (const state of NODE_STATES) {
      const line = nodeLineWithStates({ [state]: { fills: solidFills("#123456") } });
      expect(line).toContain(`${STATE_VARIANT[state]}bg-[#123456]`);
    }
  });

  it("text 节点的状态 fills 是字色（text-[…]）而不是背景", () => {
    const line = nodeLineWithStates({ hover: { fills: solidFills("#abcdef") } }, "text");
    expect(line).toContain("hover:text-[#abcdef]");
    expect(line).not.toContain("hover:bg-");
  });

  it("strokes / effects / opacity 三个通道也带变体前缀", () => {
    const line = nodeLineWithStates({
      hover: {
        strokes: [
          { paints: [{ kind: "solid", color: "#ff0000" }], width: 2, position: "inside" },
        ],
        effects: [
          { kind: "drop-shadow", offsetX: 0, offsetY: 4, blur: 8, spread: 0, color: "rgba(0,0,0,0.4)" },
        ],
        opacity: 0.5,
      },
    });
    expect(line).toContain("hover:border-[2px]");
    expect(line).toContain("hover:border-[#ff0000]");
    expect(line).toContain("hover:shadow-[0px_4px_8px_0px_rgba(0,0,0,0.4)]");
    expect(line).toContain("hover:opacity-[0.5]");
  });

  it("补丁没指定的通道不发射（只发作者真正写过的）", () => {
    const line = nodeLineWithStates({ hover: { fills: solidFills("#111111") } });
    expect(line).not.toContain("hover:border-");
    expect(line).not.toContain("hover:shadow-");
    expect(line).not.toContain("hover:opacity-");
  });

  it("状态 fills 里的 token 引用同样走 CSS 变量，不烤死值", () => {
    const line = nodeLineWithStates({ hover: { fills: solidFills("{color.primary}") } });
    expect(line).toContain("hover:bg-[var(--nx-color-primary)]");
  });

  it("显式清空的通道发射重置类：bg-none/bg-transparent、border-0、shadow-none（ADR-0062）", () => {
    const line = nodeLineWithStates({ hover: { fills: [], strokes: [], effects: [] } });
    expect(line).toContain("hover:bg-none");
    expect(line).toContain("hover:bg-transparent");
    expect(line).toContain("hover:border-0");
    expect(line).toContain("hover:border-[transparent]");
    expect(line).toContain("hover:shadow-none");
    expect(line).toContain("hover:blur-none");
    expect(line).toContain("hover:backdrop-blur-none");
  });

  it("text 节点显式清空 fills 发射 text-inherit，不是 bg-none", () => {
    const line = nodeLineWithStates({ hover: { fills: [] } }, "text");
    expect(line).toContain("hover:text-inherit");
    expect(line).not.toContain("hover:bg-none");
  });

  it("STATE_VARIANT 与 NODE_STATES 严格同键；loading/error/success 是 data-state 变体", () => {
    expect(Object.keys(STATE_VARIANT).sort()).toEqual([...NODE_STATES].sort());
    expect(STATE_VARIANT.loading).toBe("data-[state=loading]:");
    expect(STATE_VARIANT.error).toBe("data-[state=error]:");
    expect(STATE_VARIANT.success).toBe("data-[state=success]:");
  });
});
