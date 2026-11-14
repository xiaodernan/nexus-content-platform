import Link from 'next/link';
import type { ReactElement } from 'react';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { BrandTitle } from '@/components/BrandTitle';
import { readTopSavingsProjects, type SavingsAdminRow } from '@/server/domain/llm-savings-admin';
import { formatRate, formatTokensCompact, hitRate, weightedHitRate } from '@/lib/llmSavingsAdmin';

export const dynamic = 'force-dynamic';

/**
 * v702 「AI 节省总账」：全部项目 prompt 前缀缓存复用的 operator 视图。
 *
 * 纪律（§3 / §159，与 /credits 同一口径）：
 * - 数字全部来自 `agent_tasks.usage.cachedTokens` 的 SQL 聚合（v692 后写入的行带该字段；
 *   更早的行 cachedTokens 缺省为 0——按 0 计，不伪造成命中）；
 * - "缓存复用" ≠ "钱"：本仓没有价格表，不给美元金额；
 * - 聚合不扫出库边界：按 project 分组 + limit 50 行，usage jsonb 只读三键；
 * - 读侧失败页面照实说 "读不到"，绝不画假表。
 */
export default async function AdminSavingsPage(): Promise<ReactElement> {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">AI 节省总账</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">AI 节省总账</h1>
        <p className="mt-2 text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：节省总账只对 role=admin 可见。
        </p>
      </main>
    );
  }

  let rows: SavingsAdminRow[] | null = null;
  try {
    rows = await readTopSavingsProjects(50);
  } catch {
    rows = null;
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
    <main className="mx-auto flex max-w-[1080px] flex-col gap-5 px-6 py-10" data-savings-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <BrandTitle tag="h1" className="relative inline-block text-gradient-brand pb-2 text-24 font-bold tracking-tight">AI 节省总账</BrandTitle>
          <p className="text-11 text-fg-3" data-savings-note>
            按项目聚合 provider 前缀缓存复用的 prompt token；只认 v692 后写入的行（更早行按 0 记）。应用级 Redis 完成缓存不计入此数。
          </p>
        </div>
        <AdminNav current="savings" />
      </header>

      {rows === null ? (
        <p className="text-13 text-danger-ink" data-savings-unavailable>
          读不到账本（聚合失败）。这台实例可能刚重启或库正在抖——数字不猜，刷新再看。
        </p>
      ) : aggregate === null ? null : aggregate.projects === 0 ? (
        <p className="text-13 text-fg-2" data-savings-empty>
          这个库里还没有任何带 usage 的任务行——跑一次真模型请求之后，这张表会自己长出内容。
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" data-savings-tiles>
            <Tile label="项目数（有用量）" value={String(aggregate.projects)} marker="projects" />
            <Tile label="真模型轮次合计" value={String(rows.reduce((a, r) => a + r.realTurns, 0))} marker="real" />
            <Tile label="缓存复用合计" value={formatTokensCompact(aggregate.cachedTokens)} marker="cached" accent />
            <Tile label="加权命中率" value={formatRate(aggregate.weighted)} marker="weighted" />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-13 font-semibold">按缓存复用排序（前 50 个项目）</h2>
            <div className="overflow-x-auto" role="region" aria-label="AI 节省总账表（可横向滚动）" tabIndex={0}>
              <table className="w-full min-w-[640px] text-11">
                <thead className="text-left text-fg-3">
                  <tr>
                    <th className="py-1 pr-3 font-normal">项目</th>
                    <th className="py-1 pr-3 font-normal">所有者</th>
                    <th className="py-1 pr-3 font-normal">轮次（真）</th>
                    <th className="py-1 pr-3 font-normal">tokensIn 合计</th>
                    <th className="py-1 pr-3 font-normal">缓存复用</th>
                    <th className="py-1 font-normal">命中率</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rate = hitRate(row.tokensIn, row.cachedTokens);
                    const width = rate === null ? 0 : Math.round(rate * 100);
                    return (
                      <tr key={row.projectId} data-savings-row={row.projectId} className="border-t border-[var(--nexus-color-border-subtle)]">
                        <td className="py-1.5 pr-3">
                          <Link href={`/tasks/${row.projectId}`} className="text-accent-2-ink underline" data-savings-name>
                            {row.projectName}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3 text-fg-3">{row.ownerEmail ?? '—'}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{row.turns}（{row.realTurns}）</td>
                        <td className="py-1.5 pr-3 tabular-nums">{row.tokensIn.toLocaleString('en-US')}</td>
                        <td className="py-1.5 pr-3 font-medium tabular-nums text-accent-2-ink">{row.cachedTokens.toLocaleString('en-US')}</td>
                        <td className="py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-8 font-mono tabular-nums" data-savings-rate={row.projectId}>{formatRate(rate)}</span>
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--nexus-color-border-subtle)]" aria-hidden="true">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[var(--nexus-color-brand)] via-[var(--nexus-color-accent-1)] to-[var(--nexus-color-accent-2)]"
                                style={{ width: `${width}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-10 leading-relaxed text-fg-4">
              口径：provider prompt_tokens_details.cached_tokens（usage jsonb）；tokensIn ≈ prompt_tokens（含缓存部分）；命中率 = cached ÷ tokensIn，封顶 1。只对 role=admin 可见；任何一行读不懂就是该行按 0 计，不让整表崩。
            </p>
          </section>
        </>
      )}
    </main>
  );
}

function Tile({ label, value, marker, accent = false }: { label: string; value: string; marker: string; accent?: boolean }) {
  return (
    <div className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-3" data-savings-tile={marker}>
      <p className="text-11 text-fg-3">{label}</p>
      <p className={`mt-1 font-mono text-22 font-semibold tabular-nums ${accent ? 'text-gradient-brand inline-block' : 'text-fg-1'}`}>{value}</p>
    </div>
  );
}
