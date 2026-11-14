'use client';

import { useCallback, useEffect, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import { useStudioReady } from './store';
import type { Locale } from '@/lib/i18n';

/**
 * §49 的检索面板：在项目语料（世界条目 / 角色档案 / 记忆 / 分镜镜头 / 游戏实体）里查一句。
 *
 * 结果里带着"怎么命中的"（全文 / 子串）和三个加分，不藏在一个黑盒分数后面；
 * 顶部明写向量检索不可用——没有 provider 就没有语义检索，这里不假装。
 * 双语（v732）：locale 由上层 StudioShell 透传；Chinese keys 与 en keys 同位一一对齐。
 */

interface Retrieved {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  title: string;
  snippet: string;
  score: number;
  matchedBy: string[];
  parts: { fulltext: number; substring: number; coverage: number };
}

const COPY = {
  zh: {
    title: '检索',
    totalBlocks: (n: number) => `${n} 块`,
    readFailed: '读不到',
    corpusFailed: (reason: string) => `语料库读不到：${reason}`,
    statsRetry: '重试',
    queryPlaceholder: '查一句设定…',
    queryAria: '查询',
    search: '查',
    reindex: '重建索引',
    vectorOn: '向量检索已接（语义相近也能搜到）。',
    vectorOff: '向量检索未接（没有 provider 就没有 embedding），所以这里没有"语义相近"这回事。',
    vectorPartial: (n: number) => `其中 ${n} 块已有向量。`,
    idleWithStats: (n: number) => `还没有查询。索引里有 ${n} 块语料。`,
    idleUnreadable: '还没有查询。语料库这次没读到，所以这里不报块数——点上面的"重试"再看一次。',
    empty: '没有命中的块。换个说法，或先点"重建索引"。',
    none: '无',
    fulltext: '全文',
    substring: '子串',
    coverage: '覆盖',
    corpusDescription: '语料来自世界条目、角色档案、记忆、分镜镜头、游戏实体与设计页面的文字节点（§44/§46/§48/§40/§54/§16）。命中的是全文与子串匹配，分数由这三项相加：全文 ts_rank、子串命中、词覆盖度。',
    sourceLabels: {
      lore: '传说',
      history: '历史',
      geography: '地理',
      factions: '势力',
      characters: '角色条目',
      creatures: '生物',
      items: '物品',
      quests: '任务',
      story: '故事',
      character: '角色档案',
      memory: '记忆',
      storyboard: '分镜',
      game: '游戏',
      design: '设计文档',
    } as Record<string, string>,
  },
  en: {
    title: 'Retrieve',
    totalBlocks: (n: number) => `${n} blocks`,
    readFailed: 'Not readable',
    corpusFailed: (reason: string) => `The corpus can’t be read: ${reason}`,
    statsRetry: 'Retry',
    queryPlaceholder: 'Ask the world’s lore…',
    queryAria: 'Query',
    search: 'Find',
    reindex: 'Rebuild index',
    vectorOn: 'Vector search is wired — semantic neighbors come back too.',
    vectorOff: 'Vector search is not wired (no embedding provider) — so there is no "semantic neighbors" experience here.',
    vectorPartial: (n: number) => `${n} blocks already vectorized.`,
    idleWithStats: (n: number) => `No query yet. The index holds ${n} blocks of corpus.`,
    idleUnreadable: 'No query yet. The corpus did not read this time — nothing will be claimed about block counts; tap “Retry” above.',
    empty: 'No blocks hit. Reword it, or rebuild the index first.',
    none: 'none',
    fulltext: 'fulltext',
    substring: 'substring',
    coverage: 'coverage',
    corpusDescription:
      'The corpus comes from world entries, character profiles, memories, storyboard shots, game entities and design-page text nodes (§44/§46/§48/§40/§54/§16). Matched by fulltext and substring — the score adds three: fulltext ts_rank, substring hits, term coverage.',
    sourceLabels: {
      lore: 'Lore',
      history: 'History',
      geography: 'Geography',
      factions: 'Factions',
      characters: 'Characters',
      creatures: 'Creatures',
      items: 'Items',
      quests: 'Quests',
      story: 'Story',
      character: 'Characters',
      memory: 'Memory',
      storyboard: 'Storyboard',
      game: 'Game',
      design: 'Design doc',
    } as Record<string, string>,
  },
} as const;

/**
 * 块的标题是「文档名 · 块名」。这 264px 的面板里
 * 整条标题一定被截断，而截掉的正好是"哪一块"——那才是检索结果最有信息量的半边。
 * 所以拆成两段：文档名可以截，块名单独占一栏不截。
 */
function splitTitle(title: string): { doc: string; part: string } {
  const i = title.indexOf(' · ');
  return i < 0 ? { doc: title, part: '' } : { doc: title.slice(0, i), part: title.slice(i + 3) };
}

export function RetrievePanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const studio = useStudioReady();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Retrieved[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    vectorized: number;
    bySource: Record<string, number>;
  }>({ total: 0, vectorized: 0, bySource: {} });
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [vectorAvailable, setVectorAvailable] = useState(false);
  // 读取失败与"库里真的没块"是两件事，界面必须说不同的话：把一次 404/503 报成“空块”，
  // 就等于用一个像内容的数字宣布"这个项目没有语料"（§159）。
  const [statsFailed, setStatsFailed] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${studio.projectId}/knowledge`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { total?: number; vectorized?: number; bySource?: Record<string, number>; message?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setStats({
        total: body?.total ?? 0,
        vectorized: body?.vectorized ?? 0,
        bySource: body?.bySource ?? {},
      });
      setStatsFailed(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setStatsFailed(reason);
      setMessage(reason);
    }
  }, [studio.projectId]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/projects/${studio.projectId}/knowledge/search`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ q: query }),
          cache: 'no-store',
        },
      );
      const body = (await res.json().catch(() => null)) as
        | { results?: Retrieved[]; vectorAvailable?: boolean; query?: string; message?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setItems(body?.results ?? []);
      setVectorAvailable(body?.vectorAvailable ?? false);
      setSearched(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${studio.projectId}/knowledge`, {
        method: 'POST',
        headers: csrfHeaders(),
      });
      const body = (await res.json().catch(() => null)) as { chunks?: number; message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      await loadStats();
      if (query.trim()) await search();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wd-rootCol" data-retrieve-panel>
      <header className="wd-headBordered">
        <div className="wd-row2">
          <h2 className="wd-label">{c.title}</h2>
          <span
            className="wd-monoFaintEnd"
            data-knowledge-total
            data-stats-failed={statsFailed ? 'true' : 'false'}
          >
            {statsFailed ? c.readFailed : c.totalBlocks(stats.total)}
          </span>
        </div>
        {statsFailed ? (
          // 读失败时这里一个锭片都不允许出现：锭片缺少本身是"这一类真的没块"的证据，
          // 让它替一次网络故障作证就是把证据变成谎。
          <div className="rp-wrap2Mt" data-knowledge-unavailable>
            <span className="rp-dangerMono11">{c.corpusFailed(statsFailed)}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadStats()}
              data-retrieve-stats-retry
              className="rp-ghostBtnFaintSm"
            >
              {c.statsRetry}
            </button>
          </div>
        ) : (
          /* 只有总数读不清哪一类有几块：设计正文一进来，总数就不再等于"游戏有没有内容"。
             一块都没有的来源不出现锭片——缺哪一片就是那一类真的没内容。 */
          <div className="ap-wrapCenter" data-knowledge-sources>
            {Object.entries(stats.bySource)
              .filter(([, count]) => count > 0)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, count]) => (
                <span
                  key={key}
                  data-knowledge-source={key}
                  className="rp-chipSm"
                >
                  {c.sourceLabels[key] ?? key} {count}
                </span>
              ))}
          </div>
        )}
        <div className="wd-rowMt2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
            }}
            placeholder={c.queryPlaceholder}
            aria-label={c.queryAria}
            data-retrieve-query
            className="cp-growField"
          />
          <button
            type="button"
            disabled={busy || !query.trim()}
            onClick={() => void search()}
            data-retrieve-run
            className="mm-accent"
          >
            {c.search}
          </button>
        </div>
        <div className="rp-row2Mt">
          <p className="rp-lead11" data-retrieve-note>
            {c.corpusDescription}
            {searched && !vectorAvailable
              ? ' ' + c.vectorOff
              : searched && vectorAvailable
                ? ' ' + c.vectorOn
                : stats.vectorized === 0
                  ? ' ' + c.vectorOff
                  : ' ' + c.vectorPartial(stats.vectorized)}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void rebuild()}
            data-retrieve-rebuild
            className="rp-ghostBtnFaint"
          >
            {c.reindex}
          </button>
        </div>
        {message ? (
          <p className="wd-dangerMt2" data-retrieve-error>
            {message}
          </p>
        ) : null}
      </header>

      <div className="wd-scrollP2">
        {!searched ? (
          <p className="cp-empty" data-retrieve-idle>
            {statsFailed ? c.idleUnreadable : c.idleWithStats(stats.total)}
          </p>
        ) : null}
        {searched && !items.length ? (
          <p className="cp-empty" data-retrieve-empty>{c.empty}</p>
        ) : null}
        <ul className="wd-col2">
          {items.map((item) => {
            const { doc, part } = splitTitle(item.title);
            return (
              <li
                key={item.id}
                className="wd-card"
                data-retrieve-hit={item.id}
              >
                <div className="wd-row1">
                  <span
                    className="rp-sourceChip"
                    data-retrieve-source={item.sourceType}
                  >
                    {c.sourceLabels[item.sourceType] ?? item.sourceType}
                  </span>
                  <span className="rp-ink11shrink" data-retrieve-part={item.id}>
                    {part}
                  </span>
                  <span className="cp-trunc12ink" title={item.title}>
                    {doc}
                  </span>
                  <span className="hi-monoFaintShrink" data-retrieve-score={item.id}>
                    {item.score.toFixed(2)}
                  </span>
                </div>
                <p className="rp-lead11ink">{item.snippet}</p>
                <p className="ds-monoMt10" data-retrieve-matched={item.id}>
                  {item.matchedBy.length ? item.matchedBy.join(' + ') : c.none} · {c.fulltext}{' '}
                  {item.parts.fulltext.toFixed(3)} · {c.substring} {item.parts.substring.toFixed(2)} · {c.coverage}{' '}
                  {item.parts.coverage.toFixed(2)}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
