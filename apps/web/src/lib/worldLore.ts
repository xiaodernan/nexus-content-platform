/**
 * 「世界编年」Studio 编辑侧的小助手：把输入框的改动合并进 `lore`，
 * 并负责"空了就整片摘掉"——字节级回到没有纪元的老文档（§16 与 zod 纪律一致）。
 *
 * 规则：
 * - `era` 空白 ⇒ 没有 era；`order` 空白或非有限数 ⇒ 没有 order；
 * - 两者都没有 ⇒ 返回 `null`（让调用方传给 updateWorldNode 去把 key 摘掉）；
 * - `order` 只收有限整数（有小数位直接取整；负数/NaN 视同未填）；
 */
export interface WorldLoreInput {
  era?: string;
  order?: number | string;
}

export interface WorldLore {
  era?: string;
  order?: number;
}

export function patchLore(existing: WorldLore | undefined, patch: Partial<WorldLoreInput>): WorldLore | null {
  const eraRaw = patch.era !== undefined ? patch.era : existing?.era;
  const era = typeof eraRaw === 'string' && eraRaw.trim().length > 0 ? eraRaw.trim().slice(0, 80) : undefined;

  let order: number | undefined;
  if (patch.order !== undefined) {
    if (typeof patch.order === 'string' && patch.order.trim() === '') {
      order = undefined;
    } else {
      const n = Number(patch.order);
      order = Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
    }
  } else if (existing?.order !== undefined && Number.isInteger(existing.order) && (existing.order as number) >= 0) {
    order = existing.order;
  }

  const out: WorldLore = {
    ...(era !== undefined ? { era } : {}),
    ...(order !== undefined ? { order } : {}),
  };
  return Object.keys(out).length > 0 ? out : null;
}
