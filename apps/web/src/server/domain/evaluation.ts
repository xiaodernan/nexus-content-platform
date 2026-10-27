import type { DesignDocument, DesignPatch } from '@nexus/design-model';

/**
 * §85 Evaluation 的打分原语。评测脚本（scripts/eval-baseline.mts）负责装配语料与跑真实路径，
 * 这里只放能独立验证的纯函数：排名读数、召回/倒数排名，以及补丁引用完整性
 * （Hallucination 的确定性代理——补丁引用的 id 必须真实存在，或由本批补丁先建）。
 *
 * 为什么单独一层：评测数字会写进 docs/EVALUATION.md 供人读，打分函数错一位，
 * 文档就整体说谎。原语进单测，脚本只做装配，谁坏了一眼能定位。
 */

/** 期望块在结果里的名次（1 起）；0 = 没进结果 */
export function rankOfId(expectedId: string, rankedIds: readonly string[]): number {
  const index = rankedIds.indexOf(expectedId);
  return index === -1 ? 0 : index + 1;
}

/** recall@k：期望块排进前 k 名就算命中（每个查询一个期望块时 recall@k = hit@k） */
export function hitAtK(rank: number, k: number): boolean {
  return rank >= 1 && rank <= k;
}

/** 倒数排名：第 1 名 1 分、第 2 名 0.5 分、没进结果 0 分 */
export function reciprocalRank(rank: number): number {
  return rank >= 1 ? 1 / rank : 0;
}

export function mean(xs: readonly number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * 引用完整性：补丁引用的 id 里，哪些在目标文档中不存在（空数组 = 无捏造引用）。
 * 这是 Hallucination 的确定性代理——补丁引用的 id 必须真实存在，**或者由本批补丁
 * 自己先建出来**：add-section 这类编排是链式插入（先建 section，再建 grid，再往
 * grid 里塞 cards），后一条 op 的 parentId 指向前一条刚创建的节点，那是编排不是幻觉。
 * op 按应用顺序走，所以只放行"先建后引"；引用本批后面才建的 id 照样算捏造。
 */
export function missingPatchReferences(
  patches: readonly DesignPatch[],
  document: DesignDocument,
): string[] {
  const pages = new Set(document.pages.map((p) => p.id));
  const nodes = new Set<string>();
  for (const page of document.pages) {
    for (const id of Object.keys(page.nodes)) nodes.add(id);
  }
  const assets = new Set(document.assets.map((a) => a.id));
  const components = new Set(document.components.map((c) => c.id));
  const created = new Set<string>();
  const missing: string[] = [];
  const check = (id: string | undefined) => {
    if (!id) return;
    if (pages.has(id) || nodes.has(id) || assets.has(id) || components.has(id) || created.has(id)) return;
    if (!missing.includes(id)) missing.push(id);
  };
  for (const patch of patches) {
    for (const op of patch.ops) {
      switch (op.op) {
        case 'set':
        case 'unset':
        case 'merge':
        case 'remove':
          check(op.nodeId);
          break;
        case 'insert':
          check(op.parentId);
          created.add(op.node.id);
          break;
        case 'reparent':
          check(op.nodeId);
          check(op.parentId);
          break;
        case 'reorder':
          check(op.parentId);
          break;
        case 'removeComponent':
          check(op.componentId);
          break;
        case 'removeAsset':
          check(op.assetId);
          break;
        case 'removePage':
          check(op.pageId);
          break;
        case 'addPage':
          created.add(op.page.id);
          break;
        case 'addAsset':
          created.add(op.asset.id);
          break;
        case 'addComponent':
          created.add(op.component.id);
          break;
        case 'setToken':
        case 'addToken':
        case 'removeToken':
        case 'restoreComponent':
        case 'restoreAsset':
        case 'setVisualDna':
          break;
      }
    }
  }
  return missing;
}
