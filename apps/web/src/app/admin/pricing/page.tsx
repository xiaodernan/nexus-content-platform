import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { BrandTitle } from '@/components/BrandTitle';
import { readCostLedger, clampWindowHours } from '@/server/domain/costLedger';

export const dynamic = 'force-dynamic';

/**
 * §COST-1 · AI 成本 ——「这个金额是从哪来的」的只读账本。
 *
 * §COST-1 把 `usage.costUsd` 与它的**来路**一起记进了每一行：
 * `costBasis: 'configured'`（按 ai-service 的 NEXUS_LLM_PRICES 算得出）、
 * `'unknown'`（没配价目表——**那不是免费，是"不知道"**）、以及老账本没有这维的
 * `'legacy'`。这一页把这维从库里抄进来，回答两个问题：
 *   1. 我花掉的每一美元来自哪种口径（表计 vs 未计价）；按什么模型/供应商又分几份
 *   2. 命中缓存到底省了多少 token（basis 一栏的缓存占比是请求份额，不是字节份额，ADR-0262）
 *
 * 页面只读，不写、不改、不连 provider：数字全部来自 `agent_tasks` 的 jsonb `usage`。
 * **价目表不在本页显示**——它在 ai-service 的环境里（NEXUS_LLM_PRICES），
 * 这里刻意只显示「这个金额从哪来的」，不抄价目表本身。
 */
export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ hours?: string }>;
}) {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">AI 成本</h1>
        <p className="adm-deniedText">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">AI 成本</h1>
        <p className="adm-deniedText">
          这个页面对 {user.displayName}（role={user.role}）不开放：账目只对 role=admin 可见。
        </p>
      </main>
    );
  }

  const sp = (await searchParams) ?? {};
  const hours = clampWindowHours(Number.parseInt(sp.hours ?? '24', 10));
  const ledger = await readCostLedger(hours);
  const cachedShare =
    ledger.totalTokensIn > 0 && ledger.totalCachedTokens !== null
      ? Math.round((ledger.totalCachedTokens / ledger.totalTokensIn) * 100)
      : null;

  return (
    <main className="am-shellGapXl" data-pricing-root>
      <header className="adm-headBaseline">
        <div>
          <BrandTitle>AI 成本</BrandTitle>
          <p className="adm-capNote" data-pricing-scope>
            按 costBasis 分账 · 最近 {hours} 小时（{new Date(ledger.windowStart).toLocaleString('zh-CN', { hour12: false })} 起算）· 只读，不消费 provider
          </p>
        </div>
        <div className="am-headRowTight">
          <AdminNav current="pricing" />
          <Link href="/admin/pricing?hours=168" className="am-linkImplicit" data-pricing-week>
            切到最近 7 天 →
          </Link>
        </div>
      </header>

      <section className="am-audit" data-pricing-summary>
        <h2 className="am-sectionHeadSm">这一个窗口里，钱是从哪来的</h2>
        <div className="am-ledgerGrid">
          <div className="am-statCell">
            <p className="am-statValue" data-pricing-total-rows>{ledger.rows}</p>
            <p className="am-statLabel">行带 usage 的任务（有报账的）</p>
          </div>
          <div className="am-statCell">
            <p className="am-statValue" data-pricing-total-usd>${ledger.totalUsd.toFixed(6)}</p>
            <p className="am-statLabel">ΣcostUsd · 报过账的行合计</p>
          </div>
          <div className="am-statCell">
            <p className="am-statValue" data-pricing-cached-share>{cachedShare === null ? '—' : `${cachedShare}%`}</p>
            <p className="am-statLabel">输入 token 命中缓存占比（请求份额，不是字节份额）</p>
          </div>
        </div>
        <p className="adm-capNote">
          <strong>unknown 不是「免费」</strong>：那是当刻没配价目表——金额按 0 记，但意义是「不知道」。
          <strong>configured</strong>：该时刻 ai-service 的 NEXUS_LLM_PRICES 能配出价来。
          <strong>legacy</strong>：这行是 §COST-1 落库之前写的，没有 costBasis 这一维。
          {ledger.rows === 0 && '这一窗口还没有任何带账的行——账是空的，不是零。'}
        </p>
      </section>

      {ledger.rows > 0 && (
        <section className="am-audit">
          <h2 className="am-sectionHeadSm" data-pricing-basis-heading>按来源（costBasis）拆</h2>
          <table className="am-tableNarrow">
            <thead className="tl-thRow">
              <tr>
                <th>来源</th>
                <th>行数</th>
                <th>ΣcostUsd</th>
                <th>均价/行</th>
                <th>Σ tokensIn</th>
                <th>缓存占比</th>
              </tr>
            </thead>
            <tbody>
              {ledger.byBasis.map((r) => (
                <tr key={r.basis} data-pricing-basis-row={r.basis}>
                  <td className="am-monoCell">{r.basis}</td>
                  <td>{r.n}</td>
                  <td className="am-monoCell">${r.sumUsd.toFixed(6)}</td>
                  <td className="am-monoCell">{r.avgUsd === null ? '—' : `$${r.avgUsd.toFixed(8)}`}</td>
                  <td className="am-monoCell">{Math.round(r.sumTokensIn).toLocaleString('zh-CN')}</td>
                  <td>{r.cachedSharePct === null ? '—' : `${r.cachedSharePct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {ledger.rows > 0 && (
        <section className="am-audit">
          <h2 className="am-sectionHeadSm" data-pricing-model-heading>按模型拆</h2>
          <table className="am-tableNarrow">
            <thead className="tl-thRow">
              <tr>
                <th>provider</th>
                <th>model</th>
                <th>行数</th>
                <th>ΣcostUsd</th>
                <th>configured</th>
                <th>unknown</th>
              </tr>
            </thead>
            <tbody>
              {ledger.byModel.map((r) => (
                <tr key={`${r.provider}/${r.model}`} data-pricing-model-row={`${r.provider}/${r.model}`}>
                  <td className="am-monoCell">{r.provider}</td>
                  <td className="am-monoMuted">{r.model}</td>
                  <td>{r.n}</td>
                  <td className="am-monoCell">${r.sumUsd.toFixed(6)}</td>
                  <td>{r.configuredRows}</td>
                  <td>{r.unknownRows}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="adm-capNote">
            价目表不在本页显示——它只活在 ai-service 进程的环境里（NEXUS_LLM_PRICES）。
            本页回答的是「钱是从哪来的」，不是「这条线多少钱」。真要调价，去改环境变量然后重启 ai-service。
          </p>
        </section>
      )}

      <section className="am-audit">
        <h2 className="am-sectionHeadSm">为什么不显示价格</h2>
        <p className="adm-capNote">
          单价随模型、供应商、折扣、账期变化（§COST-1）。本仓不内置任何默认价目——
          没有配 NEXUS_LLM_PRICES 时，金额一律按 0 记并标 <code>unknown</code>，
          界面显示「未计价」而不是 $0.0000。本页只把账本抄进来：
          <strong>账本上盖了什么章（configured / unknown / legacy），这里就照实显示什么章</strong>。
        </p>
      </section>
    </main>
  );
}
