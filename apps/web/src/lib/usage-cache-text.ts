/**
 * §CACHE-3：把「这次生成用了多少缓存」翻译成一句人话。
 *
 * 抽成纯函数而不是留在组件里，理由与 `app/admin/ai-cache/cache-view.ts` 同一条：
 * 这几句话会原样出现在界面上，**措辞就是承诺**。承诺要能被逐条钉住，
 * 而钉住一个 JSX 里的表达式只能靠正则猜——那测的是文本，不是行为。
 *
 * 三个状态各自独立，任何一个都不能用另一个兜底：
 *
 * | 输入 | 输出 | 为什么不能合并 |
 * |---|---|---|
 * | `cacheReported=false` | 缓存读数未报 | 网关没给，说 0 就是编 |
 * | `cacheReported=true, cached=0` | 缓存未命中 | 这是**一次真实的冷启动**，是信息 |
 * | `cacheReported=true, cached>0` | 缓存命中 N·P% | 这才是用户想看的那个数 |
 *
 * 分母用 `tokensIn`：OpenAI 的 `prompt_tokens` **含** `cached_tokens`
 * （缓存那一段只是打折，不是不计费）。拿它当分母才是"输入里有多少是复用的"。
 * `tokensIn === 0` 时不给百分比——0 做分母算出来的数是编的（ADR 0262 的口径）。
 */

export type CacheUsageSlice = {
  tokensIn: number;
  cachedTokens: number;
  cacheReported: boolean;
};

/** 百分比四舍五入到整数；`tokensIn <= 0` 时返回 `null`（不是 0）。 */
export function cacheShare(usage: CacheUsageSlice): number | null {
  if (!usage.cacheReported) return null;
  if (usage.tokensIn <= 0) return null;
  if (usage.cachedTokens <= 0) return 0;
  return Math.round((usage.cachedTokens / usage.tokensIn) * 100);
}

export function cacheText(usage: CacheUsageSlice): string {
  if (!usage.cacheReported) return '缓存读数未报';
  if (usage.cachedTokens <= 0) return '缓存未命中';
  const share = cacheShare(usage);
  return share === null ? `缓存命中 ${usage.cachedTokens}` : `缓存命中 ${usage.cachedTokens}·${share}%`;
}

/**
 * 一页账本的缓存合计。
 *
 * **只统计 `cacheReported` 的行**。把"没报"的行按 0 加进分母，命中率会凭空变小——
 * 那是用数据缺失伪造一个更差的读数，和伪造一个更好的读数一样不诚实。
 * 一行都没报时 `rows === 0`，调用方要说"没有可用的缓存读数"，绝不画 0%。
 */
export type CacheTotal = { rows: number; cached: number; prompt: number; share: number | null };

export function cacheTotal(
  rows: readonly (CacheUsageSlice & { demoMode?: boolean })[],
): CacheTotal {
  let counted = 0;
  let cached = 0;
  let prompt = 0;
  for (const row of rows) {
    if (row.demoMode) continue;
    if (!row.cacheReported) continue;
    counted += 1;
    cached += Math.max(0, row.cachedTokens);
    prompt += Math.max(0, row.tokensIn);
  }
  return {
    rows: counted,
    cached,
    prompt,
    share: counted > 0 && prompt > 0 ? Math.round((cached / prompt) * 100) : null,
  };
}
