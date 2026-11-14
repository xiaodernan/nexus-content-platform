/**
 * §AILIVE-3 · 真模型 patches 的「内存 dry-run」判据（ADR-0170）。
 *
 * ## 它回答什么
 *
 * `POST /api/ai/run` 只把 patches 交回客户端，**不落库**（见 `apps/web/src/app/api/ai/run/route.ts`
 * 的 `deliver`：发 `gateResponse(...).delivered` 就结束，没有任何 `applyPatch`→写库那一步）。
 * 真正把补丁写进 `design_nodes` 的是 Studio client 拿 patches 调 `applyPatch` 再发 `/design`。
 * 所以一个只走 HTTP 的 smoke **没有资格**靠"查库看 fontSize 变了没"来判定成功——
 * 库里没变是 gate 的正常表现，不是 bug。旧版 `live-design-smoke.mts` 正是踩了这一脚：
 * 请求改 `Headline`、却去读 `Eyebrow` 的落库值，得到名不副实的 `[verify-FAIL] not persisted`。
 *
 * 正确的判据是：拿 web/client **同一份** `applyPatch` 纯函数，在内存里把 patches 打到刚 GET 到的
 * 那份 document 上，看三件事——① 每个 op 都生效（没进 `skipped`）；② 目标节点真被 touch；
 * ③ 目标字号真变成诉求要的值。三件都成立才叫 applied。这不碰库、不需要 Studio client、
 * 不需要浏览器，却真验到了"补丁合法且达成诉求"。
 *
 * ## 三态，而不是一つの PASS/FAIL
 *
 * - `applied`：patches 非空、全部生效、目标节点被 touch 且字号达标 → 真 · 设计生成走通。
 * - `honest-refusal`：patches 为空 **且** explanation 有话 → 模型在目录粒度不足以引用
 *   nodeId 时的诚实拒改（`design_prompt.py` 规则 1/5 明确允许），是**合法终态**，
 *   既不造假红（硬断言 patches>0）也不造假绿（把 0 patches 说成"走通 ✓"）。
 * - `invalid`：patches 非空却 skipped 非空 / 没 touch 目标 / 字号不对；或 patches 为空
 *   连 explanation 都没有（沉默失败）→ 真红。
 *
 * ## 为什么是独立模块
 *
 * 判据本身必须被判据守着：`scripts/test/design-patch-verdict.test.ts` 用合成 fixture 把
 * 上面每一态、每一种造 id / 错页 / 错值都钉死，另有 `.git` 下的变异臂脚本对判据做
 * "改一处→单测必须红"的验伪。放脚本里内联就没人看着了，所以抽成纯函数 + 独立单测。
 *
 * 纯函数：不联网、不读库、不改入参（`applyPatch` 是 CopyOnWrite）。
 */
import { applyPatch } from '@nexus/creative-model';
import type { DesignDocument, DesignPatch } from '@nexus/creative-model';

export type DesignPatchVerdict =
  | {
      kind: 'applied';
      /** 应用了几个 patch */
      patchCount: number;
      /** 被真实修改的节点 id（来自 applyPatch 的 touchedNodeIds） */
      touchedNodeIds: string[];
      /** 目标节点 dry-run 后的字号（仅当能给目标定位到时） */
      targetFontSize: number | null;
    }
  | {
      kind: 'honest-refusal';
      patchCount: 0;
      /** 模型说清了为什么做不了——判据据此把它与沉默失败分开 */
      explanation: string;
    }
  | {
      kind: 'invalid';
      patchCount: number;
      /** 每一条都指名道姓：哪个 patch 的第几个 op、为什么没生效 */
      reasons: string[];
    };

export interface VerifyDesignPatchesOptions {
  /** 期望目标节点被设成的字号；默认 28（本片 smoke 的诉求值） */
  expectedFontSize?: number;
}

/**
 * 对一批真模型产出的 patches 做内存 dry-run 判定。
 *
 * @param document 刚从 `/api/projects/{id}` GET 到的权威文档（只读，不会被改）
 * @param patches  响应里的 `patches`
 * @param targetNodeId 请求点名要改的节点 id；为 null 时只验"补丁生效 + 没 skipped"，
 *                     不验具体字号（用于选不到目标的降级诉求）
 * @param explanation 模型给出的中文说明；patches 为空时它是区分诚实拒改/沉默失败的关键
 */
export function verifyDesignPatches(
  document: DesignDocument,
  patches: DesignPatch[],
  targetNodeId: string | null,
  explanation: string,
  options: VerifyDesignPatchesOptions = {},
): DesignPatchVerdict {
  const expected = options.expectedFontSize ?? 28;

  // 0 patches：有解释 = 诚实拒改（合法）；没解释 = 沉默失败（真红）。绝不硬断言 patches>0。
  if (patches.length === 0) {
    const text = (explanation ?? '').trim();
    return text
      ? { kind: 'honest-refusal', patchCount: 0, explanation: text }
      : { kind: 'invalid', patchCount: 0, reasons: ['patches 为空且 explanation 为空——既没动手也没说为什么，判不出成败'] };
  }

  // 逐个 patch 顺序应用：后一个 patch 可以引用前一个 patch 新建的节点（与 Studio client 的
  // 事务语义一致）。applyPatch 不改入参，next 从 document 起一路换手。
  let next = document;
  const reasons: string[] = [];
  const touched = new Set<string>();
  patches.forEach((patch, patchIndex) => {
    let result;
    try {
      result = applyPatch(next, patch);
    } catch (error) {
      reasons.push(
        `patch[${patchIndex}] 应用时抛异常：${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    next = result.document;
    // skipped 是 applyPatch 的"不静默失败"契约（§159）：编造的 nodeId、错页、重号、越界
    // 都会落在这里。真模型造 id 就由此当场现形——不必另写一套 id 白名单去比对。
    for (const skip of result.skipped) {
      reasons.push(`patch[${patchIndex}].ops[${skip.index}] 未生效：${skip.reason}`);
    }
    for (const id of result.touchedNodeIds) touched.add(id);
  });

  let targetFontSize: number | null = null;
  if (targetNodeId) {
    const allNodes = next.pages.flatMap((page) => Object.values(page.nodes));
    const target = allNodes.find((node) => node.id === targetNodeId);
    if (!touched.has(targetNodeId)) {
      reasons.push(
        `请求点名的目标节点 ${targetNodeId} 没被任何 op 碰到（touched=[${[...touched].join(',') || '空'}]）`,
      );
    }
    if (!target) {
      reasons.push(`目标节点 ${targetNodeId} 在 dry-run 后的文档里不存在（可能被 remove）`);
    } else {
      const value = target.typography?.fontSize;
      targetFontSize = typeof value === 'number' ? value : null;
      if (targetFontSize !== expected) {
        reasons.push(`目标节点字号 ${targetFontSize ?? 'null'} ≠ 诉求要求的 ${expected}`);
      }
    }
  } else if (touched.size === 0) {
    // 没点名目标时，至少要真改到点什么：否则一组全 skipped 的 ops 会被当成 applied。
    reasons.push('没有可定位的目标节点，且没有任何 op 实际修改到节点（touched 为空）');
  }

  return reasons.length
    ? { kind: 'invalid', patchCount: patches.length, reasons }
    : { kind: 'applied', patchCount: patches.length, touchedNodeIds: [...touched], targetFontSize };
}
