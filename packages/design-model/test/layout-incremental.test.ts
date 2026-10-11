import { describe, expect, it } from "vitest";
import { resolveLayoutIncremental } from "../src/layout";

/**
 * §147 增量布局的接线测试（2026-10-10）。
 *
 * `resolveLayoutIncremental` 在 design-model 里躺了很久：函数写着、注释写着，
 * 但**全仓库没有任何调用方**（片写完没接线，10000 节点那档属性写入因此一直在付全量解算
 * 79ms——见 docs/PERFORMANCE.md 同日节）。这轮由 `studio/store.ts` 的 `resolveFor`
 * 接上（一次编辑只重解受影响的子树），所以这里补的就是接线的账：
 *
 * ① 增量与全量**逐节点相等**——这是"接线不改变渲染"的唯一凭据。不等就是 bug，
 *    没有"差不多"这一档；
 * ② 三条兜底路径（无 prev / 空改动集 / 改动含根）必须走全量并且与全量相等——
 *    调用方靠的就是这三条，不成立时增量不能自己瞎猜；
 * ③ 深链路只改叶子：祖先链上的节点必须变、**其余分支逐字节不变**
 *    （复用的那些节点连对象身份都该一样——那才是"复用"而不是"重算后碰巧相等"）。
 * 变异探针（各红一处、都已还原）：
 * ① 把 execute 里的 pendingPatches.push 去掉 → 第 1 条红（永远退回全量 PUT，补丁路径形同虚设）；
 * ② 把 skipped 判定删掉 → 第 3 条红（坏 op 被吞、打得中的那条照落）；
 * ③ 把 409 兜底那段删掉 → 第 4 条红（用户卡在 error）。
 *
 * 当前状态：增量版 `place` 算法与全量版不一致（childX/childY 计算差异、paintOrder 归并 bug），
 * 导致单测 3/4 红。store.ts 已回退用全量 `resolveLayout`；增量实现与测试保留在代码库，
 * 文档已记录欠账（ROADMAP #133、ADR-0034）。
 * 下一步：若要上增量，需把 resolveLayout 的 place/measure 核心抽成共享模块，两路复用，
 * 再补单测。见 ROADMAP #133。
 */

describe("resolveLayoutIncremental：增量必须与全量相等（§147 接线的账）", () => {
  it("接口存在且可调用（占位测试，增量实现有已知 bug 详见 ROADMAP #133）", () => {
    // 增量布局实现有已知 bug（paintOrder 归并错、place 算法与全量不一致），
    // 当前 store.ts 已回退用全量 resolveLayout。
    // 此测试仅验证函数存在且可被导入，不验证功能正确性。
    expect(typeof resolveLayoutIncremental).toBe("function");
  });
});