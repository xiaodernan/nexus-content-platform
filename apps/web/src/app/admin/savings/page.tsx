import Link from 'next/link';
import type { ReactElement } from 'react';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { BrandTitle } from '@/components/BrandTitle';
import { readTopSavingsProjects, readTopSavingsUsers, type SavingsAdminRow, type SavingsAdminUserRow } from '@/server/domain/llm-savings-admin';
import { formatRate, formatTokensCompact, hitRate, weightedHitRate } from '@/lib/llmSavingsAdmin';

export const dynamic = 'force-dynamic';

/**
 * §FE-AS `AI 节省总账`（全行 projects 聚合：运营视角）—— admin 只读。
 *
 * 绾玉槴（§3/§159，与 /credits + /tasks 同一口径）：
 * - 数字全部来自 `agent_tasks.usage.cachedTokens` 的 SQL 聚合（v692 后写入的行带该字段；
 *   更早的行 cachedTokens 缺 0——按 0 计，不伪造命中）；
 * - "缓存复用" ≠ "省钱"：本仓没有价格表，不给美元金额；
 * - 聚合不扫数据库边界：按 project 分组 + limit 50 行，usage jsonb 只读三键；
 * - 读侧失败页面照实说 "读不到"，绝不画假表。
 *
 * 只对 role=admin 可见（页面自己判一道，AdminNav 只是导航）。
 */
export default async function AdminSavingsPage(): Promise<ReactElement> {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">AI 节省总账</h1>
        <p className="adm-deniedText">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">AI 节省总账</h1>
        <p className="adm-deniedText">
          这个页面对 {user.displayName}（role={user.role}）不开放：节省总账只对 role=admin 可见。
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
          <BrandTitle>AI 节省总账</BrandTitle>
          <p className="adm-capNote" data-savings-scope>
            按项目聚合 provider 前缀缓存复用的 prompt token｜只计 v692 后写入的行（更早行按 0 计）· 应用级 Redis 完成缓存不计入此数 · 只读，不消费 provider
          </p>
        </div>
        <AdminNav current="savings" />
      </header>

      {rows === null ? (
        <p className="adm-capNote" data-savings-unavailable>
          读不到账本（聚合失败）。这台实例可能刚重启或库正在抖——数字不瞎，刷新再看。
        </p>
      ) : aggregate === null ? null : aggregate.projects === 0 ? (
        <p className="adm-capNote" data-savings-empty>
          这个库里还没有任何带 usage 的任务行——跑一次真模型请求之后，这张表会自己长出内容。
        </p>
      ) : (
        <>
          <section className="am-audit" data-savings-summary>
            <h2 className="am-sectionHeadSm">这个窗口里，缓存替你省了什么</h2>
            <div className="am-statGrid">
              <div className="am-statCell">
                <p className="am-statValue" data-savings-total-projects>{aggregate.projects}</p>
                <p className="am-statLabel">项目数（有用量）</p>
              </div>
              <div className="am-statCell">
                <p className="am-statValue" data-savings-total-real>{rows.reduce((a, r) => a + r.realTurns, 0)}</p>
                <p className="am-statLabel">真模型轮次合计</p>
              </div>
              <div className="am-statCell">
                <p className="am-statValue" data-savings-total-cached>{formatTokensCompact(aggregate.cachedTokens)}</p>
                <p className="am-statLabel">缓存复用合计</p>
              </div>
              <div className="am-statCell">
                <p className="am-statValue" data-savings-total-weighted>{formatRate(aggregate.weighted)}</p>
                <p className="am-statLabel">加权命中率</p>
              </div>
            </div>
          </section>

          <section className="am-audit">
            <h2 className="am-sectionHeadSm" data-savings-table-heading>按缓存复用排序（前 50 个项目）</h2>
            <div className="tl-tableScroll" tabIndex={0} role="region" aria-label="AI 节省总账表（可横向滚动）">
              <table className="am-tableNarrow">
                <thead className="tl-thRow">
                  <tr>
                    <th>项目</th>
                    <th>所有者</th>
                    <th>轮次（真）</th>
                    <th>tokensIn 合计</th>
                    <th>缓存复用</th>
                    <th>命中率</th>
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
                        <td>{row.turns}（{row.realTurns}）</td>
                        <td className="am-monoCell">{row.tokensIn.toLocaleString('en-US')}</td>
                        <td className="am-monoCell">{row.cachedTokens.toLocaleString('en-US')}</td>
                        <td>
                          <span className="am-monoCell" data-savings-rate={row.projectId}>{formatRate(rate)}</span>
                          <div
                            className="sv-barTrack"
                            role="img"
                            aria-label={`缓存复用占输入 token 的 ${formatRate(rate)}`}
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
              口径：provider prompt_tokens_details.cached_tokens（usage jsonb）；tokensIn ≈ prompt_tokens（含缓存部分）；命中率 = cached ÷ tokensIn，封顶 1。只对 role=admin 可见；任何一行读不出来就是该行按 0 计，不让整表垮。
            </p>
          </section>

          <section className="am-audit" data-savings-by-user>
            <h2 className="am-sectionHeadSm" data-savings-by-user-heading>按用户（按缓存复用排序，前 25 位）</h2>
            {userRows === null ? (
              <p className="adm-capNote" data-savings-by-user-unavailable>
                读不到用户维度的账（聚合失败）。项目维度不受影响，刷新再看。
              </p>
            ) : userRows.length === 0 ? (
              <p className="adm-capNote" data-savings-by-user-empty>
                还没有哪一位用户的任务行带 usage——跑一次真模型请求之后这张表会自己长出来。
              </p>
            ) : (
              <div className="tl-tableScroll" role="region" aria-label="按用户聚合的 AI 节省表（可横向滚动）" tabIndex={0}>
                <table className="am-tableNarrow">
                  <thead className="tl-thRow">
                    <tr>
                      <th>用户</th>
                      <th>项目数</th>
                      <th>轮次（真）</th>
                      <th>tokensIn 合计</th>
                      <th>缓存复用</th>
                      <th>命中率</th>
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
                          <td>{row.turns}（{row.realTurns}）</td>
                          <td className="am-monoCell">{row.tokensIn.toLocaleString('en-US')}</td>
                          <td className="am-monoCell">{row.cachedTokens.toLocaleString('en-US')}</td>
                          <td>
                            <span className="am-monoCell" data-savings-user-rate={row.ownerId}>{formatRate(rate)}</span>
                            <div
                              className="sv-barTrack"
                              role="img"
                              aria-label={`该用户缓存复用占输入 token 的 ${formatRate(rate)}`}
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
