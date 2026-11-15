'use client';

import { useEffect, useState } from 'react';
import type { AiCacheReadout } from '@/server/ai/cache-stats';
import { isKnownReadout } from '@/server/ai/cache-stats';
import type { Locale } from '@/lib/i18n';
import {
  appCacheDetail,
  appCacheHeadline,
  capacityNote,
  dashOr,
  footNote,
  pct,
  prefixHeadline,
  prefixNote,
  providerNote,
  providerSplit,
  requestSplit,
  verdictOf,
  verdictText,
  type Split,
} from './cache-view';

const COPY = {
  zh: {
    loadingAria: '正在读取缓存读数',
    fetchFailedHttp: (message: string) => `拉取失败（${message}）`,
    fetchFailedNetwork: '拉取失败（网络错误）',
    kpiGridAria: '缓存概览',
    summaryAria: '整体判定',
    prefixAria: '前缀复用账',
    appCacheAria: '应用缓存账',
    providerAria: 'provider 报账账',
    barEmpty: '没有样本，不画比例',
    refreshError: (updatedAt: string | null, err: string) =>
      `最近一次刷新失败（${err}）；上面仍是上一次成功取到的账，未清空。`,
    footEvictions: '次',
    kpiReuseRate: '前缀复用率',
    kpiUniquePrefixes: '稳定前缀种类',
    kpiEvictions: (n: number | null | undefined) => `淘汰 ${dashOr(n)} 次`,
    kpiAppCacheHit: '应用缓存命中率',
    kpiNotEnabled: '未启用',
    kpiProviderCoverage: 'provider 报账覆盖',
    kpiReported: '报账',
    kpiMissing: '缺席',
    kpiStream: '流模式（出站 LLM）',
    streamOn: '流式 ON',
    streamOff: '非流 OFF',
    streamUnreported: '未报',
    streamHint: 'ai-service 直报 Settings.llm_stream（env NEXUS_LLM_STREAM，默认 ON）；非流会改变上游 KV 分片分布',
    reusedBadge: (reused: number, total: number) => `${reused} / ${total} 次建立在已见过的前缀上`,
    legendReused: '复用',
    legendFirstSeen: '首见',
    legendHit: '命中',
    legendMiss: '未命中',
    legendReported: '报账',
    legendMissing: '缺席',
    countWord: ' 次',
    prefixSectionTitle: '一、前缀复用 · 我们自己的字节算出来的',
    appCacheSectionTitle: '二、应用级 completion 缓存',
    providerSectionTitle: '三、provider 报账覆盖度',
    ledgerRequests: '请求数 requests',
    ledgerReused: '复用次数 reused',
    ledgerReuseRate: '复用率 reuseRate',
    ledgerUniquePrefixes: '前缀种类 / 上界',
    ledgerEvictions: '淘汰次数 evictions',
    ledgerBackend: '后端 backend',
    ledgerHitRate: '命中率 hitRate',
    ledgerStores: '写入 stores',
    ledgerStoresFailed: '写失败 storesFailed',
    ledgerAppEvictions: '淘汰 evictions',
    ledgerShared: '共享 shared',
    ledgerDegraded: '降级 degraded',
    ledgerNamespace: '命名空间',
    sharedYes: '是',
    sharedNo: '否',
    sharedUnknown: '未知',
    ledgerProviderReported: '报账次数 reported',
    ledgerProviderMissing: '缺席次数 missing',
    ledgerCachedTokens: '报上来的 cached 合计',
    ledgerPromptTokens: '同一批 prompt 合计',
    ledgerReportedRate: '上报命中率 reportedHitRate',
    appCacheNullNote: '这一格不是"0 命中"——是这条路径根本没走缓存。',
  },
  en: {
    loadingAria: 'Reading cache stats',
    fetchFailedHttp: (message: string) => `Fetch failed (${message})`,
    fetchFailedNetwork: 'Fetch failed (network error)',
    kpiGridAria: 'Cache overview',
    summaryAria: 'Overall verdict',
    prefixAria: 'Prefix ledger',
    appCacheAria: 'App cache',
    providerAria: 'Provider reporting',
    barEmpty: 'No samples, no percentage drawn',
    refreshError: (updatedAt: string | null, err: string) =>
      `Last refresh failed (${err}); the panel still shows the last successful read — nothing cleared.`,
    footEvictions: '',
    kpiReuseRate: 'Prefix reuse rate',
    kpiUniquePrefixes: 'Distinct stable prefixes',
    kpiEvictions: (n: number | null | undefined) => `${dashOr(n)} evictions`,
    kpiAppCacheHit: 'App-cache hit rate',
    kpiNotEnabled: 'Not enabled',
    kpiProviderCoverage: 'Provider reporting coverage',
    kpiReported: 'reported',
    kpiMissing: 'missing',
    kpiStream: 'Stream mode (outbound LLM)',
    streamOn: 'Stream ON',
    streamOff: 'Non-stream OFF',
    streamUnreported: 'Unreported',
    streamHint: 'ai-service reports its Settings.llm_stream directly (env NEXUS_LLM_STREAM, default ON); non-stream changes the upstream KV sharding',
    reusedBadge: (reused: number, total: number) => `${reused} / ${total} requests built on a seen prefix`,
    legendReused: 'Reused',
    legendFirstSeen: 'First seen',
    legendHit: 'Hit',
    legendMiss: 'Miss',
    legendReported: 'Reported',
    legendMissing: 'Missing',
    countWord: '',
    prefixSectionTitle: 'I. Prefix reuse — computed from our own bytes',
    appCacheSectionTitle: 'II. App-level completion cache',
    providerSectionTitle: 'III. Provider reporting coverage',
    ledgerRequests: 'requests',
    ledgerReused: 'reused',
    ledgerReuseRate: 'reuse rate',
    ledgerUniquePrefixes: 'prefix kinds / ceiling',
    ledgerEvictions: 'evictions',
    ledgerBackend: 'backend',
    ledgerHitRate: 'hit rate',
    ledgerStores: 'stores',
    ledgerStoresFailed: 'stores failed',
    ledgerAppEvictions: 'evictions',
    ledgerShared: 'shared',
    ledgerDegraded: 'degraded',
    ledgerNamespace: 'namespace',
    sharedYes: 'yes',
    sharedNo: 'no',
    sharedUnknown: 'unknown',
    ledgerProviderReported: 'reported calls',
    ledgerProviderMissing: 'missing calls',
    ledgerCachedTokens: 'reported cached tokens total',
    ledgerPromptTokens: 'prompt tokens total',
    ledgerReportedRate: 'reported hit rate',
    appCacheNullNote: 'This cell is NOT “0 hits” — this path simply never went through the cache.',
  },
} as const;

/**
 * §CACHE-2 `/admin/ai-cache` 面板：把三层缓存账放到运维眼前，每 4 秒问一次
 * `/api/admin/ai-cache`。
 *
 * 四条与 `/admin/discover-cache` 同一口径的诚实：
 * - 拉取失败说"拉取失败"，**不画成 0、也不清空上一帧**——一次失败的读什么都没证明，
 *   旧账带日期比空白诚实；
 * - **`appCache: null`（未启用）单独一档**，绝不画成 `hits/misses` 四个 0；
 * - **比例的分母写进正文**（`provider` 那个命中率的分母只算报过账的样本）；
 * - **后台标签暂停轮询**（visibilitychange），回前台立刻补一发。
 *
 * 视觉复用 §SC-40 的 `.gw-*` 原语（卡片 / KPI / 状态灯 / 骨架 / pill），
 * 本页独有的只有 `.cx-*`（分段条 + 账目行 + 判定卡）。状态色只在圆点与左边条上，
 * 文字一律中性 `fg-*`，故浅色也过 WCAG AA。
 *
 * v771：双语（locale prop 默认 zh）。
 */

const POLL_MS = 4000;

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="gw-card" data-ai-cache-kpi={label}>
      <div className="gw-kpiLabel">{label}</div>
      <div className="gw-kpiValue">{value}</div>
      {hint ? <div className="gw-kpiHint">{hint}</div> : null}
    </div>
  );
}

function LedgerRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="cx-ledgerRow" data-ai-cache-ledger={label}>
      <span className="cx-ledgerLabel">{label}</span>
      <span className={mono ? 'gw-ident' : 'am-mutedText'}>{value}</span>
    </div>
  );
}

/**
 * 分段条。**没有样本时它不画**——一根空条会读成"0%"，而"没有样本"与"0%"是两件事。
 * `role="img"` + `aria-label` 把两段的比例念出来，不让读屏用户只听到一个装饰性 div。
 */
function Bar({ split, first, second, locale }: { split: Split; first: string; second: string; locale: Locale }) {
  if (split.first === null || split.second === null) {
    return <p className="cx-barEmpty">{locale === 'en' ? 'No samples — no percentage drawn' : '没有样本，不画比例'}</p>;
  }
  return (
    <div
      className="cx-bar"
      role="img"
      aria-label={`${first} ${split.first.toFixed(1)}%，${second} ${split.second.toFixed(1)}%`}
    >
      <div className="cx-barFirst" style={{ width: `${split.first}%` }} />
      <div className="cx-barSecond" style={{ width: `${split.second}%` }} />
    </div>
  );
}

function Legend({ first, second, firstValue, secondValue }: { first: string; second: string; firstValue: string; secondValue: string }) {
  return (
    <div className="cx-legend">
      <span className="cx-legendItem">
        <span className="cx-legendDotFirst" aria-hidden="true" />
        {first} <span className="gw-ident">{firstValue}</span>
      </span>
      <span className="cx-legendItem">
        <span className="cx-legendDotSecond" aria-hidden="true" />
        {second} <span className="gw-ident">{secondValue}</span>
      </span>
    </div>
  );
}

export function AiCachePanel({ initial, initialError, locale = 'zh' }: { initial: AiCacheReadout | null; initialError: string | null; locale?: Locale }) {
  const c = COPY[locale];
  const [readout, setReadout] = useState<AiCacheReadout | null>(initial);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      if (document.visibilityState === 'hidden') return; // 后台标签不发
      try {
        const res = await fetch('/api/admin/ai-cache', { cache: 'no-store' });
        const body: unknown = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !isKnownReadout(body)) {
          const message =
            body && typeof body === 'object' && 'message' in body && typeof (body as { message?: unknown }).message === 'string'
              ? (body as { message: string }).message
              : `HTTP ${res.status}`;
          setError(c.fetchFailedHttp(message));
          return; // 保留上一帧：旧账带 measuredAt 比空白诚实
        }
        setReadout(body);
        setError(null);
      } catch {
        if (alive) setError(c.fetchFailedNetwork);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // 仅挂载时起一次 interval；locale 变化带新字符串即够
  }, []);

  if (!readout) {
    return (
      <section data-ai-cache-loading aria-label={c.loadingAria}>
        {error ? (
          <p className="ar-errorNote" data-ai-cache-error>{error}</p>
        ) : (
          <div className="gw-grid">
            {[0, 1, 2, 3].map((i) => <div key={i} className="gw-skeleton" />)}
          </div>
        )}
      </section>
    );
  }

  const { prefix, appCache, provider, transport } = readout;
  const reqSplit = requestSplit(prefix);
  const provSplit = providerSplit(provider);
  const verdict = verdictOf(readout);
  const text = verdictText(readout, locale);
  const providerCoverage =
    provider.reported + provider.missing > 0
      ? provider.reported / (provider.reported + provider.missing)
      : null;

  return (
    <div className="am-stackXl" data-ai-cache-ready>
      <section className="gw-grid" aria-label={c.kpiGridAria}>
        <Kpi label={c.kpiReuseRate} value={pct(prefix.reuseRate, 1, locale)} hint={prefixHeadline(prefix, locale)} />
        <Kpi label={c.kpiUniquePrefixes} value={`${prefix.uniquePrefixes}/${prefix.capacity}`} hint={c.kpiEvictions(prefix.evictions)} />
        <Kpi
          label={c.kpiAppCacheHit}
          value={appCache ? pct(appCache.hitRate, 1, locale) : c.kpiNotEnabled}
          hint={appCacheHeadline(appCache, locale)}
        />
        <Kpi label={c.kpiProviderCoverage} value={pct(providerCoverage, 1, locale)} hint={`${provider.reported} ${c.kpiReported} / ${provider.missing} ${c.kpiMissing}`} />
        <Kpi
          label={c.kpiStream}
          value={transport == null ? c.streamUnreported : transport.stream === true ? c.streamOn : transport.stream === false ? c.streamOff : c.streamUnreported}
          hint={c.streamHint}
        />
      </section>

      {/* 判定卡：这一屏值不值得细看，先给一句结论。左边条颜色随判定变，文字仍中性。 */}
      <section className="cx-verdict" data-ai-cache-verdict={verdict} aria-label={c.summaryAria}>
        <div className="cx-verdictHead">
          <span className={`gw-dot ${verdict === 'good' ? 'gw-dotUp' : verdict === 'cold' ? 'gw-dotDown' : 'gw-dotUnknown'}`} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          <span className="cx-verdictHeadline">{text.headline}</span>
          <span className="gw-pill" data-ai-cache-verdict-tag={verdict}>{pct(prefix.reuseRate, 1, locale)}</span>
        </div>
        <p className="cx-verdictDetail">{text.detail}</p>
      </section>

      {/* 一、前缀账：本片唯一与网关无关的硬指标 */}
      <section className="am-audit" aria-label={c.prefixAria}>
        <h2 className="am-sectionHeadSm">{c.prefixSectionTitle}</h2>
        <Bar split={reqSplit} first={c.legendReused} second={c.legendFirstSeen} locale={locale} />
        <Legend
          first={c.legendReused}
          second={c.legendFirstSeen}
          firstValue={`${prefix.reused}${c.countWord}`}
          secondValue={`${Math.max(0, prefix.requests - prefix.reused)}${c.countWord}`}
        />
        <div className="cx-ledgerGrid" data-ai-cache-prefix>
          <LedgerRow label={c.ledgerRequests} value={dashOr(prefix.requests)} />
          <LedgerRow label={c.ledgerReused} value={dashOr(prefix.reused)} />
          <LedgerRow label={c.ledgerReuseRate} value={pct(prefix.reuseRate, 1, locale)} />
          <LedgerRow label={c.ledgerUniquePrefixes} value={`${dashOr(prefix.uniquePrefixes)} / ${dashOr(prefix.capacity)}`} />
          <LedgerRow label={c.ledgerEvictions} value={dashOr(prefix.evictions)} />
        </div>
        <p className="cx-note" data-ai-cache-prefix-note>{prefixNote(prefix, locale)}</p>
        <p className="cx-note" data-ai-cache-capacity-note>{capacityNote(prefix, locale)}</p>
      </section>

      {/* 二、应用缓存账：命中 = 0 token、0 网络、<1ms */}
      <section className="am-audit" aria-label={c.appCacheAria}>
        <h2 className="am-sectionHeadSm">{c.appCacheSectionTitle}</h2>
        {appCache ? (
          <>
            <Bar
              split={{
                first: appCache.hits + appCache.misses > 0 ? (appCache.hits / (appCache.hits + appCache.misses)) * 100 : null,
                second: appCache.hits + appCache.misses > 0 ? (appCache.misses / (appCache.hits + appCache.misses)) * 100 : null,
              }}
              first={c.legendHit}
              second={c.legendMiss}
              locale={locale}
            />
            <Legend first={c.legendHit} second={c.legendMiss} firstValue={`${appCache.hits}${c.countWord}`} secondValue={`${appCache.misses}${c.countWord}`} />
            <div className="cx-ledgerGrid" data-ai-cache-app>
              <LedgerRow label={c.ledgerBackend} value={appCache.backend} />
              <LedgerRow label={c.ledgerHitRate} value={pct(appCache.hitRate, 1, locale)} />
              <LedgerRow label={c.ledgerStores} value={dashOr(appCache.stores)} />
              <LedgerRow label={c.ledgerStoresFailed} value={dashOr(appCache.storesFailed)} />
              <LedgerRow label={c.ledgerAppEvictions} value={dashOr(appCache.evictions)} />
              <LedgerRow label={c.ledgerShared} value={appCache.shared === null ? c.sharedUnknown : appCache.shared ? c.sharedYes : c.sharedNo} mono={false} />
              <LedgerRow label={c.ledgerDegraded} value={appCache.degraded === null ? c.sharedUnknown : appCache.degraded ? c.sharedYes : c.sharedNo} mono={false} />
              <LedgerRow label={c.ledgerNamespace} value={appCache.namespace ?? '—'} />
            </div>
          </>
        ) : (
          <p className="cx-note" data-ai-cache-app-null>
            {c.appCacheNullNote}
          </p>
        )}
        <p className="cx-note" data-ai-cache-app-note>{appCacheDetail(appCache, locale)}</p>
      </section>

      {/* 三、provider 报账：缺席 ≠ 命中 0 */}
      <section className="am-audit" aria-label={c.providerAria}>
        <h2 className="am-sectionHeadSm">{c.providerSectionTitle}</h2>
        <Bar split={provSplit} first={c.legendReported} second={c.legendMissing} locale={locale} />
        <Legend first={c.legendReported} second={c.legendMissing} firstValue={`${provider.reported}${c.countWord}`} secondValue={`${provider.missing}${c.countWord}`} />
        <div className="cx-ledgerGrid" data-ai-cache-provider>
          <LedgerRow label={c.ledgerProviderReported} value={dashOr(provider.reported)} />
          <LedgerRow label={c.ledgerProviderMissing} value={dashOr(provider.missing)} />
          <LedgerRow label={c.ledgerCachedTokens} value={dashOr(provider.cachedTokensTotal)} />
          <LedgerRow label={c.ledgerPromptTokens} value={dashOr(provider.promptTokensTotal)} />
          <LedgerRow label={c.ledgerReportedRate} value={pct(provider.reportedHitRate, 1, locale)} />
        </div>
        <p className="cx-note" data-ai-cache-provider-note>{providerNote(provider, locale)}</p>
      </section>

      {error ? (
        <p className="am-warnNote" data-ai-cache-refresh-error>
          {c.refreshError(null, error)}
        </p>
      ) : null}

      <footer className="adm-capNote" data-ai-cache-footer>
        {footNote(true, POLL_MS, readout.measuredAt, locale)}
      </footer>
    </div>
  );
}
