'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { useStudioReady } from './store';

/**
 * §49 的检索面板：在项目语料（世界条目 / 角色档案 / 记忆 / 分镜镜头 / 游戏实体）里查一句。
 *
 * 结果里带着"怎么命中的"（全文 / 子串）和三个加数，不藏在一个黑盒分数后面；
 * 顶部明写向量检索不可用——没有 provider 就没有语义检索，这里不假装。
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

const SOURCE_LABELS: Record<string, string> = {
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
};

/**
 * 块的标题是「文档名 · 块名」（第 3 镜 / 来源句子 / 条目类型…）。这 264px 的面板里
 * 整条标题一定被截断，而截掉的正好是"哪一块"——那才是检索结果最有信息量的半句。
 * 所以拆成两段：文档名可以截，块名单独占一格不截。
 */
function splitTitle(title: string): { doc: string; part: string } {
  const i = title.indexOf(' · ');
  return i < 0 ? { doc: title, part: '' } : { doc: title.slice(0, i), part: title.slice(i + 3) };
}

export function RetrievePanel() {
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
  // 读取失败与"库里真的没块"是两件事，界面必须说不同的话：把一次 404/503 报成「0 块」，
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
    <div className="flex h-full min-h-0 flex-col" data-retrieve-panel>
      <header className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">检索</h2>
          <span
            className="ml-auto font-mono text-11 text-fg-3"
            data-knowledge-total
            data-stats-failed={statsFailed ? 'true' : 'false'}
          >
            {statsFailed ? '读不到' : `${stats.total} 块`}
          </span>
        </div>
        {statsFailed ? (
          // 读失败时这里一个芯片都不许出现：芯片缺席本来是"这一类真的没块"的证据，
          // 让它替一次网络故障作证就是把证据变成谎。
          <div className="mt-2 flex flex-wrap items-center gap-2" data-knowledge-unavailable>
            <span className="font-mono text-11 text-danger">语料库读不到：{statsFailed}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadStats()}
              data-retrieve-stats-retry
              className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-0.5 text-11 text-fg-3 hover:bg-bg-2 disabled:opacity-50"
            >
              重试
            </button>
          </div>
        ) : (
          /* 只有总数说不清"哪一类有几块"：设计正文一进来，总数就不再等于"游戏有没有内容"。
             一块都没有的来源不出现芯片——缺哪一片就是那一类真的没内容。 */
          <div className="mt-2 flex flex-wrap items-center gap-1" data-knowledge-sources>
            {Object.entries(stats.bySource)
              .filter(([, count]) => count > 0)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, count]) => (
                <span
                  key={key}
                  data-knowledge-source={key}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1.5 py-0.5 font-mono text-11 text-fg-3"
                >
                  {SOURCE_LABELS[key] ?? key} {count}
                </span>
              ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
            }}
            placeholder="查一句设定…"
            aria-label="查询"
            data-retrieve-query
            className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3"
          />
          <button
            type="button"
            disabled={busy || !query.trim()}
            onClick={() => void search()}
            data-retrieve-run
            className="shrink-0 rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-11 text-fg-1 disabled:opacity-50"
          >
            查
          </button>
        </div>
        <div className="mt-2 flex items-start gap-2">
          <p className="min-w-0 flex-1 text-11 leading-relaxed text-fg-3" data-retrieve-note>
            语料来自世界条目、角色档案、记忆、分镜镜头、游戏实体与设计页面的文字节点（§44/§46/§48/§40/§54/§16）。
            命中的是全文与子串匹配，
            分数由这三项相加：全文 ts_rank、子串命中、词覆盖度。
            {searched && !vectorAvailable
              ? ' 向量检索未接（没有 provider 就没有 embedding），所以这里没有"语义相近"这回事。'
              : searched && vectorAvailable
              ? ' 向量检索已接（语义相近也能搜到）。'
              : stats.vectorized === 0
              ? ' 向量检索未接（没有 provider 就没有 embedding），所以这里没有"语义相近"这回事。'
              : ` 其中 ${stats.vectorized} 块已有向量。`}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void rebuild()}
            data-retrieve-rebuild
            className="shrink-0 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-3 hover:bg-bg-2 disabled:opacity-50"
          >
            重建索引
          </button>
        </div>
        {message ? (
          <p className="mt-2 text-11 text-danger" data-retrieve-error>
            {message}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-[var(--nexus-space-2)]">
        {!searched ? (
          <p className="p-3 text-12 text-fg-3" data-retrieve-idle>
            {statsFailed
              ? '还没有查询。语料库这次没读到，所以这里不报块数——点上面的「重试」再看一次。'
              : `还没有查询。索引里有 ${stats.total} 块语料。`}
          </p>
        ) : null}
        {searched && !items.length ? (
          <p className="p-3 text-12 text-fg-3" data-retrieve-empty>
            没有命中的块。换个说法，或先点「重建索引」。
          </p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const { doc, part } = splitTitle(item.title);
            return (
              <li
                key={item.id}
                className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2"
                data-retrieve-hit={item.id}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      'shrink-0 rounded-[3px] border border-[var(--nexus-color-border-subtle)] px-1 font-mono text-10 text-fg-3',
                    )}
                    data-retrieve-source={item.sourceType}
                  >
                    {SOURCE_LABELS[item.sourceType] ?? item.sourceType}
                  </span>
                  <span className="shrink-0 text-11 text-fg-2" data-retrieve-part={item.id}>
                    {part}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-12 text-fg-1" title={item.title}>
                    {doc}
                  </span>
                  <span className="shrink-0 font-mono text-11 text-fg-3" data-retrieve-score={item.id}>
                    {item.score.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 text-11 leading-relaxed text-fg-2">{item.snippet}</p>
                <p className="mt-1 font-mono text-10 text-fg-3" data-retrieve-matched={item.id}>
                  {item.matchedBy.length ? item.matchedBy.join(' + ') : '无'} · 全文{' '}
                  {item.parts.fulltext.toFixed(3)} · 子串 {item.parts.substring.toFixed(2)} · 覆盖{' '}
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
