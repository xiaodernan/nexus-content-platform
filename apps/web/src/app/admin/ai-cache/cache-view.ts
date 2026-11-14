import type { AiCacheReadout, AppCacheStats, PrefixStats, ProviderStats } from '@/server/ai/cache-stats';

/**
 * §CACHE-2 `/admin/ai-cache` 的**展示判据**：把三个数字变成三句话。
 *
 * 抽出来单独放（而不是写在组件里）的理由与 `discover-view.ts` 同一句话：
 * 展示判据是**可以错的**——"0 命中率"和"还没有样本"是两句完全不同的话，
 * 混了就会在面板上写出一句具体的谎。写成纯函数才能逐条钉住。
 *
 * 三条不变式：
 * 1. **`null` 永远渲染成"没有样本/没启用"，不渲染成 0**；
 * 2. **比例的分母写在正文里**，不只给百分比——百分比最容易被读成全量；
 * 3. **前缀复用率不是"字节复用率"**：它数的是"这几次请求里有多少次建立在见过的前缀上"，
 *    与"提示词有多少字节被复用"是两个量。面板的文案必须说清是哪一种。
 */

/** 空值兜底。0 是真的 0，不兜。 */
export function dashOr(value: number | null | undefined, fallback = '—'): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback;
}

/** 比例 → 百分比串。`null` → `—（没有样本）`，绝不写 0%。 */
export function pct(rate: number | null | undefined, digits = 1): string {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}

/** 份额：`part/total` 的百分比。分母为 0 → null（没有可分的）。 */
export function share(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, (part / total) * 100));
}

export interface Split {
  /** 前一段占总量的百分比；null = 没有样本，条形图不该画。 */
  first: number | null;
  second: number | null;
}

/** 前缀账的两段：复用过的请求 vs 第一次见到的请求。 */
export function requestSplit(prefix: PrefixStats): Split {
  const first = share(prefix.reused, prefix.requests);
  if (first === null) return { first: null, second: null };
  return { first, second: 100 - first };
}

/** provider 账的两段：报过账的调用 vs 缺席的调用。 */
export function providerSplit(provider: ProviderStats): Split {
  const first = share(provider.reported, provider.reported + provider.missing);
  if (first === null) return { first: null, second: null };
  return { first, second: 100 - first };
}

/**
 * 前缀那一行的大字读数。**说的是"请求份额"，不是"字节份额"**——
 * 96% 复用率的真实含义是"每 100 次请求里有 96 次建立在已见过的稳定前缀上"，
 * 不是"提示词有 96% 的字节被复用"。后者要靠字节审计（`npm run audit:prompt-prefix`）。
 */
export function prefixHeadline(prefix: PrefixStats): string {
  if (prefix.requests === 0) return '还没有请求';
  return `${prefix.reused} / ${prefix.requests} 次建立在已见过的前缀上`;
}

/** 前缀账的脚注：把"这个数是什么、不是什么"说在明面上。 */
export function prefixNote(prefix: PrefixStats): string {
  if (prefix.requests === 0) {
    return '一次请求都还没有。这一格不是 0% —— 0% 会读成"试过但全没命中"，那是另一件事。';
  }
  return (
    `这个数由我们自己的字节算出（稳定块摘要重复出现 = 这一轮前缀与上一轮逐字节相同），` +
    `与网关自报的 cached_tokens 无关。它数的是**请求**份额，不是字节份额：` +
    `字节层面的读数要看 \`npm run audit:prompt-prefix\`。`
  );
}

/** 容量水位：LRU 里装了多少种前缀。满了就开始淘汰，复用率会掉——那是容量信号，不是故障。 */
export function capacityNote(prefix: PrefixStats): string {
  if (prefix.capacity <= 0) return '容量未知（ai-service 没报）。';
  if (prefix.uniquePrefixes >= prefix.capacity) {
    return `已顶到上界（${prefix.uniquePrefixes}/${prefix.capacity}，淘汰 ${prefix.evictions} 次）：` +
      `再出现新前缀就会淘汰旧摘要，复用率会随之下降。这是容量信号，不是故障。`;
  }
  return `装 ${prefix.uniquePrefixes}/${prefix.capacity} 种前缀，淘汰 ${prefix.evictions} 次。` +
    `进程内、重启即失、不跨实例。`;
}

/** 应用级缓存那一格：**没启用 ≠ 零命中**，这两件事必须分开说。 */
export function appCacheHeadline(appCache: AppCacheStats | null): string {
  if (appCache === null) return '未启用';
  return `${appCache.hits} 命中 / ${appCache.misses} 未命中`;
}

export function appCacheDetail(appCache: AppCacheStats | null): string {
  if (appCache === null) {
    return '应用级 completion 缓存没开（`NEXUS_LLM_COMPLETION_CACHE_URL` 未配置）。' +
      '这一格不是"0 命中"——是这条路径根本没走缓存。';
  }
  if (appCache.degraded === true) {
    return '后端降级中：读不到共享缓存时按未命中处理，调用照常走 provider（fail-open）。';
  }
  const shared = appCache.shared === true ? '跨实例共享' : appCache.shared === false ? '本进程独享' : '共享性未知';
  const namespace = appCache.namespace ? ` · 命名空间 ${appCache.namespace}` : '';
  return `后端 ${appCache.backend}（${shared}）${namespace}；写入 ${appCache.stores} 次、写失败 ${appCache.storesFailed} 次、淘汰 ${appCache.evictions} 次。`;
}

/** provider 那一格：分母只算报过账的样本，这句话必须写出来。 */
export function providerNote(provider: ProviderStats): string {
  const total = provider.reported + provider.missing;
  if (total === 0) {
    return '还没有 provider 调用。';
  }
  if (provider.reported === 0) {
    return `${total} 次调用里 provider 一次都没报 cached_tokens。` +
      '常见于冷前缀 / 首轮 / 短 prompt——「没报」不等于「命中 0」。';
  }
  return (
    `${total} 次调用里 ${provider.reported} 次报账、${provider.missing} 次缺席。` +
    `上面那个 ${pct(provider.reportedHitRate)} 的分母**只算报过账的 ${provider.reported} 次**` +
    `（${provider.promptTokensTotal} prompt tokens），不是全部 ${total} 次。` +
    `本仓不拿这个数做对外承诺：真机四实验里内容零重叠的两次调用也报了同一个 cached 值（ADR-0262）。`
  );
}

/** 页脚：把"这是哪一台、什么时候、多久刷一次"说清。 */
export function footNote(ok: boolean, pollMs: number, measuredAt: string | null): string {
  const scope = '这份读数是**这一台 ai-service 进程**的读数；它进程重启即清零，不跨实例聚合。';
  const when = measuredAt ? `取于 ${new Date(measuredAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '还没有成功取到过';
  const cadence = `每 ${Math.round(pollMs / 1000)} 秒问一次${ok ? '' : '（当前这一轮没取到）'}`;
  return `${when} · ${cadence} · ${scope}`;
}

/** 三段读数的整体判定：给页面顶部一个"这一屏值不值得细看"的结论。 */
export type CacheVerdict = 'good' | 'warm' | 'cold' | 'unmeasured';

export function verdictOf(readout: AiCacheReadout): CacheVerdict {
  if (readout.prefix.requests === 0) return 'unmeasured';
  const rate = readout.prefix.reuseRate;
  if (rate === null) return 'unmeasured';
  if (rate >= 0.8) return 'good';
  if (rate >= 0.4) return 'warm';
  return 'cold';
}

/** §CACHE-4-AB 警示：本进程被显式退回非流时，"命中率低"未必是 prompt 坏事。 */
export function nonStreamCaveat(readout: AiCacheReadout): string {
  if (readout.transport?.stream === false) {
    return '本进程的出站 LLM 被显式退回非流（NEXUS_LLM_STREAM=0）；上游对不同车道分片不共享 KV，同一车道分发器也可能把 KV 不定投进不同片——' +
      '非流命中率会比流式低很多（同机同 digest 实测：稳态 80–83% vs 100%）。先恢复流式，再读这一栏。';
  }
  return '';
}

export function verdictText(readout: AiCacheReadout): { headline: string; detail: string } {
  const caveat = nonStreamCaveat(readout);
  const appended = (detail: string) => (caveat ? `${detail} ${caveat}` : detail);
  switch (verdictOf(readout)) {
    case 'good':
      return {
        headline: '前缀稳定，前缀缓存该命中',
        detail: appended('绝大多数请求建立在同一段稳定前缀上。provider 只要做前缀缓存，这一段就该被复用。'),
      };
    case 'warm':
      return {
        headline: '前缀部分稳定',
        detail: appended('一半左右的请求换过前缀。常见原因是每轮都在变的现场内容（选中、标注、最近改动）占比偏大。'),
      };
    case 'cold':
      return {
        headline: '前缀一直在变，缓存救不了',
        detail: appended('不到四成请求续接了上一轮的前缀。先看载荷里哪些字段每轮都在变——字节前缀缓存遇到第一处不同就断。'),
      };
    default:
      return {
        headline: '还没有样本',
        detail: appended('这一台还没处理过请求。先跑一次真实调用，再回来看这三本账。'),
      };
  }
}
