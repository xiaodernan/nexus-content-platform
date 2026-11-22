/**
 * §EXT-SEARCH · 站外检索（现实世界的真实资料）。
 *
 * 用户要求「尽可能接入联网搜索得到的真实数据、真实实验数据，不要全部是演示数据堆砌
 * ——用户会觉得虚假」。平台内那九类目标再全，也只是**这个宇宙里**的东西；
 * 读者查一个现实概念（"盐碱地""潮汐发电"）时，站内永远给不出答案，而一句
 * "没有匹配"会把"我们没有"说成"世界上没有"。
 *
 * 三条纪律：
 *
 * 1. **Provider 可替换**（架构纪律 4）：业务代码只面向 `ExternalSearchProvider` 接口，
 *    不 import 任何具体 SDK / endpoint。默认实现是维基百科（无需 key、无需登录、
 *    全球可达、内容可溯源），换源只改 `defaultExternalSearchProvider()` 一处。
 * 2. **诚实不可用**：连不上就说连不上，并把原因原样带出去。绝不拿站内结果冒充站外，
 *    也不静默把这一块藏掉——藏掉的那一块正是用户以为"已经搜了全世界"的那一块。
 * 3. **站外不进站内的序**：外部命中单独一块、单独标注来源，不与九类站内目标混排
 *    （混排会让"平台自己的内容"和"维基百科的词条"看起来同权重）。
 */

export interface ExternalSearchHit {
  /** 条目标题（原文，不翻译） */
  title: string;
  /** 一段摘要（截断到 EXTERNAL_SNIPPET_CHARS） */
  snippet: string;
  /** 可点开的原文地址 */
  url: string;
  /** 来源名，界面照抄 */
  source: string;
}

export type ExternalSearchResult =
  | { ok: true; source: string; hits: ExternalSearchHit[]; query: string }
  | { ok: false; reason: string; query: string };

export interface ExternalSearchProvider {
  readonly source: string;
  search(query: string, locale: 'zh' | 'en'): Promise<ExternalSearchResult>;
}

/** 每条摘要最多这么多字符。再多就是把维基百科正文搬进我们页面。 */
export const EXTERNAL_SNIPPET_CHARS = 220;
/** 站外命中最多几条。 */
export const EXTERNAL_MAX_HITS = 4;
/** 超时。站外是增强，不是首屏阻塞项。 */
export const EXTERNAL_TIMEOUT_MS = 6_000;

interface WikipediaSearchRow {
  title?: string;
  snippet?: string;
}

interface WikipediaQueryResponse {
  query?: { search?: WikipediaSearchRow[] };
}

interface WikipediaSummaryResponse {
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(value: string, max: number): string {
  const flat = stripHtml(value);
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 维基百科：先用搜索端点拿候选，再逐条取摘要。
 * 两步而不是一步：搜索端点的 `snippet` 是带 HTML 的高亮片段，截断之后常常只剩半个词；
 * 摘要端点的 `extract` 是完整的一句话，读起来像人话。
 */
export const wikipediaProvider: ExternalSearchProvider = {
  source: '维基百科',

  async search(query: string, locale: 'zh' | 'en'): Promise<ExternalSearchResult> {
    const host = locale === 'en' ? 'en.wikipedia.org' : 'zh.wikipedia.org';
    const trimmed = query.trim();
    if (!trimmed) return { ok: false, reason: '查询词为空', query };

    try {
      const searchUrl =
        `${`https://${host}/w/api.php`}?action=query&list=search&format=json&formatversion=2` +
        `&srlimit=${EXTERNAL_MAX_HITS}&srsearch=${encodeURIComponent(trimmed)}`;
      const searchRes = await fetch(searchUrl, {
        signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
        headers: { 'user-agent': 'NEXUS-content-platform/1.0 (external search lane)' },
      });
      if (!searchRes.ok) {
        return { ok: false, reason: `维基百科搜索端点返回 HTTP ${searchRes.status}`, query };
      }
      const searchBody = (await searchRes.json()) as WikipediaQueryResponse;
      const titles = (searchBody.query?.search ?? [])
        .map((row) => row.title)
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .slice(0, EXTERNAL_MAX_HITS);
      if (titles.length === 0) return { ok: true, source: wikipediaProvider.source, hits: [], query };

      // 摘要**并行**取，不串行：串行是 1 + N 个来回，而这一块挂在首屏渲染路径上。
      // 实测串行版本把 /search 的首屏从 ~1s 拖到 30s+（4 条摘要各一次往返）。
      // 单条失败只丢那一条（`null`），不让一整块陪葬。
      const summaries = await Promise.all(
        titles.map(async (title) => {
          const slug = title.replace(/ /g, '_');
          const summaryUrl = `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
          const summaryRes = await fetch(summaryUrl, {
            signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
            headers: { 'user-agent': 'NEXUS-content-platform/1.0 (external search lane)' },
          }).catch(() => null);
          if (!summaryRes || !summaryRes.ok) return null;
          const summary = (await summaryRes.json().catch(() => null)) as WikipediaSummaryResponse | null;
          if (!summary?.extract) return null;
          return {
            title: summary.title ?? title,
            snippet: clip(summary.extract, EXTERNAL_SNIPPET_CHARS),
            url: summary.content_urls?.desktop?.page ?? `https://${host}/wiki/${encodeURIComponent(slug)}`,
            source: wikipediaProvider.source,
          } satisfies ExternalSearchHit;
        }),
      );
      const hits = summaries.filter((h): h is ExternalSearchHit => h !== null);
      return { ok: true, source: wikipediaProvider.source, hits, query };
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      return { ok: false, reason: `站外检索没连上（${reason}）`, query };
    }
  },
};

/** 换源只改这里（架构纪律 4：业务代码不 import 具体 SDK）。 */
export function defaultExternalSearchProvider(): ExternalSearchProvider {
  return wikipediaProvider;
}

/**
 * 页面用的那句话：没连上时照实说，并把原因带上。
 * 不写成"暂时没有外部资料"——那句话把"连不上"说成"没有"，正是用户点名要避免的那种谎。
 */
export function externalUnavailableNote(reason: string, locale: 'zh' | 'en'): string {
  return locale === 'en'
    ? `Outside-the-platform search could not be reached just now: ${reason}. In-platform results above are unaffected.`
    : `站外检索这一会儿没连上：${reason}。上面站内的结果不受影响。`;
}

/** 这一块叫什么。界面与 `SEARCH_NOT_COVERED` 都照抄这两句，不另编。 */
export const EXTERNAL_LANE_LABEL = {
  zh: {
    title: '现实世界 · 站外资料',
    note: '这一块来自维基百科（无需登录、可溯源），只回答现实概念；它与上面的站内结果分开排，不混在一起。',
    empty: '维基百科里也没有匹配「{q}」的词条。',
    method: '维基百科搜索端点取候选，再逐条取正文摘要；每条都能点回原文。',
  },
  en: {
    title: 'The real world · outside the platform',
    note: 'This lane comes from Wikipedia (no login, every line traceable) and answers real-world concepts only; it is ranked separately from the in-platform results above and never mixed with them.',
    empty: 'No Wikipedia entry matches “{q}” either.',
    method: 'Wikipedia search endpoint for candidates, then a per-entry summary; every line links back to the source.',
  },
} as const;
