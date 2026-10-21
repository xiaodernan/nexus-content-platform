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
  // 2026-10-20：两份实现合并成 `runLayout` 之后，**第一条已经不红了**（相等由构造保证）——
  // 增量路与全量路现在跑的是同一份 measure/place，"相等"不再靠两份实现碰巧一致。
  it("改一个节点的几何 → 增量解与全量解逐节点相等（含 paintOrder）——两份实现合并后由构造保证", () => {
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
    // 这一份改动**改的是谁**：A 的高度（50 → 80）。
    // （原来这条断言写的是"整份文档的高度要变"——但 root 是固定尺寸 400×200 的 horizontal 布局，
    // 改左兄弟的高度**本来就不改 root 的高度**（200 → 200）。这条断言从 2026-10-12 挂起至今，
    // 没人跑过它，所以那个错一直藏着：它量的是 root，而该量的是 A。）
    expect(full.nodes[changedId]!.height).toBe(80);
    expect(full.nodes[changedId]!.height).not.toBe(beforeLayout.nodes[changedId]!.height);
    // 根的高度不变（固定尺寸）——写清楚，免得下一个读代码的人以为这里该变
    expect(full.height).toBe(beforeLayout.height);
  });

  it("没碰到的分支被复用（对象身份一样）——2026-10-20 起真的复用了", () => {
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

  /**
   * 2026-10-21（增量路在编辑器里真的跑起来之后才暴露出来的一格）：
   *
   * **结构变了**（孩子被删/被插/被换序）时，父节点**不能**被沿用——
   * 沿用会把上一帧那份 `children` 数组整个带过来 → 画布上留着**幽灵节点**
   * （已经删掉的那个还在画布上，而且画的是上一帧的内容）。
   *
   * 为什么"改动集合"救不了它：删掉的那个孩子**不在这一帧的文档里**了，
   * 而 `subtreeHasChanged` 是顺着**当前**文档的孩子往下走的 → 走不到它 → 判成"没变"。
   * 所以判据得落在**结构本身**上：这一帧的孩子列表与上一帧那份对不上，就不能沿用。
   */
  /**
   * 2026-10-21（增量路在编辑器里真的跑起来之后才补上的一格）：
   *
   * **结构变了**（孩子被删）时，增量解与全量解必须**逐项一致**——
   * 已删的节点不能留在解里，绘制次序不能变。
   *
   * 一条要写清楚的边界：`ResolvedNode.children` 是**按 parentId 建的**，
   * 而文档里的孩子**常常没有 parentId** → 那个数组常常是空的，
   * **它不是结构表**（画布用的是文档的 children + 解里的几何）。
   * 所以这里断言的是"解里没有它"与"次序一致"，**不是**去数那个数组。
   */
  /**
   * 2026-10-21 上午补的一条**不变量守卫**：
   *
   * 增量路会**沿用上一帧那个对象**（`resolved[id] = prev.nodes[id]`）。
   * 于是有一条必须成立的不变量：**这一帧不许改动上一帧那份解**——
   * 下一帧要拿它当基准（比几何、比形状），它被改了，下一帧的判断就建立在错的东西上。
   *
   * 现在这份代码满足它（往"沿用来的"父节点里 push 被显式挡住了）。
   * 这条用例防的是**将来有人改回去**：那时上一帧的数组会一轮轮变长（越用越慢），
   * 而且下一帧的形状比对会对着被污染的数组做判断。
   */
  it("沿用不能污染上一帧那份解（上一帧的东西这一帧不许改）", () => {
    const page = rowPage();
    // **必须把 parentId 填上**：库里读回来的节点都带 parentId，
    // 而"往父节点里登记孩子"这条路正是靠 parentId 找父节点的
    // （没有 parentId → 那条路根本不走 → 这条用例就量不到它了）。
    const rootId = page.rootId;
    for (const child of page.nodes[rootId]!.children) {
      const childNode = page.nodes[child]!;
      page.nodes[child] = { ...childNode, parentId: rootId };
      for (const grand of childNode.children) {
        const grandNode = page.nodes[grand]!;
        page.nodes[grand] = { ...grandNode, parentId: child };
      }
    }
    const beforeLayout = resolveLayout(page);
    // 上一帧那份解的快照（深拷贝：它里面是对象与数组，浅拷贝比不出来）
    const snapshot = JSON.stringify(beforeLayout);
    const changedId = tallerAInPlace(page);

    resolveLayoutIncremental(page, {
      prevLayout: beforeLayout,
      changedNodeIds: new Set([changedId]),
    });

    expect(
      JSON.stringify(beforeLayout),
      "这一帧把上一帧那份解改了 → 下一帧拿它当基准就是错的（而且那个数组会一轮轮变长）",
    ).toBe(snapshot);
  });

  it("删掉一个孩子：它不能留在解里，绘制次序必须与全量一致", () => {
    // 特意造一个**非根**的固定尺寸父节点：根是直接 place 的（不走沿用判据），
    // 而固定尺寸的父节点在"少一个孩子"时大小不变 → 最容易踩"沿用"
    const page = createPage("Deep", 1000, 1000);
    const rootId = page.rootId;
    const root = page.nodes[rootId]!;
    const mid = createNode({ type: "frame", name: "Mid", size: { width: 300, height: 100 } });
    const kid1 = createNode({ type: "shape", name: "K1", size: { width: 40, height: 30 } });
    const kid2 = createNode({ type: "shape", name: "K2", size: { width: 60, height: 20 } });
    for (const node of [mid, kid1, kid2]) page.nodes[node.id] = node;
    mid.children = [kid1.id, kid2.id];
    root.children = [mid.id];

    const beforeLayout = resolveLayout(page);

    // 结构变了：mid 的孩子少了一个（mid 尺寸固定 → 大小不变 → 位置也不变）
    page.nodes[mid.id] = { ...mid, children: [kid1.id] };
    delete page.nodes[kid2.id];

    const incremental = resolveLayoutIncremental(page, {
      prevLayout: beforeLayout,
      changedNodeIds: new Set([kid2.id]),
    });
    const full = resolveLayout(page);

    expect(incremental.nodes[kid2.id], "已删的节点不该还在解里").toBeUndefined();
    expect(incremental.paintOrder).toEqual(full.paintOrder);
    expect(incremental.nodes).toEqual(full.nodes);
  });
});
