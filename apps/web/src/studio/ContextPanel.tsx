'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProjectContextPayload } from '@nexus/schemas';
import { cn } from '@/lib/cn';
import type { Locale } from '@/lib/i18n';
import { useStudioReady } from './store';

/**
 * §66-71 Context Engine 的面板：把"Agent 每次该知道的那些事"摊开给人看。
 *
 * 三件事必须写在脸上：
 * 1. 上面三项（选中/页面/视口）来自画布本地，其余来自服务端装配——同一份上下文的两半，来源不同；
 * 2. 目录被预算裁过就明说裁掉了什么，totals 仍是未裁的那份（宁可少列条目，不少报数）；
 * 3. 没落地的分支与没带的信息如实列出来，不拿"还没有"冒充"已经索引好了"（§159）。
 * 双语（v736）：locale 由 StudioShell 透传；服务端装配（§67）也按 NEXUS_LOCALE 产出 notes/branches/unavailable。
 */

const COPY = {
  zh: {
    heading: '上下文（§66-71）',
    reload: '重新装配',
    lede: 'Agent 不该每次从零理解这个项目。这一页摊开的是它每次拿到的那一份目录 —— 不是整份文档。',
    canvasLocal: '画布本地（服务端这份装配给不了）',
    currentPage: '当前页面',
    viewport: '视口',
    designSize: '设计尺寸',
    selection: '选中',
    noneSelected: '没选任何节点',
    selected: (n: number, names: string, more: boolean) => `${n} 个：${names}${more ? '…' : ''}`,
    sizes: '尺寸（§68）',
    indexFull: (indexChars: string, docChars: string, ratio: string) =>
      `目录 ${indexChars} / 整份 ${docChars} 字符（${ratio}%）`,
    codeCatalog: (codeIndexChars: string, files: number, symbols: number, internalDeps: number) =>
      `代码目录 ${codeIndexChars} 字符：${files} 个文件 / ${symbols} 个符号 / ${internalDeps} 条内部依赖`,
    unreadableSuffix: (n: number) => `；${n} 个文件语法解析失败`,
    nodeRegionSuffix: (n: number) => `；${n} 段 code-only 代码`,
    budgetNote: '目录预算',
    budgetAria: '上下文预算（字符）',
    applyBudget: '按此预算重算',
    budgetZero: '预算 0 = 关掉裁剪：这一栏只是不裁，不代表目录装得进任何预算。',
    noTrim: '这次没触发裁剪：目录整份放得进预算。',
    nodes: '节点',
    nodesVal: (n: string, reachable: string) => `${n}（可达 ${reachable}）`,
    framesSections: '框/段',
    components: '组件',
    componentsVal: (n: number, instances: number, unused: number) => `${n}（引用 ${instances}，未用 ${unused}）`,
    assets: '资产',
    assetsVal: (n: number, orphan: number) => `${n}（未被引用 ${orphan}）`,
    tokens: 'token',
    tokensVal: (n: number, unused: number, undeclared: number) => `${n}（未用 ${unused}，只引用未声明 ${undeclared}）`,
    interactionsEdges: '交互/边',
    unreachableMsg: (n: number) =>
      `有 ${n} 个节点从页面根走不到：目录照实计了数，但结构里看不见它们。`,
    pageCatalog: '页面目录',
    pageMeta: (nodeCount: number, frames: number, sections: number, tokens: number, interactions: number) =>
      `${nodeCount} 节点 · 框 ${frames} · 段 ${sections} · token ${tokens} · 交互 ${interactions}`,
    restOfProject: '项目其余部分',
    world: '世界',
    worldUnreadable: (reason: string) => `读不出来：${reason}`,
    noWorldDoc: '还没有世界文档',
    noEntries: '还没有条目',
    worldLinks: (n: number) => `${n} 条关系`,
    characters: '角色',
    charactersVal: (n: number, unreadable: number) => `${n} 个${unreadable ? `（${unreadable} 个读不出来）` : ''}`,
    memory: '记忆',
    none: '一条都没有',
    assetsLabel: '资产',
    assetNone: '没有',
    corpusLabel: '语料',
    corpusPlaceholder: '按一句设定试取回…',
    corpusAria: '语料查询词',
    corpusRun: '试一次',
    corpusSummary: (query: string, used: number, candidates: number) =>
      `按「${query}」取回 ${used}/${candidates} 块`,
    omittedSuffix: (n: number) => `，另有 ${n} 块相关的因预算没带上`,
    corpusNone: '这一轮没查语料库：AI 请求是拿本轮提示词去查的，这里点「试一次」看同一份结果。',
    matchedBy: '命中方式',
    score: '分',
    readBlock: '取整块',
    blockReading: '取整块中…',
    blockMeta: (index: number, total: number, tokens: number) => `（第 ${index}/${total} 块 · ${tokens} token）`,
    blockEmpty: '这一出处取回来是空的块列表——服务端没报错，那就真是一块都没有。',
    corpusEmpty: '一条都没取到：这个项目里没有与这句话相关的语料（不是"检索坏了"）。',
    publishing: '发布',
    unpublished: '未发布',
    corpusVal: (chunks: number, vector: boolean) => `${chunks} 块（${vector ? '有向量' : '无向量：没有 provider 就没有语义检索'}）`,
    recentChangesVal: (s: { label: string | null; source: string; createdAt: string }) =>
      `${s.label ?? s.source}（${s.createdAt.slice(5, 10)}）`,
    recentChanges: '最近变更',
    noSnapshots: '还没有快照',
    projectMap: '项目图（§71 的七个分支）',
    notCarried: '这次没带的',
    assembling: '正在装配…',
    idle: '还没有装配结果。',
    join: '、',
    status: { indexed: '已索引', partial: '部分', 'not-indexed': '未索引' } as Record<string, string>,
    kindLabels: {
      lore: '传说',
      history: '历史',
      geography: '地理',
      factions: '势力',
      characters: '角色',
      creatures: '生物',
      items: '物品',
      quests: '任务',
      story: '故事',
      session: '本次会话',
      character: '角色',
      world: '世界',
      user: '我的偏好',
    } as Record<string, string>,
  },
  en: {
    heading: 'Context (§66-71)',
    reload: 'Reassemble',
    lede: 'The agent should never understand this project from scratch. This page lays out the one catalog it receives each time — not the whole document.',
    canvasLocal: "Canvas-local (the server assembly can't provide these)",
    currentPage: 'Current page',
    viewport: 'Viewport',
    designSize: 'Design size',
    selection: 'Selection',
    noneSelected: 'No nodes selected',
    selected: (n: number, names: string, more: boolean) => `${n} selected: ${names}${more ? '…' : ''}`,
    sizes: 'Sizes (§68)',
    indexFull: (indexChars: string, docChars: string, ratio: string) =>
      `Index ${indexChars} / full ${docChars} chars (${ratio}%)`,
    codeCatalog: (codeIndexChars: string, files: number, symbols: number, internalDeps: number) =>
      `Code catalog ${codeIndexChars} chars: ${files} files / ${symbols} symbols / ${internalDeps} internal deps`,
    unreadableSuffix: (n: number) => `; ${n} files failed syntax parsing`,
    nodeRegionSuffix: (n: number) => `; ${n} code-only regions`,
    budgetNote: 'Index budget',
    budgetAria: 'Context budget (chars)',
    applyBudget: 'Recompute at this budget',
    budgetZero: 'Budget 0 turns trimming off: this view trims nothing — it does not mean the catalog fits any budget.',
    noTrim: 'No trimming was triggered this time: the whole catalog fits the budget.',
    nodes: 'Nodes',
    nodesVal: (n: string, reachable: string) => `${n} (reachable ${reachable})`,
    framesSections: 'Frames/Sections',
    components: 'Components',
    componentsVal: (n: number, instances: number, unused: number) => `${n} (referenced ${instances}, unused ${unused})`,
    assets: 'Assets',
    assetsVal: (n: number, orphan: number) => `${n} (unreferenced ${orphan})`,
    tokens: 'Tokens',
    tokensVal: (n: number, unused: number, undeclared: number) => `${n} (unused ${unused}, refs to undeclared ${undeclared})`,
    interactionsEdges: 'Interactions/Edges',
    unreachableMsg: (n: number) =>
      `${n} nodes are unreachable from page roots: the catalog counts them, but the structure does not show them.`,
    pageCatalog: 'Page catalog',
    pageMeta: (nodeCount: number, frames: number, sections: number, tokens: number, interactions: number) =>
      `${nodeCount} nodes · ${frames} frames · ${sections} sections · ${tokens} tokens · ${interactions} interactions`,
    restOfProject: 'The rest of the project',
    world: 'World',
    worldUnreadable: (reason: string) => `Unreadable: ${reason}`,
    noWorldDoc: 'No world document yet',
    noEntries: 'No entries yet',
    worldLinks: (n: number) => `${n} relations`,
    characters: 'Characters',
    charactersVal: (n: number, unreadable: number) => `${n}${unreadable ? ` (${unreadable} unreadable)` : ''}`,
    memory: 'Memory',
    none: 'None',
    assetsLabel: 'Assets',
    assetNone: 'None',
    corpusLabel: 'Corpus',
    corpusPlaceholder: 'Try fetching by one line of lore…',
    corpusAria: 'Corpus query',
    corpusRun: 'Try once',
    corpusSummary: (query: string, used: number, candidates: number) =>
      `Fetched by “${query}”: ${used}/${candidates} chunks`,
    omittedSuffix: (n: number) => `; ${n} more relevant chunks omitted (budget)`,
    corpusNone: 'No corpus lookup this turn — AI requests query with the current prompt; click “Try once” to see the same result.',
    matchedBy: 'matched by',
    score: 'score',
    readBlock: 'Read whole block',
    blockReading: 'Reading whole block…',
    blockMeta: (index: number, total: number, tokens: number) => `(chunk ${index}/${total} · ${tokens} tokens)`,
    blockEmpty: 'The block list for this source came back empty — the server reported nothing, so there really is nothing.',
    corpusEmpty: 'Nothing fetched: this project has no corpus related to this line (retrieval is not broken).',
    publishing: 'Publishing',
    unpublished: 'Not published',
    corpusVal: (chunks: number, vector: boolean) =>
      `${chunks} chunks (${vector ? 'has vectors' : 'no vectors: without a provider there is no semantic search'})`,
    recentChangesVal: (s: { label: string | null; source: string; createdAt: string }) =>
      `${s.label ?? s.source} (${s.createdAt.slice(5, 10)})`,
    recentChanges: 'Recent changes',
    noSnapshots: 'No snapshots yet',
    projectMap: 'Project map (§71, seven branches)',
    notCarried: 'Not carried this time',
    assembling: 'Assembling…',
    idle: 'Nothing assembled yet.',
    join: ', ',
    status: { indexed: 'Indexed', partial: 'Partial', 'not-indexed': 'Not indexed' } as Record<string, string>,
    kindLabels: {
      lore: 'Lore',
      history: 'History',
      geography: 'Geography',
      factions: 'Factions',
      characters: 'Characters',
      creatures: 'Creatures',
      items: 'Items',
      quests: 'Quests',
      story: 'Story',
      session: 'Session',
      character: 'Character',
      world: 'World',
      user: 'My preferences',
    } as Record<string, string>,
  },
} as const;

export function ContextPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const studio = useStudioReady();
  const [context, setContext] = useState<ProjectContextPayload | null>(null);
  const [budget, setBudget] = useState('20000');
  const [corpusQuery, setCorpusQuery] = useState('');
  const label = (key: string) => c.kindLabels[key] ?? key;
  // §49 的整块正文：上下文里发的是窗口，这里按出处把整块取回来看（通道是 GET …/knowledge/block）
  const [block, setBlock] = useState<{
    sourceId: string;
    blocks: { chunkIndex: number; content: string; tokens: number }[];
    error: string | null;
    busy: boolean;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (chars: number | null, query?: string) => {
      setBusy(true);
      setMessage(null);
      try {
        // 参数交给 URLSearchParams：手接 `?a=…&b=…` 早晚会漏一回转义，
        // 而中文查询词不转义时最坏的结果是"永远取不到"，看着像项目里真没有这句话
        const params = new URLSearchParams();
        if (chars !== null) params.set('indexChars', String(chars));
        const q = query?.trim() ?? '';
        if (q) params.set('corpusQuery', q);
        const url = `/api/projects/${studio.projectId}/context${params.size > 0 ? `?${params.toString()}` : ''}`;
        const res = await fetch(url, { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as
          | { context?: ProjectContextPayload; message?: string }
          | null;
        if (!res.ok || !body?.context) throw new Error(body?.message ?? `HTTP ${res.status}`);
        setContext(body.context);
        setBudget(String(body.context.sizes.budgetChars));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [studio.projectId],
  );

  const readBlock = useCallback(
    async (sourceType: string, sourceId: string) => {
      setBlock({ sourceId, blocks: [], error: null, busy: true });
      try {
        const params = new URLSearchParams({ sourceType, sourceId });
        const res = await fetch(`/api/projects/${studio.projectId}/knowledge/block?${params.toString()}`, {
          cache: 'no-store',
        });
        const body = (await res.json().catch(() => null)) as
          | { blocks?: { chunkIndex: number; content: string; tokens: number }[]; message?: string }
          | null;
        // 服务端 404 给的那句原因要原样显示出去：「库里没有这一块」与「这一块是空的」是两件事
        if (!res.ok || !body?.blocks) throw new Error(body?.message ?? `HTTP ${res.status}`);
        setBlock({ sourceId, blocks: body.blocks, error: null, busy: false });
      } catch (error) {
        setBlock({
          sourceId,
          blocks: [],
          error: error instanceof Error ? error.message : String(error),
          busy: false,
        });
      }
    },
    [studio.projectId],
  );

  useEffect(() => {
    void load(null);
  }, []);

  const selectedNames = studio.selection
    .map((id) => studio.page.nodes[id]?.name ?? id)
    .slice(0, 6);

  const index = context?.design;
  const docChars = context?.sizes.fullDocumentChars ?? 0;
  const indexChars = context?.sizes.indexChars ?? 0;
  const ratio = docChars > 0 ? (indexChars / docChars) * 100 : 0;

  return (
    <div className="cx-root" data-context-panel>
      <header>
        <div className="cx-headRow">
          <h2 className="cx-h2">{c.heading}</h2>
          <button
            type="button"
            className="cx-btn"
            onClick={() => void load(null)}
            disabled={busy}
            data-context-reload
          >
            {c.reload}
          </button>
        </div>
        <p className="cx-lede">{c.lede}</p>
      </header>

      {message ? (
        <div className="cx-error">
          {message}
        </div>
      ) : null}

      <section className="cx-card" data-context-local>
        <div className="cx-note">{c.canvasLocal}</div>
        <Row k={c.currentPage} v={studio.page.name} />
        <Row k={c.viewport} v={studio.viewport === 'design' ? c.designSize : studio.viewport} />
        <Row
          k={c.selection}
          v={
            studio.selection.length === 0
              ? c.noneSelected
              : c.selected(
                  studio.selection.length,
                  selectedNames.join(c.join),
                  studio.selection.length > selectedNames.length,
                )
          }
        />
      </section>

      {context && index ? (
        <>
          <section className="cx-card">
            <div className="cx-note">{c.sizes}</div>
            {/* 264px 的栏里并排放两组数字必然竖着折行，所以数值单独成行 */}
            <div className="cx-num" data-context-chars>
              {c.indexFull(fmt(indexChars), fmt(docChars), ratio.toFixed(1))}
            </div>
            {/* §69：代码目录的大小与"有多少文件根本没解析出来"一起报，读的人不必猜目录是否完整 */}
            <div className="cx-codeLine" data-context-code>
              {c.codeCatalog(
                fmt(context.sizes.codeIndexChars),
                context.code.totals.files,
                context.code.totals.symbols,
                context.code.totals.internalDeps,
              )}
              {context.code.totals.unreadableFiles > 0 ? c.unreadableSuffix(context.code.totals.unreadableFiles) : ''}
              {context.code.totals.nodeRegionFiles > 0 ? c.nodeRegionSuffix(context.code.totals.nodeRegionFiles) : ''}
            </div>
            <div className="cx-note">{c.budgetNote}</div>
            <div className="cx-budgetRow">
              <input aria-label={c.budgetAria}
                id="ctx-budget"
                type="number"
                min={0}
                step={1000}
                className="cx-input cx-budgetInput"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                data-context-budget
              />
              <button
                type="button"
                className="cx-btn"
                onClick={() => void load(Number(budget))}
                disabled={busy || !Number.isFinite(Number(budget))}
                data-context-apply-budget
              >
                {c.applyBudget}
              </button>
            </div>
            {index.trimmed?.length ? (
              <ul className="cx-trimmed">
                {index.trimmed.map((line) => (
                  <li key={line} data-context-trimmed>
                    · {line}
                  </li>
                ))}
              </ul>
            ) : context.sizes.budgetChars === 0 ? (
              <div className="cx-echo">
                {c.budgetZero}
              </div>
            ) : (
              <div className="cx-echo">
                {c.noTrim}
              </div>
            )}
            {/* 单列：两列会把"34（18 个没用…）"挤成一字一行 */}
            <div className="cx-totals">
              <Row k={c.nodes} v={c.nodesVal(fmt(index.totals.nodes), fmt(index.totals.reachableNodes))} />
              <Row k={c.framesSections} v={`${index.totals.frames} / ${index.totals.sections}`} />
              <Row
                k={c.components}
                v={c.componentsVal(index.totals.components, index.totals.instances, index.totals.unusedComponents)}
              />
              <Row k={c.assets} v={c.assetsVal(index.totals.assets, index.totals.orphanAssets)} />
              <Row
                k={c.tokens}
                v={c.tokensVal(index.totals.tokens, index.totals.unusedTokens, index.totals.undeclaredTokenRefs)}
              />
              <Row k={c.interactionsEdges} v={`${index.totals.interactions} / ${fmt(index.totals.edges)}`} />
            </div>
            {index.totals.unreachableNodes > 0 ? (
              <div className="cx-warnBox">
                {c.unreachableMsg(index.totals.unreachableNodes)}
              </div>
            ) : null}
          </section>

          <section className="cx-sectionTitle">
            <div className="cx-note">{c.pageCatalog}</div>
            {index.pages.map((page) => (
              <div
                key={page.id}
                className="cx-pageCard"
                data-context-page={page.name}
              >
                <span className="cx-pageName">
                  {page.name}
                  {page.route ? <span className="cx-pageRoute"> · {page.route}</span> : null}
                </span>
                <span className="cx-pageMeta">
                  {c.pageMeta(page.nodeCount, page.frames, page.sections, page.tokens, page.interactions)}
                </span>
              </div>
            ))}
          </section>

          <section className="cx-sectionTitle">
            <div className="cx-note">{c.restOfProject}</div>
            <Row
              k={c.world}
              v={
                context.world.present
                  ? `${context.world.name}：${context.world.kinds
                      .filter((k) => k.count > 0)
                      .map((k) => `${label(k.kind)} ${k.count}`)
                      .join(c.join) || c.noEntries} · ${c.worldLinks(context.world.links)}`
                  : context.world.reason
                    ? c.worldUnreadable(context.world.reason)
                    : c.noWorldDoc
              }
            />
            <Row
              k={c.characters}
              v={c.charactersVal(context.characters.count, context.characters.unreadable.length)}
            />
            <Row
              k={c.memory}
              v={
                context.memory.total === 0
                  ? c.none
                  : context.memory.scopes
                      .filter((s) => s.count > 0)
                      .map((s) => `${label(s.scope)} ${s.count}`)
                      .join(c.join) || c.none
              }
            />
            <Row
              k={c.assetsLabel}
              v={
                context.assets.count === 0
                  ? c.assetNone
                  : context.assets.kinds.map((k) => `${label(k.kind)} ${k.count}`).join(c.join)
              }
            />
            <Row
              k={c.corpusLabel}
              v={c.corpusVal(context.knowledge.chunks, context.knowledge.vectorAvailable)}
            />
            {/* §49 × §66-71：AI 请求会拿本轮提示词去语料库取内容，这里给同一个入口试一次，
                让"面板看到的上下文"与"发出去的上下文"是同一份装配，而不是两套说法 */}
            <div className="cx-corpus" data-context-corpus>
              <div className="cx-corpusRow">
                <input
                  value={corpusQuery}
                  onChange={(e) => setCorpusQuery(e.target.value)}
                  placeholder={c.corpusPlaceholder}
                  aria-label={c.corpusAria}
                  data-context-corpus-input
                  className="cx-input"
                />
                <button
                  type="button"
                  disabled={busy || !corpusQuery.trim()}
                  onClick={() => void load(null, corpusQuery)}
                  data-context-corpus-run
                  className="cx-ghost"
                >
                  {c.corpusRun}
                </button>
              </div>
              {context.corpus.query ? (
                <p className="cx-corpusSummary" data-context-corpus-summary>
                  {c.corpusSummary(context.corpus.query, context.corpus.used, context.corpus.candidates)}
                  {context.corpus.omitted > 0 ? c.omittedSuffix(context.corpus.omitted) : ''}
                </p>
              ) : (
                <p className="cx-corpusSummary" data-context-corpus-none>
                  {c.corpusNone}
                </p>
              )}
              {context.corpus.items.map((item) => (
                <div key={`${item.sourceId}#${item.chunkIndex}`} className="cx-corpusItem">
                  <p className="cx-corpusExcerpt" data-context-corpus-item={item.sourceId}>
                    <span className="cx-mono">{item.title}</span>
                    {` · ${c.matchedBy} ${item.matchedBy.join('+')} · ${c.score} ${item.score.toFixed(2)}\n${item.excerpt}`}
                  </p>
                  <button
                    type="button"
                    disabled={block?.busy === true}
                    onClick={() => void readBlock(item.sourceType, item.sourceId)}
                    data-context-block-run={item.sourceId}
                    className="cx-miniBtn"
                  >
                    {c.readBlock}
                  </button>
                </div>
              ))}
              {block ? (
                <div className="cx-block" data-context-block>
                  {block.busy ? <p className="cx-corpusSummary">{c.blockReading}</p> : null}
                  {block.error ? (
                    <p className="cx-corpusSummary cx-dangerText" data-context-block-error>
                      {block.error}
                    </p>
                  ) : null}
                  {!block.busy && !block.error
                    ? block.blocks.map((b) => (
                        <p
                          key={`${block.sourceId}#${b.chunkIndex}`}
                          className="cx-blockText"
                          data-context-block-text={String(b.chunkIndex)}
                        >
                          {b.content}
                          {`\n${c.blockMeta(b.chunkIndex + 1, block.blocks.length, b.tokens)}`}
                        </p>
                      ))
                    : null}
                  {!block.busy && !block.error && block.blocks.length === 0 ? (
                    <p className="cx-corpusSummary" data-context-block-empty>
                      {c.blockEmpty}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {context.corpus.query !== null && context.corpus.items.length === 0 ? (
                <p className="cx-corpusSummary" data-context-corpus-empty>
                  {c.corpusEmpty}
                </p>
              ) : null}
            </div>
            <Row
              k={c.publishing}
              v={
                context.publishing.published
                  ? `${context.publishing.visibility} · ${context.publishing.path} · v${context.publishing.version}`
                  : c.unpublished
              }
            />
            <Row
              k={c.recentChanges}
              v={
                context.recentChanges.length === 0
                  ? c.noSnapshots
                  : context.recentChanges
                      .slice(0, 3)
                      .map((s) => c.recentChangesVal(s))
                      .join(c.join)
              }
            />
          </section>

          <section className="cx-sectionTitle">
            <div className="cx-note">{c.projectMap}</div>
            {context.branches.map((branch) => (
              <div key={branch.name} className="cx-branch" data-context-branch={branch.name}>
                <div className="cx-branchRow">
                  <span className="cx-branchName">{branch.name}</span>
                  <span
                    className={cn(
                      'cx-pill',
                      branch.status === 'indexed' && 'cx-pillIndexed',
                      branch.status === 'partial' && 'cx-pillPartial',
                      branch.status === 'not-indexed' && 'cx-pillUnset',
                    )}
                  >
                    {c.status[branch.status] ?? branch.status}
                  </span>
                </div>
                <div className="cx-branchNote">{branch.note}</div>
              </div>
            ))}
          </section>

          <section className="cx-sectionTitle">
            <div className="cx-note">{c.notCarried}</div>
            <ul className="cx-muted">
              {context.unavailable.map((line) => (
                <li key={line} data-context-unavailable>
                  · {line}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <div className="cx-echo">{busy ? c.assembling : c.idle}</div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="cx-row">
      <span className="cx-rowKey">{k}</span>
      <span className="cx-rowVal">{v}</span>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
