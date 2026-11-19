/**
 * §39 × §40 × ADR-0086：把"这位角色的肖像"选成一件资产 id 的**纯函数**。
 *
 * 为什么单独成一个文件：`storyboard-render.ts` 拖着整条渲染链（DB、存储、realtime bus），
 * 纯选择逻辑不该被迫跟着 import 进来——这个文件零 IO、零依赖，谁 import 谁便宜。
 *
 * 纪律同 repo 其余模型层：纯函数（§16 要能重放）、每一步决定说清楚（注释里写）。
 */

export interface PortraitRow {
  /** 归属列。NULL 的行不可能是肖像——没有角色可归属 */
  characterId: string | null;
  assetId: string;
  createdAt: Date;
  genMeta: unknown;
}

/** gen_meta 里 `characterPortrait === true` 的才是"这位角色自己的肖像"——渲染链不接受场景截图冒充肖像 */
export function isPortraitRow(row: Pick<PortraitRow, 'genMeta'>): boolean {
  const meta = (row.genMeta ?? {}) as Record<string, unknown>;
  return meta.characterPortrait === true;
}

/**
 * 同一位角色取 createdAt 最新的那张肖像。行顺序与结果无关（§16 不认"碰巧排好了"）。
 * 行太多不累：只保留每位角色一行。
 */
export function latestPortraitByCharacter(rows: readonly PortraitRow[]): Record<string, string> {
  const byCharacter = new Map<string, PortraitRow>();
  for (const row of rows) {
    if (!row.characterId || !isPortraitRow(row)) continue;
    const current = byCharacter.get(row.characterId);
    if (!current || row.createdAt > current.createdAt) byCharacter.set(row.characterId, row);
  }
  const out: Record<string, string> = {};
  for (const [id, row] of byCharacter) out[id] = row.assetId;
  return out;
}
