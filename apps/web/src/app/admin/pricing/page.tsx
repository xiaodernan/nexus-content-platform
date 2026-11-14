import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { BrandTitle } from '@/components/BrandTitle';
import { readCostLedger, clampWindowHours } from '@/server/domain/costLedger';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  scopeNote: (hours: number, start: string) => string;
  weekLink: string;
  summaryTitle: string;
  statRows: string;
  statTotalUsd: string;
  statCachedShare: string;
  unknownBold: string;
  unknownRest: string;
  emptyWindowNote: string;
  basisTitle: string;
  colSource: string;
  colCount: string;
  colSumUsd: string;
  colAvgUsd: string;
  colSumTokens: string;
  colCachedShare: string;
  modelTitle: string;
  colProvider: string;
  colModel: string;
  colConfigured: string;
  colUnknown: string;
  modelNote: string;
  whyNotPricesTitle: string;
  whyNotPrices: string;
}> = {
  zh: {
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：账目只对 role=admin 可见。`,
    title: 'AI 成本',
    scopeNote: (hours, start) => `按 costBasis 分账 · 最近 ${hours} 小时（${start} 起算）· 只读，不消费 provider`,
    weekLink: '切到最近 7 天 →',
    summaryTitle: '这一个窗口里，钱是从哪来的',
    statRows: '行带 usage 的任务（有报账的）',
    statTotalUsd: 'ΣcostUsd · 报过账的行合计',
    statCachedShare: '输入 token 命中缓存占比（请求份额，不是字节份额）',
    unknownBold: 'unknown 不是「免费」',
    unknownRest: '那是当刻没配价目表——金额按 0 记，但意义是「不知道」。configured：该时刻 ai-service 的 NEXUS_LLM_PRICES 能配出价来。legacy：这行是 §COST-1 落库之前写的，没有 costBasis 这一维。',
    emptyWindowNote: ' 这一窗口还没有任何带账的行——账是空的，不是零。',
    basisTitle: '按来源（costBasis）拆',
    colSource: '来源',
    colCount: '行数',
    colSumUsd: 'ΣcostUsd',
    colAvgUsd: '均价/行',
    colSumTokens: 'Σ tokensIn',
    colCachedShare: '缓存占比',
    modelTitle: '按模型拆',
    colProvider: 'provider',
    colModel: 'model',
    colConfigured: 'configured',
    colUnknown: 'unknown',
    modelNote: '价目表不在本页显示——它只活在 ai-service 进程的环境里（NEXUS_LLM_PRICES）。本页回答的是「钱是从哪来的」，不是「这条线多少钱」。真要调价，去改环境变量然后重启 ai-service。',
    whyNotPricesTitle: '为什么不显示价格',
    whyNotPrices: '单价随模型、供应商、折扣、账期变化（§COST-1）。本仓不内置任何默认价目——没有配 NEXUS_LLM_PRICES 时，金额一律按 0 记并标 unknown，界面显示「未计价」而不是 $0.0000。本页只把账本抄进来：',
  },
  en: {
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): the ledger is visible only to role=admin.`,
    title: 'AI Costs',
    scopeNote: (hours, start) => `Split by costBasis · last ${hours} h (from ${start}) · read-only, no provider consumption`,
    weekLink: 'Switch to last 7 days →',
    summaryTitle: 'Where the money came from in this window',
    statRows: 'Rows with usage (priced)',
    statTotalUsd: 'ΣcostUsd · rows that reported',
    statCachedShare: 'Input tokens served from cache (request share, not byte share)',
    unknownBold: 'unknown is not “free”',
    unknownRest: ' — the price list was not configured at that moment: amounts count as 0, meaning “unknown”. configured: the ai-service NEXUS_LLM_PRICES at that moment could price it. legacy: the row predates §COST-1, so no costBasis dimension exists.',
    emptyWindowNote: ' This window has no priced rows yet — the ledger is empty, not zero.',
    basisTitle: 'Split by source (costBasis)',
    colSource: 'Source',
    colCount: 'Rows',
    colSumUsd: 'ΣcostUsd',
    colAvgUsd: 'Avg / row',
    colSumTokens: 'Σ tokensIn',
    colCachedShare: 'Cache share',
    modelTitle: 'Split by model',
    colProvider: 'provider',
    colModel: 'model',
    colConfigured: 'configured',
    colUnknown: 'unknown',
    modelNote: 'The price list itself is not shown here — it lives only in the ai-service process environment (NEXUS_LLM_PRICES). This page answers “where did the money come from”, not “what does this line cost”. To change prices, edit the env var and restart ai-service.',
    whyNotPricesTitle: 'Why no prices are shown',
    whyNotPrices: 'Unit prices vary by model, vendor, discount and billing period (§COST-1). This repo ships no default price list — without NEXUS_LLM_PRICES, amounts are recorded as 0 and tagged unknown, and the UI shows “unpriced”, not $0.0000. This page only copies the ledger:',
  },
};

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
 *
 * v768：双语（getLocale）。
 */
export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ hours?: string }>;
}) {
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
          <BrandTitle>{c.title}</BrandTitle>
          <p className="adm-capNote" data-pricing-scope>
            {c.scopeNote(hours, new Date(ledger.windowStart).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false }))}
          </p>
        </div>
        <div className="am-headRowTight">
          <AdminNav current="pricing" />
          <Link href="/admin/pricing?hours=168" className="am-linkImplicit" data-pricing-week>
            {c.weekLink}
          </Link>
        </div>
      </header>

      <section className="am-audit" data-pricing-summary>
        <h2 className="am-sectionHeadSm">{c.summaryTitle}</h2>
        <div className="am-ledgerGrid">
          <div className="am-statCell">
            <p className="am-statValue" data-pricing-total-rows>{ledger.rows}</p>
            <p className="am-statLabel">{c.statRows}</p>
          </div>
          <div className="am-statCell">
            <p className="am-statValue" data-pricing-total-usd>${ledger.totalUsd.toFixed(6)}</p>
            <p className="am-statLabel">{c.statTotalUsd}</p>
          </div>
          <div className="am-statCell">
            <p className="am-statValue" data-pricing-cached-share>{cachedShare === null ? '—' : `${cachedShare}%`}</p>
            <p className="am-statLabel">{c.statCachedShare}</p>
          </div>
        </div>
        <p className="adm-capNote">
          <strong>{c.unknownBold}</strong>：{c.unknownRest}
          {ledger.rows === 0 && c.emptyWindowNote}
        </p>
      </section>

      {ledger.rows > 0 && (
        <section className="am-audit">
          <h2 className="am-sectionHeadSm" data-pricing-basis-heading>{c.basisTitle}</h2>
          <table className="am-tableNarrow">
            <thead className="tl-thRow">
              <tr>
                <th>{c.colSource}</th>
                <th>{c.colCount}</th>
                <th>{c.colSumUsd}</th>
                <th>{c.colAvgUsd}</th>
                <th>{c.colSumTokens}</th>
                <th>{c.colCachedShare}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.byBasis.map((r) => (
                <tr key={r.basis} data-pricing-basis-row={r.basis}>
                  <td className="am-monoCell">{r.basis}</td>
                  <td>{r.n}</td>
                  <td className="am-monoCell">${r.sumUsd.toFixed(6)}</td>
                  <td className="am-monoCell">{r.avgUsd === null ? '—' : `$${r.avgUsd.toFixed(8)}`}</td>
                  <td className="am-monoCell">{Math.round(r.sumTokensIn).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}</td>
                  <td>{r.cachedSharePct === null ? '—' : `${r.cachedSharePct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {ledger.rows > 0 && (
        <section className="am-audit">
          <h2 className="am-sectionHeadSm" data-pricing-model-heading>{c.modelTitle}</h2>
          <table className="am-tableNarrow">
            <thead className="tl-thRow">
              <tr>
                <th>{c.colProvider}</th>
                <th>{c.colModel}</th>
                <th>{c.colCount}</th>
                <th>{c.colSumUsd}</th>
                <th>{c.colConfigured}</th>
                <th>{c.colUnknown}</th>
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
            {c.modelNote}
          </p>
        </section>
      )}

      <section className="am-audit">
        <h2 className="am-sectionHeadSm">{c.whyNotPricesTitle}</h2>
        <p className="adm-capNote">
          {c.whyNotPrices}
          <strong>{locale === 'en'
            ? ' whatever seal (configured / unknown / legacy) the ledger shows, this page shows the same seal'
            : '账本上盖了什么章（configured / unknown / legacy），这里就照实显示什么章'}</strong>。
        </p>
      </section>
    </main>
  );
}
