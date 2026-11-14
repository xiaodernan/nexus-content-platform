/**
 * 「节省账单」（/tasks/<项目>）的纯计算（§16 设计模型之外的小型纯逻辑，先于 UI 落盘）。
 *
 * 数据源口径（必须与台账一致，不得另起炉灶）：
 * `agent_tasks.usage` 里的 `cachedTokens` = provider 自己报的 prompt_tokens_details.cached_tokens
 * （同前缀的命中数）。注意：prompt_tokens（= tokensIn）本身**包含**缓存部分，所以
 * 命中率 = cached / tokensIn 是 [0,1] 之间的比率，而不是外加（外部来源的 tokeneconomie）。
 *
 * 诚实边界：
 * - 应用级 Redis 完成缓存（整条响应回放）**不计入**这个数——它不产生 usage，只在 /healthz 里计数；
 * - usage 存在但没有 cachedTokens 字段的行（v692 之前写入）记为 legacy，不当 0 算"命中了"，
 *   也不计入 tokensIn 的命中率分母…… 稳妥起见：legacy 行的 tokensIn 仍计入分母，但单独报出数量；
 * - tokensIn 为 0（无真实调用）时命中率为 null，界面上渲染 '—'，绝不写 0% 冒充"测过没有命中"。
 */

export interface SavingsAggregates {
  /** usage IS NOT NULL 的行数 */
  rowsWithUsage: number;
  /** usage 里有 cachedTokens 键的行数（新账） */
  rowsWithCacheField: number;
  /** 全部任务行数 */
  turns: number;
  /** capability = 'real' 的行数 */
  realTurns: number;
  /** capability = 'demo' 的行数 */
  demoTurns: number;
  /** SUM(usage->>'tokensIn')（可能含 legacy 行）*/
  tokensIn: number;
  /** SUM(usage->>'cachedTokens')（仅新行贡献）*/
  cachedTokens: number;
}

export interface SavingsSummary {
  cachedTokens: number;
  tokensIn: number;
  /** [0,1] 或 null（tokensIn = 0 时）*/
  hitRate: number | null;
  turns: number;
  realTurns: number;
  demoTurns: number;
  /** usage 存在但不带 cachedTokens 键的行数 */
  legacyRows: number;
  /** cached / tokensIn 的"输入计算省下比例"，等于 hitRate；分开存以备 UI 措辞使用 */
  savedShare: number | null;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function savingsFromAggregates(a: SavingsAggregates): SavingsSummary {
  const tokensIn = finiteNonNegative(a.tokensIn);
  const cachedTokens = Math.min(finiteNonNegative(a.cachedTokens), tokensIn > 0 ? tokensIn : finiteNonNegative(a.cachedTokens));
  const hitRate = tokensIn > 0 ? Math.min(1, cachedTokens / tokensIn) : null;
  const legacyRows = Math.max(0, Math.trunc(finiteNonNegative(a.rowsWithUsage - a.rowsWithCacheField)));
  return {
    cachedTokens,
    tokensIn,
    hitRate,
    turns: Math.trunc(finiteNonNegative(a.turns)),
    realTurns: Math.trunc(finiteNonNegative(a.realTurns)),
    demoTurns: Math.trunc(finiteNonNegative(a.demoTurns)),
    legacyRows,
    savedShare: hitRate,
  };
}
