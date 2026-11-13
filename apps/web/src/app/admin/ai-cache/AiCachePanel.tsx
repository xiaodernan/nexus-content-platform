'use client';

import { useEffect, useState } from 'react';
import type { AiCacheReadout } from '@/server/ai/cache-stats';
import { isKnownReadout } from '@/server/ai/cache-stats';
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
function Bar({ split, first, second }: { split: Split; first: string; second: string }) {
  if (split.first === null || split.second === null) {
    return <p className="cx-barEmpty">没有样本，不画比例</p>;
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

export function AiCachePanel({ initial, initialError }: { initial: AiCacheReadout | null; initialError: string | null }) {
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
          setError(`拉取失败（${message}）`);
          return; // 保留上一帧：旧账带 measuredAt 比空白诚实
        }
        setReadout(body);
        setError(null);
      } catch {
        if (alive) setError('拉取失败（网络错误）');
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
  }, []);

  if (!readout) {
    return (
      <section data-ai-cache-loading aria-label="正在读取缓存读数">
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

  const { prefix, appCache, provider } = readout;
  const reqSplit = requestSplit(prefix);
  const provSplit = providerSplit(provider);
  const verdict = verdictOf(readout);
  const text = verdictText(readout);
  const providerCoverage =
    provider.reported + provider.missing > 0
      ? provider.reported / (provider.reported + provider.missing)
      : null;

  return (
    <div className="am-stackXl" data-ai-cache-ready>
      <section className="gw-grid" aria-label="缓存概览">
        <Kpi label="前缀复用率" value={pct(prefix.reuseRate)} hint={prefixHeadline(prefix)} />
        <Kpi label="稳定前缀种类" value={`${prefix.uniquePrefixes}/${prefix.capacity}`} hint={`淘汰 ${prefix.evictions} 次`} />
        <Kpi
          label="应用缓存命中率"
          value={appCache ? pct(appCache.hitRate) : '未启用'}
          hint={appCacheHeadline(appCache)}
        />
        <Kpi label="provider 报账覆盖" value={pct(providerCoverage)} hint={`${provider.reported} 报账 / ${provider.missing} 缺席`} />
      </section>

      {/* 判定卡：这一屏值不值得细看，先给一句结论。左边条颜色随判定变，文字仍中性。 */}
      <section className="cx-verdict" data-ai-cache-verdict={verdict} aria-label="整体判定">
        <div className="cx-verdictHead">
          <span className={`gw-dot ${verdict === 'good' ? 'gw-dotUp' : verdict === 'cold' ? 'gw-dotDown' : 'gw-dotUnknown'}`} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          <span className="cx-verdictHeadline">{text.headline}</span>
          <span className="gw-pill" data-ai-cache-verdict-tag={verdict}>{pct(prefix.reuseRate)}</span>
        </div>
        <p className="cx-verdictDetail">{text.detail}</p>
      </section>

      {/* 一、前缀账：本片唯一与网关无关的硬指标 */}
      <section className="am-audit" aria-label="前缀复用账">
        <h2 className="am-sectionHeadSm">一、前缀复用 · 我们自己的字节算出来的</h2>
        <Bar split={reqSplit} first="建立在见过的前缀上" second="第一次见到这段前缀" />
        <Legend
          first="复用"
          second="首见"
          firstValue={`${prefix.reused} 次`}
          secondValue={`${Math.max(0, prefix.requests - prefix.reused)} 次`}
        />
        <div className="cx-ledgerGrid" data-ai-cache-prefix>
          <LedgerRow label="请求数 requests" value={dashOr(prefix.requests)} />
          <LedgerRow label="复用次数 reused" value={dashOr(prefix.reused)} />
          <LedgerRow label="复用率 reuseRate" value={pct(prefix.reuseRate)} />
          <LedgerRow label="前缀种类 / 上界" value={`${dashOr(prefix.uniquePrefixes)} / ${dashOr(prefix.capacity)}`} />
          <LedgerRow label="淘汰次数 evictions" value={dashOr(prefix.evictions)} />
        </div>
        <p className="cx-note" data-ai-cache-prefix-note>{prefixNote(prefix)}</p>
        <p className="cx-note" data-ai-cache-capacity-note>{capacityNote(prefix)}</p>
      </section>

      {/* 二、应用缓存账：命中 = 0 token、0 网络、<1ms */}
      <section className="am-audit" aria-label="应用缓存账">
        <h2 className="am-sectionHeadSm">二、应用级 completion 缓存</h2>
        {appCache ? (
          <>
            <Bar
              split={{
                first: appCache.hits + appCache.misses > 0 ? (appCache.hits / (appCache.hits + appCache.misses)) * 100 : null,
                second: appCache.hits + appCache.misses > 0 ? (appCache.misses / (appCache.hits + appCache.misses)) * 100 : null,
              }}
              first="命中"
              second="未命中"
            />
            <Legend first="命中" second="未命中" firstValue={`${appCache.hits} 次`} secondValue={`${appCache.misses} 次`} />
            <div className="cx-ledgerGrid" data-ai-cache-app>
              <LedgerRow label="后端 backend" value={appCache.backend} />
              <LedgerRow label="命中率 hitRate" value={pct(appCache.hitRate)} />
              <LedgerRow label="写入 stores" value={dashOr(appCache.stores)} />
              <LedgerRow label="写失败 storesFailed" value={dashOr(appCache.storesFailed)} />
              <LedgerRow label="淘汰 evictions" value={dashOr(appCache.evictions)} />
              <LedgerRow label="共享 shared" value={appCache.shared === null ? '未知' : appCache.shared ? '是' : '否'} mono={false} />
              <LedgerRow label="降级 degraded" value={appCache.degraded === null ? '未知' : appCache.degraded ? '是' : '否'} mono={false} />
              <LedgerRow label="命名空间" value={appCache.namespace ?? '—'} />
            </div>
          </>
        ) : (
          <p className="cx-note" data-ai-cache-app-null>
            这一格不是"0 命中"——是这条路径根本没走缓存。
          </p>
        )}
        <p className="cx-note" data-ai-cache-app-note>{appCacheDetail(appCache)}</p>
      </section>

      {/* 三、provider 报账：缺席 ≠ 命中 0 */}
      <section className="am-audit" aria-label="provider 报账账">
        <h2 className="am-sectionHeadSm">三、provider 报账覆盖度</h2>
        <Bar split={provSplit} first="报账" second="缺席" />
        <Legend first="报账" second="缺席" firstValue={`${provider.reported} 次`} secondValue={`${provider.missing} 次`} />
        <div className="cx-ledgerGrid" data-ai-cache-provider>
          <LedgerRow label="报账次数 reported" value={dashOr(provider.reported)} />
          <LedgerRow label="缺席次数 missing" value={dashOr(provider.missing)} />
          <LedgerRow label="报上来的 cached 合计" value={dashOr(provider.cachedTokensTotal)} />
          <LedgerRow label="同一批 prompt 合计" value={dashOr(provider.promptTokensTotal)} />
          <LedgerRow label="上报命中率 reportedHitRate" value={pct(provider.reportedHitRate)} />
        </div>
        <p className="cx-note" data-ai-cache-provider-note>{providerNote(provider)}</p>
      </section>

      {error ? (
        <p className="am-warnNote" data-ai-cache-refresh-error>
          最近一次刷新失败（{error}）；上面仍是上一次成功取到的账，未清空。
        </p>
      ) : null}

      <footer className="adm-capNote" data-ai-cache-footer>
        {footNote(true, POLL_MS, readout.measuredAt)}
      </footer>
    </div>
  );
}
