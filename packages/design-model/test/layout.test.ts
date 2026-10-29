import { describe, expect, it } from "vitest";
import { createDocument, createNode, createPage, uid } from "../src/nodes";
import {
  breakpointForWidth,
  heuristicMeasure,
  hitTest,
  resolveLayout,
} from "../src/layout";
import type { DesignNode, Page } from "../src/types";
import { radius } from "../src/nodes";
import { TokenStore } from "../src/tokens";

function pageWith(
  rootOverrides: Partial<DesignNode>,
  children: DesignNode[],
): Page {
  const page = createPage("Test", 1000, 1000);
  const root = page.nodes[page.rootId]!;
  Object.assign(root, rootOverrides);
  root.children = [];
  children.forEach((child, index) => {
    child.parentId = root.id;
    child.position = {
      x: child.position.x ?? 0,
      y: index === 0 && child.position.y === undefined ? 0 : child.position.y,
    };
    page.nodes[child.id] = child;
    root.children.push(child.id);
  });
  return page;
}

function fixedShape(
  name: string,
  width: number | "fill" | "hug",
  height: number | "fill" | "hug",
): DesignNode {
  const node = createNode({ type: "shape", name, size: { width, height } });
  node.size = { width, height };
  return node;
}

const verticalFrame = (
  children: DesignNode[],
  opts: Partial<DesignNode> = {},
): Page =>
  pageWith(
    {
      size: { width: 400, height: 200 },
      layout: {
        mode: "vertical",
        gap: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        justify: "start",
        items: "start",
        clipContent: false,
        scroll: "none",
      },
      ...opts,
    },
    children,
  );

describe("resolveLayout — vertical auto layout", () => {
  const childA = fixedShape("A", 100, 50);
  const childB = fixedShape("B", 100, 50);
  const childC = fixedShape("C", 100, 50);
  const page = pageWith(
    {
      size: { width: 400, height: "hug" },
      layout: {
        mode: "vertical",
        gap: 10,
        padding: { top: 20, right: 20, bottom: 20, left: 20 },
        justify: "start",
        items: "start",
        clipContent: false,
        scroll: "none",
      },
    },
    [childA, childB, childC],
  );
  const layout = resolveLayout(page);

  it("hugs content height including padding and gaps", () => {
    // 3*50 + 2*10 + 2*20
    expect(layout.height).toBe(210);
    expect(layout.width).toBe(400);
  });

  it("stacks children on the main axis with gaps", () => {
    expect(layout.nodes[childA.id]!.y).toBe(20);
    expect(layout.nodes[childB.id]!.y).toBe(80);
    expect(layout.nodes[childC.id]!.y).toBe(140);
    expect(layout.nodes[childA.id]!.x).toBe(20);
  });

  it("records parent-child links in resolved order", () => {
    expect(layout.nodes[childA.id]!.parentId).toBe(page.rootId);
    expect(layout.nodes[page.rootId]!.children).toEqual([
      childA.id,
      childB.id,
      childC.id,
    ]);
  });
});

describe("resolveLayout — distribution", () => {
  it("splits remaining main space among fill children", () => {
    const left = fixedShape("left", "fill", "fill");
    const right = fixedShape("right", "fill", "fill");
    const page = pageWith(
      {
        size: { width: 400, height: 100 },
        layout: {
          mode: "horizontal",
          gap: 10,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          justify: "start",
          items: "start",
          clipContent: false,
          scroll: "none",
        },
      },
      [left, right],
    );
    const layout = resolveLayout(page);
    expect(layout.nodes[left.id]!.width).toBeCloseTo(195, 6);
    expect(layout.nodes[right.id]!.width).toBeCloseTo(195, 6);
    expect(layout.nodes[right.id]!.x).toBeCloseTo(205, 6);
    expect(layout.nodes[left.id]!.height).toBe(100);
  });

  it("centers on the main axis with justify", () => {
    const only = fixedShape("only", 100, 50);
    const page = verticalFrame([only]);
    page.nodes[page.rootId]!.layout.justify = "center";
    const layout = resolveLayout(page);
    expect(layout.nodes[only.id]!.y).toBe(75);
  });

  it("centers on the cross axis with items", () => {
    const only = fixedShape("only", 100, 50);
    const page = verticalFrame([only]);
    page.nodes[page.rootId]!.layout.mode = "horizontal";
    page.nodes[page.rootId]!.layout.items = "center";
    const layout = resolveLayout(page);
    expect(layout.nodes[only.id]!.x).toBe(0);
    expect(layout.nodes[only.id]!.y).toBe(75);
  });

  it("spreads with space-between", () => {
    const a = fixedShape("a", 100, 40);
    const b = fixedShape("b", 100, 40);
    const page = verticalFrame([a, b]);
    page.nodes[page.rootId]!.layout.justify = "space-between";
    const layout = resolveLayout(page);
    expect(layout.nodes[a.id]!.y).toBe(0);
    expect(layout.nodes[b.id]!.y).toBe(160);
  });
});

describe("resolveLayout — grid and absolute", () => {
  it("lays out a 3 column grid with row wrapping", () => {
    const cells = Array.from({ length: 6 }, (_, i) =>
      fixedShape(`c${i}`, "fill", 40),
    );
    const page = pageWith(
      {
        size: { width: 300, height: "hug" },
        layout: {
          mode: "grid",
          gap: 10,
          columns: 3,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          justify: "start",
          items: "start",
          clipContent: false,
          scroll: "none",
        },
      },
      cells,
    );
    const layout = resolveLayout(page);
    const cellW = (300 - 20) / 3;
    expect(layout.nodes[cells[0]!.id]!.x).toBeCloseTo(0, 6);
    expect(layout.nodes[cells[1]!.id]!.x).toBeCloseTo(cellW + 10, 6);
    expect(layout.nodes[cells[3]!.id]!.y).toBeCloseTo(50, 6);
    expect(layout.height).toBeCloseTo(90, 6);
  });

  it("honours explicit positions when layout mode is none", () => {
    const free = fixedShape("free", 50, 50);
    free.position = { x: 30, y: 40 };
    const page = verticalFrame([free]);
    page.nodes[page.rootId]!.layout.mode = "none";
    const layout = resolveLayout(page);
    expect(layout.nodes[free.id]!.x).toBe(30);
    expect(layout.nodes[free.id]!.y).toBe(40);
  });
});

describe("resolveLayout — text", () => {
  const textNode = (): DesignNode => {
    const node = createNode({
      type: "text",
      name: "title",
      text: "Hello",
      size: { width: "hug", height: "hug" },
    });
    node.typography = {
      fontFamily: "Inter",
      fontSize: 20,
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: 0,
      align: "left",
      verticalAlign: "top",
    };
    return node;
  };

  it("measures with the injected heuristic", () => {
    const node = textNode();
    const page = verticalFrame([node]);
    const layout = resolveLayout(page);
    const resolved = layout.nodes[node.id]!;
    // 5 chars * 0.55 * 20
    expect(resolved.width).toBe(55);
    expect(resolved.height).toBe(30);
  });

  it("wraps inside the available width instead of overflowing", () => {
    const node = textNode();
    node.text = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const page = verticalFrame([node]);
    page.nodes[page.rootId]!.size.width = 200;
    const layout = resolveLayout(page);
    expect(layout.nodes[node.id]!.width).toBeLessThanOrEqual(200);
    expect(layout.nodes[node.id]!.height).toBeGreaterThan(30);
  });

  it("sizes a button by its label plus padding, not just padding", () => {
    const button = createNode({
      type: "button",
      name: "cta",
      text: "开始设计",
      size: { width: "hug", height: "hug" },
      layout: { padding: { top: 12, right: 24, bottom: 12, left: 24 } },
      typography: {
        fontFamily: "Inter",
        fontSize: 20,
        fontWeight: 600,
        lineHeight: 1.5,
        letterSpacing: 0,
        align: "center",
        verticalAlign: "top",
      },
    });
    const layout = resolveLayout(verticalFrame([button]));
    const resolved = layout.nodes[button.id]!;
    // 4 个全角字 * 20 * 1.04 + 48 横向 padding
    expect(resolved.width).toBe(132);
    expect(resolved.height).toBe(54);
  });
});

describe("resolveLayout — responsive breakpoints (§14)", () => {
  const child = fixedShape("box", 300, 50);
  child.responsive = [
    { breakpoint: "tablet", patch: { size: { width: 120 } } },
  ];
  const page = verticalFrame([child]);

  it("ignores tablet rules at desktop-width-less contexts", () => {
    expect(
      resolveLayout(page, { breakpoint: "mobile" }).nodes[child.id]!.width,
    ).toBe(300);
  });

  it("applies tablet rules from tablet upward", () => {
    expect(
      resolveLayout(page, { breakpoint: "tablet" }).nodes[child.id]!.width,
    ).toBe(120);
    expect(
      resolveLayout(page, { breakpoint: "wide" }).nodes[child.id]!.width,
    ).toBe(120);
  });

  it("reflows the root frame to the preview viewport without touching the model", () => {
    const layout = resolveLayout(page, { breakpoint: "mobile" });
    expect(layout.width).toBe(375);
    expect(layout.nodes[page.rootId]!.width).toBe(375);
    // 模型仍然是设计宽度
    expect(page.nodes[page.rootId]!.size.width).toBe(400);
  });

  it("maps widths to breakpoint names", () => {
    expect(breakpointForWidth(375)).toBe("mobile");
    expect(breakpointForWidth(800)).toBe("tablet");
    expect(breakpointForWidth(1280)).toBe("desktop");
    expect(breakpointForWidth(1920)).toBe("wide");
  });

  it("a breakpoint equal to the authored root width, with no rules, re-solves byte-identically", () => {
    // 界面拿这条当"那一档是空按钮"的依据（apps/web/src/studio/viewer-params.ts 的 liveBreakpoints）：
    // 根画框已经写着 375，再按 mobile 重解 = 同一个数进同一个求解器，出来的树必须一字不差。
    const mixed = fixedShape("fill 孩子", "fill", "hug");
    const page = verticalFrame([fixedShape("数字孩子", 120, 40), mixed, fixedShape("hug 孩子", "hug", "hug")], {
      size: { width: 375, height: "hug" },
    });
    const design = resolveLayout(page);
    const mobile = resolveLayout(page, { breakpoint: "mobile" });
    expect(JSON.stringify(mobile)).toBe(JSON.stringify(design));
    // 反面对照：同一棵树按 tablet 重解就不是——证明上面那条相等不是"两边都没算"
    const tablet = resolveLayout(page, { breakpoint: "tablet" });
    expect(JSON.stringify(tablet)).not.toBe(JSON.stringify(design));
    expect(tablet.width).toBe(768);
  });
});

describe("resolveLayout — 根画框的关键字尺寸", () => {
  // 界面要把 layout.width × zoom 写进缩放占位盒（apps/web/src/studio/ViewerControls.tsx 那条投影），
  // 那里 `ResolvedLayout.width` 声明是 number。根上写 fill 时它曾是字符串 "fill"，乘法出来是 NaN。
  const oneChild = () => fixedShape("c", 200, 40);

  it("fill 根在设计尺寸那一档撑到页面画布，且两侧都是有限数字", () => {
    const page = verticalFrame([oneChild()], { size: { width: "fill", height: "fill" } });
    const layout = resolveLayout(page);
    expect(layout.width).toBe(page.width);
    expect(layout.height).toBe(page.height);
    // 反面对照：这一条不只是"等于 page.width"——它排掉了字符串与 NaN 两种穿过 `||` 链的形状
    expect(Number.isFinite(layout.width)).toBe(true);
    expect(Number.isFinite(layout.height)).toBe(true);
    expect(layout.nodes[page.rootId]!.width).toBe(page.width);
  });

  it("hug 根仍然贴内容宽度：fill 那条分支没有把所有关键字变成画布宽", () => {
    const page = verticalFrame([oneChild()], { size: { width: "hug", height: "hug" } });
    const layout = resolveLayout(page);
    expect(layout.width).toBeLessThan(page.width);
    expect(layout.height).toBeLessThan(page.height);
  });

  it("fill 根在断点那一档由视口宽度接管，高度仍是有限数字而不是关键字", () => {
    const page = verticalFrame([oneChild()], { size: { width: "fill", height: "fill" } });
    const layout = resolveLayout(page, { breakpoint: "mobile" });
    // 视口宽度压过 modelRoot：这一档的根画框就是 375
    expect(layout.width).toBe(375);
    expect(layout.nodes[page.rootId]!.width).toBe(375);
    expect(layout.height).toBe(page.height);
    expect(Number.isFinite(layout.height)).toBe(true);
  });
});

describe("hitTest", () => {
  const child = fixedShape("child", 100, 100);
  child.position = { x: 20, y: 20 };
  const page = (() => {
    const p = verticalFrame([child]);
    p.nodes[p.rootId]!.layout.mode = "none";
    return p;
  })();
  const layout = resolveLayout(page);

  it("returns the deepest node under the pointer", () => {
    expect(hitTest(layout, 60, 60)).toBe(child.id);
  });

  it("falls back to the page root", () => {
    expect(hitTest(layout, 350, 350)).toBe(page.rootId);
  });

  it("skips locked and hidden nodes", () => {
    child.locked = true;
    expect(hitTest(resolveLayout(page), 60, 60)).toBe(page.rootId);
    child.locked = false;
    child.visible = false;
    expect(hitTest(resolveLayout(page), 60, 60)).toBe(page.rootId);
    child.visible = true;
  });
});

describe("heuristicMeasure", () => {
  const typo = {
    fontFamily: "x",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    align: "left",
    verticalAlign: "top",
    nowrap: false,
  } as const;

  it("treats CJK as full width", () => {
    const latin = heuristicMeasure("中", { ...typo }, null).width;
    const ascii = heuristicMeasure("a", { ...typo }, null).width;
    expect(latin).toBe(Math.ceil(16));
    expect(ascii).toBe(Math.ceil(16 * 0.55));
  });

  it("counts wrapped lines", () => {
    const result = heuristicMeasure("word ".repeat(40).trim(), { ...typo }, 80);
    expect(result.lines!).toBeGreaterThan(3);
  });
});

describe("document factories", () => {
  it("creates a usable document with default tokens", () => {
    const doc = createDocument("Demo", "website");
    expect(doc.pages).toHaveLength(1);
    expect(doc.tokens.length).toBeGreaterThan(10);
    expect(doc.pages[0]!.nodes[doc.pages[0]!.rootId]!.type).toBe("frame");
    expect(doc.metadata.modes).toEqual(["light", "dark"]);
  });

  it("generates distinct ids", () => {
    expect(new Set([uid("n"), uid("n"), uid("n")]).size).toBe(3);
  });

  it("defaults radius helper", () => {
    expect(radius(8)).toEqual({
      topLeft: 8,
      topRight: 8,
      bottomRight: 8,
      bottomLeft: 8,
    });
  });
});

// 属性面板的 token 绑定会把 "{space.*}" 写进 gap / padding / cornerRadius。
// 这些字段类型曾是纯 number（谎报），运行时却已按 TokenStore 解析——这里锁住解析行为，
// 并钉死"缺 TokenStore 时回落有限值、不产生 NaN 尺寸"这条不变量（§12/§16）。
describe("resolveLayout — token 绑定的几何", () => {
  const tokens = new TokenStore([
    { key: "space.2", type: "dimension", value: 8 },
    { key: "space.3", type: "dimension", value: 12 },
  ]);

  const build = () => {
    const a = fixedShape("A", 100, 50);
    const b = fixedShape("B", 100, 50);
    const page = pageWith(
      {
        size: { width: 400, height: "hug" },
        layout: {
          mode: "vertical",
          gap: "{space.2}",
          padding: { top: "{space.3}", right: 0, bottom: "{space.3}", left: 0 },
          justify: "start",
          items: "start",
          clipContent: false,
          scroll: "none",
        },
      },
      [a, b],
    );
    return { page, a, b };
  };

  it("把 {space.*} 引用解析成真实 px 参与排布", () => {
    const { page, a, b } = build();
    const layout = resolveLayout(page, { tokens });
    // 2*50 + 1*gap(8) + 2*padding(12)
    expect(layout.height).toBe(132);
    expect(layout.nodes[a.id]!.y).toBe(12); // padding.top = space.3
    expect(layout.nodes[b.id]!.y).toBe(70); // 12 + 50 + gap(8)
  });

  it("缺 TokenStore 时引用解析不出数字，回落有限值而不是 NaN 尺寸", () => {
    const { page, a } = build();
    const layout = resolveLayout(page);
    expect(Number.isFinite(layout.height)).toBe(true);
    expect(layout.nodes[a.id]!.y).toBe(0);
  });
});
