'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProjectContextPayload } from '@nexus/schemas';
import { cn } from '@/lib/cn';
import { useStudioReady } from './store';

/**
 * §66-71 Context Engine 的面板：把"Agent 每次该知道的那些事"摊开给人看。
 *
 * 三件事必须写在脸上：
 * 1. 上面三项（选中/页面/视口）来自画布本地，其余来自服务端装配——同一份上下文的两半，来源不同；
 * 2. 目录被预算裁过就明说裁掉了什么，totals 仍是未裁的那份（宁可少列条目，不少报数）；
 * 3. 没落地的分支与没带的信息如实列出来，不拿"还没有"冒充"已经索引好了"（§159）。
 */

const STATUS_LABELS: Record<ProjectContextPayload['branches'][number]['status'], string> = {
  indexed: '已索引',
  partial: '部分',
  'not-indexed': '未索引',
};

const KIND_LABELS: Record<string, string> = {
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
};

const label = (key: string) => KIND_LABELS[key] ?? key;

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function ContextPanel() {
  const studio = useStudioReady();
  const [context, setContext] = useState<ProjectContextPayload | null>(null);
  const [budget, setBudget] = useState('20000');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (chars: number | null) => {
      setBusy(true);
      setMessage(null);
      try {
        const url =
          chars === null
            ? `/api/projects/${studio.projectId}/context`
            : `/api/projects/${studio.projectId}/context?indexChars=${chars}`;
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
    <div className="flex flex-col gap-3 p-3 text-[12px]" data-context-panel>
      <header>
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">上下文（§66-71）</h2>
          <button
            type="button"
            className="rounded border border-white/15 px-2 py-[2px] text-[11px] hover:bg-white/10"
            onClick={() => void load(null)}
            disabled={busy}
            data-context-reload
          >
            重新装配
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-white/45">
          Agent 不该每次从零理解这个项目。这一页摊开的是它每次拿到的那一份目录 —— 不是整份文档。
        </p>
      </header>

      {message ? (
        <div className="rounded border border-red-400/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">
          {message}
        </div>
      ) : null}

      <section className="flex flex-col gap-1 rounded border border-white/10 bg-white/[0.03] p-2" data-context-local>
        <div className="text-[11px] text-white/40">画布本地（服务端这份装配给不了）</div>
        <Row k="当前页面" v={studio.page.name} />
        <Row k="视口" v={studio.viewport === 'design' ? '设计尺寸' : studio.viewport} />
        <Row
          k="选中"
          v={
            studio.selection.length === 0
              ? '没选任何节点'
              : `${studio.selection.length} 个：${selectedNames.join('、')}${
                  studio.selection.length > selectedNames.length ? '…' : ''
                }`
          }
        />
      </section>

      {context && index ? (
        <>
          <section className="flex flex-col gap-1 rounded border border-white/10 bg-white/[0.03] p-2">
            <div className="text-[11px] text-white/40">尺寸（§68）</div>
            {/* 264px 的栏里并排放两组数字必然竖着折行，所以数值单独成行 */}
            <div className="tabular-nums leading-snug" data-context-chars>
              目录 {fmt(indexChars)} / 整份 {fmt(docChars)} 字符（{ratio.toFixed(1)}%）
            </div>
            <div className="text-[11px] text-white/40">目录预算</div>
            <div className="flex items-center gap-2">
              <input
                id="ctx-budget"
                type="number"
                min={0}
                step={1000}
                className="w-20 min-w-0 rounded border border-white/15 bg-black/30 px-1 py-[2px] tabular-nums"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                data-context-budget
              />
              <button
                type="button"
                className="shrink-0 whitespace-nowrap rounded border border-white/15 px-2 py-[2px] text-[11px] hover:bg-white/10"
                onClick={() => void load(Number(budget))}
                disabled={busy || !Number.isFinite(Number(budget))}
                data-context-apply-budget
              >
                按此预算重算
              </button>
            </div>
            {index.trimmed?.length ? (
              <ul className="mt-1 flex flex-col gap-[2px] text-[11px] leading-snug text-amber-200/80">
                {index.trimmed.map((line) => (
                  <li key={line} data-context-trimmed>
                    · {line}
                  </li>
                ))}
              </ul>
            ) : context.sizes.budgetChars === 0 ? (
              <div className="text-[11px] leading-snug text-white/35">
                预算 0 = 关掉裁剪：这一栏只是不裁，不代表目录装得进任何预算。
              </div>
            ) : (
              <div className="text-[11px] leading-snug text-white/35">
                这次没触发裁剪：目录整份放得进预算。
              </div>
            )}
            {/* 单列：两列会把"34（18 个没用…）"挤成一字一行 */}
            <div className="mt-1 flex flex-col gap-[2px] text-[11px]">
              <Row k="节点" v={`${fmt(index.totals.nodes)}（可达 ${fmt(index.totals.reachableNodes)}）`} />
              <Row k="框/段" v={`${index.totals.frames} / ${index.totals.sections}`} />
              <Row
                k="组件"
                v={`${index.totals.components}（引用 ${index.totals.instances}，未用 ${index.totals.unusedComponents}）`}
              />
              <Row k="资产" v={`${index.totals.assets}（未被引用 ${index.totals.orphanAssets}）`} />
              <Row
                k="token"
                v={`${index.totals.tokens}（未用 ${index.totals.unusedTokens}，只引用未声明 ${index.totals.undeclaredTokenRefs}）`}
              />
              <Row k="交互/边" v={`${index.totals.interactions} / ${fmt(index.totals.edges)}`} />
            </div>
            {index.totals.unreachableNodes > 0 ? (
              <div className="mt-1 rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] leading-snug text-amber-100">
                有 {index.totals.unreachableNodes} 个节点从页面根走不到：目录照实计了数，但结构里看不见它们。
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-1">
            <div className="text-[11px] text-white/40">页面目录</div>
            {index.pages.map((page) => (
              <div
                key={page.id}
                className="flex flex-col gap-[2px] rounded border border-white/10 bg-white/[0.02] px-2 py-1"
                data-context-page={page.name}
              >
                <span className="truncate">
                  {page.name}
                  {page.route ? <span className="text-white/35"> · {page.route}</span> : null}
                </span>
                <span className="text-[11px] tabular-nums leading-snug text-white/45">
                  {page.nodeCount} 节点 · 框 {page.frames} · 段 {page.sections} · token {page.tokens} · 交互{' '}
                  {page.interactions}
                </span>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-1">
            <div className="text-[11px] text-white/40">项目其余部分</div>
            <Row
              k="世界"
              v={
                context.world.present
                  ? `${context.world.name}：${context.world.kinds
                      .filter((k) => k.count > 0)
                      .map((k) => `${label(k.kind)} ${k.count}`)
                      .join('、') || '还没有条目'} · ${context.world.links} 条关系`
                  : context.world.reason
                    ? `读不出来：${context.world.reason}`
                    : '还没有世界文档'
              }
            />
            <Row
              k="角色"
              v={`${context.characters.count} 个${
                context.characters.unreadable.length ? `（${context.characters.unreadable.length} 个读不出来）` : ''
              }`}
            />
            <Row
              k="记忆"
              v={
                context.memory.total === 0
                  ? '一条都没有'
                  : context.memory.scopes
                      .filter((s) => s.count > 0)
                      .map((s) => `${label(s.scope)} ${s.count}`)
                      .join('、') || '一条都没有'
              }
            />
            <Row
              k="资产"
              v={
                context.assets.count === 0
                  ? '没有'
                  : context.assets.kinds.map((k) => `${label(k.kind)} ${k.count}`).join('、')
              }
            />
            <Row
              k="语料"
              v={`${context.knowledge.chunks} 块（${
                context.knowledge.vectorAvailable ? '有向量' : '无向量：没有 provider 就没有语义检索'
              }）`}
            />
            <Row
              k="发布"
              v={
                context.publishing.published
                  ? `${context.publishing.visibility} · ${context.publishing.path} · v${context.publishing.version}`
                  : '未发布'
              }
            />
            <Row
              k="最近变更"
              v={
                context.recentChanges.length === 0
                  ? '还没有快照'
                  : context.recentChanges
                      .slice(0, 3)
                      .map((s) => `${s.label ?? s.source}（${s.createdAt.slice(5, 10)}）`)
                      .join('、')
              }
            />
          </section>

          <section className="flex flex-col gap-1">
            <div className="text-[11px] text-white/40">项目图（§71 的七个分支）</div>
            {context.branches.map((branch) => (
              <div key={branch.name} className="flex flex-col gap-[2px]" data-context-branch={branch.name}>
                <div className="flex items-center gap-2">
                  <span className="w-[72px] shrink-0">{branch.name}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded px-[5px] text-[10px]',
                      branch.status === 'indexed' && 'bg-emerald-400/15 text-emerald-200',
                      branch.status === 'partial' && 'bg-amber-400/15 text-amber-200',
                      branch.status === 'not-indexed' && 'bg-white/10 text-white/45',
                    )}
                  >
                    {STATUS_LABELS[branch.status]}
                  </span>
                </div>
                <div className="pl-[80px] text-[11px] leading-snug text-white/40">{branch.note}</div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-1">
            <div className="text-[11px] text-white/40">这次没带的</div>
            <ul className="flex flex-col gap-[3px] text-[11px] leading-snug text-white/45">
              {context.unavailable.map((line) => (
                <li key={line} data-context-unavailable>
                  · {line}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <div className="text-[11px] text-white/35">{busy ? '正在装配…' : '还没有装配结果。'}</div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[72px] shrink-0 text-white/40">{k}</span>
      <span className="min-w-0 flex-1 leading-snug">{v}</span>
    </div>
  );
}
