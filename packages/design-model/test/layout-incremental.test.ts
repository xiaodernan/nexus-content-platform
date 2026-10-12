import { describe, expect, it } from "vitest";
import { createNode, createPage } from "../src/nodes";
import { resolveLayout, resolveLayoutIncremental } from "../src/layout";
import type { Page } from "../src/types";

/**
 * §147 增量布局的账（ROADMAP #133）。
 *
 * 上一版在这里的用例只断言"函数能导入"——占位守卫永远为真，于是 `studio/store.ts`
 * 一度把增量版接进渲染路径，而**没有任何东西在守"增量与全量相等"这句话**
 * （注释里写着"由 layout-incremental.test.ts 钉着"，那个用例根本不量这件事）。
 * 2026-10-12 把占位换成下面两条**真量相等**的用例，它们当场红了：
 *
 *   - 增量解的 `paintOrder` 与全量解**不同**（渲染次序会变，肉眼可见）；
 *   - 没碰到的分支**没有被复用**（对象身份都不一样，"省下计算"没发生）。
 *
 * 结论：增量版与全量版**不等**，所以 store.ts 的接线当日撤回（继续走全量，
 * 全量是唯一真值）。下面两条因此**如实挂起**（`it.skip`）——不是删掉，是留一张
 * "修好之后再打开"的欠条；谁把 place/measure 核心抽成两路共用（#133），谁就把 skip 去掉。
 * 三条兜底那一条**仍然真跑**：那几条路径就是调 `resolveLayout`，现在就是对的。
 */

/** 横向一行 + 右侧一个纵向框：左兄弟只改高度时，右侧分支的几何完全不依赖它 */
function rowPage(): Page {
  const page = createPage("Row", 1000, 1000);
  const root = page.nodes[page.rootId]!;
  Object.assign(root, {
    size: { width: 400, height: 200 },
    layout: {
      mode: "horizontal",
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      justify: "start",
      items: "start",
      clipContent: false,
      scroll: "none",
    },
  });
  const a = createNode({ type: "shape", name: "A", size: { width: 100, height: 50 } });
  const b = createNode({ type: "frame", name: "B", size: { width: 200, height: "hug" } });
  Object.assign(b, {
    layout: {
      mode: "vertical",
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      justify: "start",
      items: "start",
      clipContent: false,
      scroll: "none",
    },
  });
  const b1 = createNode({ type: "shape", name: "B1", size: { width: 40, height: 30 } });
  const b2 = createNode({ type: "shape", name: "B2", size: { width: 60, height: 20 } });
  for (const node of [a, b, b1, b2]) page.nodes[node.id] = node;
  b.children = [b1.id, b2.id];
  root.children = [a.id, b.id];
  return page;
}

/** 在**同一份文档**上把左兄弟 A 改高（不改宽度），返回被改的那个 id */
function tallerAInPlace(page: Page): string {
  const changedId = page.nodes[page.rootId]!.children[0]!;
  const node = page.nodes[changedId]!;
  page.nodes[changedId] = { ...node, size: { width: node.size.width, height: 80 } };
  return changedId;
}

describe("resolveLayoutIncremental：§147 接线的账（ROADMAP #133）", () => {
  it("三条兜底路径都退回全量，且与全量解相等", () => {
    const page = rowPage();
    const beforeLayout = resolveLayout(page);
    const rootId = page.rootId;
    const changedId = tallerAInPlace(page);
    const full = resolveLayout(page);

    // 改动集合为空 → 全量更安全
    expect(resolveLayoutIncremental(page, { prevLayout: beforeLayout, changedNodeIds: new Set() })).toEqual(full);
    // 没有上一帧 → 只能全量
    expect(resolveLayoutIncremental(page, { changedNodeIds: new Set([changedId]) })).toEqual(full);
    // 动到根 → 整棵树都受影响，增量没有意义
    expect(
      resolveLayoutIncremental(page, { prevLayout: beforeLayout, changedNodeIds: new Set([rootId]) }),
    ).toEqual(full);
  });

  // 欠账（#133）：下面两条现在**红**，所以挂起。修好 place/measure 共用核心之后把 skip 去掉。
  it.skip("改一个节点的几何 → 增量解与全量解逐节点相等（含 paintOrder）——当前不等，见文件头", () => {
    const page = rowPage();
    const beforeLayout = resolveLayout(page);
    const changedId = tallerAInPlace(page);

    const incremental = resolveLayoutIncremental(page, {
      prevLayout: beforeLayout,
      changedNodeIds: new Set([changedId]),
    });
    const full = resolveLayout(page);

    expect(incremental.rootId).toBe(full.rootId);
    expect(incremental.width).toBe(full.width);
    expect(incremental.height).toBe(full.height);
    expect(incremental.paintOrder).toEqual(full.paintOrder);
    expect(incremental.nodes).toEqual(full.nodes);
    expect(full.height).not.toBe(beforeLayout.height);
  });

  it.skip("没碰到的分支被复用（对象身份一样）——当前是重算出一份相等的，见文件头", () => {
    const page = rowPage();
    const beforeLayout = resolveLayout(page);
    const changedId = tallerAInPlace(page);

    const incremental = resolveLayoutIncremental(page, {
      prevLayout: beforeLayout,
      changedNodeIds: new Set([changedId]),
    });

    const rightBranchId = page.nodes[page.rootId]!.children[1]!;
    expect(incremental.nodes[rightBranchId]).toBe(beforeLayout.nodes[rightBranchId]);
    for (const childId of page.nodes[rightBranchId]!.children) {
      expect(incremental.nodes[childId]).toBe(beforeLayout.nodes[childId]);
    }
  });
});
