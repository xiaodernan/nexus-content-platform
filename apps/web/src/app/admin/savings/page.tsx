import Link from 'next/link';
import type { ReactElement } from 'react';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { BrandTitle } from '@/components/BrandTitle';
import { readTopSavingsProjects, readTopSavingsUsers, readRenderCountTotals, type SavingsAdminRow, type SavingsAdminUserRow, type RenderCountTotals } from '@/server/domain/llm-savings-admin';
import { formatRate, formatTokensCompact, formatTokensCompactEn, hitRate, weightedHitRate } from '@/lib/llmSavingsAdmin';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  scopeNote: string;
  unavailable: string;
  empty: string;
  summaryTitle: string;
  statProjects: string;
  statRealTurns: string;
  statCached: string;
  statWeightedRate: string;
  tableHeading: string;
  tableAria: string;
  colProject: string;
  colOwner: string;
  colTurns: string;
  turnsPair: (turns: number, realTurns: number) => string;
  colTokensIn: string;
  colCached: string;
  colHitRate: string;
  barAria: (rate: string) => string;
  footNote: string;
  byUserTitle: string;
  byUserUnavailable: string;
  byUserEmpty: string;
  userTableAria: string;
  colUser: string;
  userBarAria: (rate: string) => string;
  renderTitle: string;
  renderNote: string;
  renderRenders: string;
  renderShots: string;
  renderCards: string;
  renderWholePiece: string;
  renderPortraits: string;
  renderUnavailable: string;
  renderEmpty: string;
}> = {
  zh: {
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：节省总账只对 role=admin 可见。`,
    title: 'AI 节省总账',
    scopeNote: '按项目聚合 provider 前缀缓存复用的 prompt token｜只计 v692 后写入的行（更早行按 0 计）· 应用级 Redis 完成缓存不计入此数 · 只读，不消费 provider',
    unavailable: '读不到账本（聚合失败）。这台实例可能刚重启或库正在抖——数字不瞎，刷新再看。',
    empty: '这个库里还没有任何带 usage 的任务行——跑一次真模型请求之后，这张表会自己长出内容。',
    summaryTitle: '这个窗口里，缓存替你省了什么',
    statProjects: '项目数（有用量）',
    statRealTurns: '真模型轮次合计',
    statCached: '缓存复用合计',
    statWeightedRate: '加权命中率',
    tableHeading: '按缓存复用排序（前 50 个项目）',
    tableAria: 'AI 节省总账表（可横向滚动）',
    colProject: '项目',
    colOwner: '所有者',
    colTurns: '轮次（真）',
    turnsPair: (turns, realTurns) => `${turns}（${realTurns}）`,
    colTokensIn: 'tokensIn 合计',
    colCached: '缓存复用',
    colHitRate: '命中率',
    barAria: (rate) => `缓存复用占输入 token 的 ${rate}`,
    footNote: '口径：provider prompt_tokens_details.cached_tokens（usage jsonb）；tokensIn ≈ prompt_tokens（含缓存部分）；命中率 = cached ÷ tokensIn，封顶 1。只对 role=admin 可见；任何一行读不出来就是该行按 0 计，不让整表垮。',
    byUserTitle: '按用户（按缓存复用排序，前 25 位）',
    byUserUnavailable: '读不到用户维度的账（聚合失败）。项目维度不受影响，刷新再看。',
    byUserEmpty: '还没有哪一位用户的任务行带 usage——跑一次真模型请求之后这张表会自己长出来。',
    userTableAria: '按用户聚合的 AI 节省表（可横向滚动）',
    colUser: '用户',
    userBarAria: (rate) => `该用户缓存复用占输入 token 的 ${rate}`,
    renderTitle: '渲染账（video.render 累计）',
    renderNote: '口径：agent_tasks 里 agentKey = video.render 的行求和；角色肖像进像素是 2026-11 起记的 characterPortraitCount，更早的行按 0 不伪造；失败一律抛错——admin 照实说读不到。',
    renderRenders: '渲染次数',
    renderShots: '镜头数合计',
    renderCards: '色卡占位合计',
    renderWholePiece: '整片那张图补了几镜',
    renderPortraits: '肖像进像素了几镜',
    renderUnavailable: '读不到渲染账（聚合失败）。这台实例可能刚重启——数字不瞎，刷新再看。',
    renderEmpty: '库里还没有任何 video.render 行——渲一次分镜 DEMO，这一格就有数了。',
  },
  en: {
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): the savings ledger is visible only to role=admin.`,
    title: 'AI Savings Ledger',
    scopeNote: 'Project-aggregated prompt-token reuse from provider prefix caching | only counts rows written after v692 (older rows count as 0) · the app-level Redis completion cache is not included · read-only, no provider consumption',
    unavailable: 'The ledger cannot be read (aggregation failed). This instance may have just restarted or the library is wobbling — the numbers do not lie, refresh and retry.',
    empty: 'No task row with usage exists in this library yet — run one real model request and this table will grow content by itself.',
    summaryTitle: 'What caching saved you in this window',
    statProjects: 'Projects (with usage)',
    statRealTurns: 'Real model turns, total',
    statCached: 'Cached reuse, total',
    statWeightedRate: 'Weighted hit rate',
    tableHeading: 'Sorted by cached reuse (top 50 projects)',
    tableAria: 'AI savings ledger table (horizontally scrollable)',
    colProject: 'Project',
    colOwner: 'Owner',
    colTurns: 'Turns (real)',
    turnsPair: (turns, realTurns) => `${turns} (${realTurns})`,
    colTokensIn: 'tokensIn total',
    colCached: 'Cached reuse',
    colHitRate: 'Hit rate',
    barAria: (rate) => `Cache reuse as share of input tokens: ${rate}`,
    footNote: 'Definition: provider prompt_tokens_details.cached_tokens (usage jsonb); tokensIn ≈ prompt_tokens (including the cached part); hit rate = cached ÷ tokensIn, capped at 1. Visible to role=admin only; any unreadable row counts as 0 for that row — the whole table never collapses.',
    byUserTitle: 'By user (sorted by cached reuse, top 25)',
    byUserUnavailable: 'The per-user ledger cannot be read (aggregation failed). The per-project table is unaffected — refresh and retry.',
    byUserEmpty: 'No user’s task rows carry usage yet — run one real model request and this table will grow by itself.',
    userTableAria: 'Per-user AI savings table (horizontally scrollable)',
    colUser: 'User',
    userBarAria: (rate) => `This user’s cache reuse as share of input tokens: ${rate}`,
    renderTitle: 'Render ledger (video.render, all time)',
    renderNote: 'Definition: agent_tasks rows where agentKey = video.render, summed; characterPortraitCount entered the books in Nov 2026, older rows count as 0 (no fabrication); failures throw — the page says the read is unavailable.',
    renderRenders: 'Renders',
    renderShots: 'Shots, total',
    renderCards: 'Card placeholders, total',
    renderWholePiece: 'Shots fed by the whole-piece image',
    renderPortraits: 'Shots fed by character portraits',
    renderUnavailable: 'The render ledger cannot be read (aggregation failed). This instance may have just restarted — the numbers do not lie, refresh and retry.',
    renderEmpty: 'No video.render rows exist yet — render one storyboard DEMO and this section will have numbers.',
  },
};

/**
 * §FE-AS `AI 节省总账`（全行 projects 聚合：运营视角）—— admin 只读。
 *
 * 口径（§3/§159，与 /credits + /tasks 同一口径）：
 * - 数字全部来自 `agent_tasks.usage.cachedTokens` 的 SQL 聚合（v692 后写入的行带该字段；
 *   更早的行 cachedTokens 缺 0——按 0 计，不伪造命中）；
 * - "缓存复用" ≠ "省钱"：本仓没有价格表，不给美元金额；
 * - 聚合不扫数据库边界：按 project 分组 + limit 50 行，usage jsonb 只读三键；
 * - 读侧失败页面照实说 "读不到"，绝不画假表。
 *
 * 只对 role=admin 可见（页面自己判一道，AdminNav 只是导航）。
 *
 * v768：双语（getLocale）。
 */
export default async function AdminSavingsPage(): Promise<ReactElement> {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">
          {c.deniedNotAdmin(user.displayName, user.role)}
        </p>
      </main>
    );
  }

  let rows: SavingsAdminRow[] | null;
  let userRows: SavingsAdminUserRow[] | null;
  try {
    rows = await readTopSavingsProjects(50);
  } catch {
    rows = null;
  }
  try {
    userRows = await readTopSavingsUsers(25);
  } catch {
    userRows = null;
  }
  let renderCounts: RenderCountTotals | null;
  try {
    renderCounts = await readRenderCountTotals();
  } catch {
    renderCounts = null;
  }

  const aggregate =
    rows === null
      ? null
      : {
          projects: rows.length,
          turns: rows.reduce((a, r) => a + r.turns, 0),
          tokensIn: rows.reduce((a, r) => a + r.tokensIn, 0),
          cachedTokens: rows.reduce((a, r) => a + r.cachedTokens, 0),
          weighted: weightedHitRate(rows),
        };

  return (
    <main className="am-shellGapXl" data-savings-root>
      <header className="adm-headBaseline">
        <div>
          <BrandTitle>{c.title}</BrandTitle>
          <p className="adm-capNote" data-savings-scope>
            {c.scopeNote}
          </p>
        </div>
        <AdminNav current="savings" />
      </header>

      {rows === null ? (
        <p className="adm-capNote" data-savings-unavailable>
          {c.unavailable}
        </p>
      ) : aggregate === null ? null : aggregate.projects === 0 ? (
        <p className="adm-capNote" data-savings-empty>
          {c.empty}
        </p>
      ) : (
        <>
          <section className="am-audit" data-savings-summary>
            <h2 className="am-sectionHeadSm">{c.summaryTitle}</h2>
            <div className="am-statGrid">
              <div className="am-statCell">
                <p className="am-statValue" data-savings-total-projects>{aggregate.projects}</p>
                <p className="am-statLabel">{c.statProjects}</p>
              </div>
              <div className="am-statCell">
                <p className="am-statValue" data-savings-total-real>{rows.reduce((a, r) => a + r.realTurns, 0)}</p>
                <p className="am-statLabel">{c.statRealTurns}</p>
              </div>
              <div className="am-statCell">
                <p className="am-statValue" data-savings-total-cached>{locale === 'zh' ? formatTokensCompact(aggregate.cachedTokens) : formatTokensCompactEn(aggregate.cachedTokens)}</p>
                <p className="am-statLabel">{c.statCached}</p>
              </div>
              <div className="am-statCell">
                <p className="am-statValue" data-savings-total-weighted>{formatRate(aggregate.weighted)}</p>
                <p className="am-statLabel">{c.statWeightedRate}</p>
              </div>
            </div>
          </section>

          {renderCounts === null ? (
            <p className="adm-capNote" data-savings-render-unavailable>
              {c.renderUnavailable}
            </p>
          ) : renderCounts.renders === 0 ? (
            <p className="adm-capNote" data-savings-render-empty>
              {c.renderEmpty}
            </p>
          ) : (
            <section className="am-audit" data-savings-render>
              <h2 className="am-sectionHeadSm">{c.renderTitle}</h2>
              <p className="adm-capNote" data-savings-render-note>
                {c.renderNote}
              </p>
              <div className="am-statGrid">
                <div className="am-statCell">
                  <p className="am-statValue" data-savings-render-renders>{renderCounts.renders}</p>
                  <p className="am-statLabel">{c.renderRenders}</p>
                </div>
                <div className="am-statCell">
                  <p className="am-statValue" data-savings-render-shots>{renderCounts.shots}</p>
                  <p className="am-statLabel">{c.renderShots}</p>
                </div>
                <div className="am-statCell">
                  <p className="am-statValue" data-savings-render-cards>{renderCounts.cardCount}</p>
                  <p className="am-statLabel">{c.renderCards}</p>
                </div>
                <div className="am-statCell">
                  <p className="am-statValue" data-savings-render-whole>{renderCounts.sourceReferenceCount}</p>
                  <p className="am-statLabel">{c.renderWholePiece}</p>
                </div>
                <div className="am-statCell">
                  <p className="am-statValue" data-savings-render-portraits>{renderCounts.characterPortraitCount}</p>
                  <p className="am-statLabel">{c.renderPortraits}</p>
                </div>
              </div>
            </section>
          )}

          <section className="am-audit">
            <h2 className="am-sectionHeadSm" data-savings-table-heading>{c.tableHeading}</h2>
            <div className="tl-tableScroll" tabIndex={0} role="region" aria-label={c.tableAria}>
              <table className="am-tableNarrow">
                <thead className="tl-thRow">
                  <tr>
                    <th>{c.colProject}</th>
                    <th>{c.colOwner}</th>
                    <th>{c.colTurns}</th>
                    <th>{c.colTokensIn}</th>
                    <th>{c.colCached}</th>
                    <th>{c.colHitRate}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rate = hitRate(row.tokensIn, row.cachedTokens);
                    const width = rate === null ? 0 : Math.round(rate * 100);
                    return (
                      <tr key={row.projectId} data-savings-row={row.projectId}>
                        <td>
                          <Link href={`/tasks/${row.projectId}`} className="am-linkImplicit" data-savings-name>
                            {row.projectName}
                          </Link>
                        </td>
                        <td className="am-monoCell">{row.ownerEmail ?? '—'}</td>
                        <td>{c.turnsPair(row.turns, row.realTurns)}</td>
                        <td className="am-monoCell">{row.tokensIn.toLocaleString('en-US')}</td>
                        <td className="am-monoCell">{row.cachedTokens.toLocaleString('en-US')}</td>
                        <td>
                          <span className="am-monoCell" data-savings-rate={row.projectId}>{formatRate(rate)}</span>
                          <div
                            className="sv-barTrack"
                            role="img"
                            aria-label={c.barAria(formatRate(rate))}
                            style={{ width: '6rem', display: 'inline-block', verticalAlign: 'middle', marginLeft: 'var(--nexus-space-2)' }}
                          >
                            <div className="sv-barFill" style={{ width: `${width}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="adm-capNote">
              {c.footNote}
            </p>
          </section>

          <section className="am-audit" data-savings-by-user>
            <h2 className="am-sectionHeadSm" data-savings-by-user-heading>{c.byUserTitle}</h2>
            {userRows === null ? (
              <p className="adm-capNote" data-savings-by-user-unavailable>
                {c.byUserUnavailable}
              </p>
            ) : userRows.length === 0 ? (
              <p className="adm-capNote" data-savings-by-user-empty>
                {c.byUserEmpty}
              </p>
            ) : (
              <div className="tl-tableScroll" role="region" aria-label={c.userTableAria} tabIndex={0}>
                <table className="am-tableNarrow">
                  <thead className="tl-thRow">
                    <tr>
                      <th>{c.colUser}</th>
                      <th>{c.statProjects}</th>
                      <th>{c.colTurns}</th>
                      <th>{c.colTokensIn}</th>
                      <th>{c.colCached}</th>
                      <th>{c.colHitRate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userRows.map((row) => {
                      const rate = hitRate(row.tokensIn, row.cachedTokens);
                      const width = rate === null ? 0 : Math.round(rate * 100);
                      return (
                        <tr key={row.ownerId} data-savings-user-row={row.ownerId}>
                          <td className="am-monoCell">{row.ownerEmail ?? '—'}</td>
                          <td>{row.projects}</td>
                          <td>{c.turnsPair(row.turns, row.realTurns)}</td>
                          <td className="am-monoCell">{row.tokensIn.toLocaleString('en-US')}</td>
                          <td className="am-monoCell">{row.cachedTokens.toLocaleString('en-US')}</td>
                          <td>
                            <span className="am-monoCell" data-savings-user-rate={row.ownerId}>{formatRate(rate)}</span>
                            <div
                              className="sv-barTrack"
                              role="img"
                              aria-label={c.userBarAria(formatRate(rate))}
                              style={{ width: '6rem', display: 'inline-block', verticalAlign: 'middle', marginLeft: 'var(--nexus-space-2)' }}
                            >
                              <div className="sv-barFill" style={{ width: `${width}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
