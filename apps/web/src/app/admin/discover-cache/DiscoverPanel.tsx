'use client';

import { useEffect, useState } from 'react';
import type { DiscoverCacheReadout } from '@/server/domain/discover-cache';
import type { Locale } from '@/lib/i18n';

const COPY = {
  zh: {
    loadingAria: '正在读取发现页缓存读数',
    fetchFailedHttp: (status: number, message?: string) => `拉取失败（HTTP ${status}${message ? ` · ${message}` : ''}）`,
    fetchFailedNetwork: '拉取失败（网络错误）',
    kpiGridAria: '缓存概览',
    busAria: '跨实例失效总线',
    generationAria: 'generation 水位线',
    epochAria: '全局世代',
    wavesAria: '发布冷启动波',
    staleAria: '上游故障降级',
    loadAria: '加载耗时观测',
    kpiHitRate: '命中率',
    kpiSize: '缓存条目',
    kpiLoads: '真查库次数',
    kpiLoadsHint: '每次 miss 才打一次 loader',
    kpiInFlight: '在途合并',
    kpiInFlightHint: 'singleflight 当前键数',
    kpiEvictions: (n: string) => `淘汰 ${n} 次`,
    hitsWord: ' 命中 / ',
    missesWord: ' 未命中',
    busAttachedPill: 'bus 在线',
    busDetachedPill: '单机语义',
    errorsNote: '错误合计含本机出站拒发（超界/坏 id 帧没让上线路、对端没丢）、坏帧、线路错误与坏回调；出站拒发不是线路故障。细分拒发次数留待将来真有批量失效调用方时另立分列读数。',
    busDetachedHint: '四账此刻不是 0，是"没有这条线路"——本机屏蔽/关注的即时失效仍照旧工作。',
    refreshError: (updatedAt: string | null, err: string) =>
      `最近一次刷新失败（${err}）；下面仍是 ${updatedAt ?? '上一次'} 读到的账，未清空。`,
    generationSectionTitle: '隐私失效的内存账',
    genLedgerLabel: '单调水位线 globalGen',
    viewerGenerations: 'generation 表 viewer 数',
    ttlLabel: '缓存 TTL',
    ttlConvergence: '未接总线时的收敛上界',
    epochSectionTitle: '内容新鲜度的内存账',
    epochLabel: '全局世代 globalEpoch',
    epochEvery: '每次 +1 作废',
    epochScope: '所有 sort · 所有 viewer · 含匿名',
    wavesTitle: '发布冷启动波 · 只记不拦',
    waveLabel: (epoch: number) => `波 #${epoch}`,
    staleSectionTitle: '上游故障降级 · 只记不声张',
    staleServedLabel: '端出旧页次数 staleServed',
    staleMaxLabel: '旧值上界 staleMaxMs',
    loadSectionTitle: '加载耗时观测 · 只记不设闸',
    loadsTimedLabel: '已计时打库 loadsTimed',
    maxLoadLabel: '最慢一次 maxLoadMs',
    noMeasured: '—（未测）',
    slowLoadsLabel: '超阈值次数 slowLoads',
    slowThresholdLabel: '慢查询阈值 slowLoadMs',
    gapLabel: '发起 − 已计时（卡住的旁证）',
    sampleLabel: (n: number) => `样本 #${n}`,
    epochLedgerLabel: '世代',
    ttlSuffix: 's',
    updatedLabel: '更新于',
    measuredAtLabel: '上游测量时刻',
  },
  en: {
    loadingAria: 'Reading discover-cache stats',
    fetchFailedHttp: (status: number, message?: string) => `Fetch failed (HTTP ${status}${message ? ` · ${message}` : ''})`,
    fetchFailedNetwork: 'Fetch failed (network error)',
    kpiGridAria: 'Cache overview',
    busAria: 'Cross-instance invalidation bus',
    generationAria: 'Generation watermark',
    epochAria: 'Global epoch',
    wavesAria: 'Publish cold-start waves',
    staleAria: 'Upstream fault fallback',
    loadAria: 'Load-duration observation',
    kpiHitRate: 'Hit rate',
    kpiSize: 'Entries',
    kpiLoads: 'Library hits',
    kpiLoadsHint: 'one loader call per miss',
    kpiInFlight: 'In-flight merges',
    kpiInFlightHint: 'singleflight current-key count',
    kpiEvictions: (n: string) => `${n} evictions`,
    hitsWord: ' hits / ',
    missesWord: ' misses',
    busAttachedPill: 'bus online',
    busDetachedPill: 'single-instance semantics',
    errorsNote: 'The error count includes local outbound refusals (oversized/bad-id frames that never hit the wire — the peer loses nothing), bad frames, wire errors, and bad callbacks; outbound refusals are NOT a wire fault. A split-out refusal column waits for a caller with real batch invalidations.',
    busDetachedHint: 'The four ledgers are not 0 right now — there is no wire. Local block/follow invalidation keeps working instantly regardless.',
    refreshError: (updatedAt: string | null, err: string) =>
      `Last refresh failed (${err}); the panel still shows the ledger read at ${updatedAt ?? 'last time'}, nothing cleared.`,
    generationSectionTitle: 'Memory ledger of private invalidation',
    genLedgerLabel: 'monotonic watermark globalGen',
    viewerGenerations: 'generation table viewers',
    ttlLabel: 'cache TTL',
    ttlConvergence: 'convergence ceiling when no bus',
    epochSectionTitle: 'Memory ledger of content freshness',
    epochLabel: 'global epoch globalEpoch',
    epochEvery: 'invalidates on every +1',
    epochScope: 'all sorts · all viewers · incl. anonymous',
    wavesTitle: 'Publish cold-start waves · observe, never block',
    waveLabel: (epoch: number) => `Wave #${epoch}`,
    staleSectionTitle: 'Upstream fault fallback · observe, never shout',
    staleServedLabel: 'stale pages served staleServed',
    staleMaxLabel: 'stale ceiling staleMaxMs',
    loadSectionTitle: 'Load duration · observe, never set a gate',
    loadsTimedLabel: 'timed library hits loadsTimed',
    maxLoadLabel: 'slowest single load maxLoadMs',
    noMeasured: '— (unmeasured)',
    slowLoadsLabel: 'above threshold slowLoads',
    slowThresholdLabel: 'slow-query threshold slowLoadMs',
    gapLabel: 'initiated − timed (corroboration of stuck)',
    sampleLabel: (n: number) => `Sample #${n}`,
    epochLedgerLabel: 'epoch',
    ttlSuffix: 's',
    updatedLabel: 'Updated',
    measuredAtLabel: 'measured at',
  },
} as const;
import { busTag, dashOr, epochNote, footNote, generationNote, hitRate, isKnownReadout, loadNote, loadRow, loadTimingHeadline, pollAllowed, staleNote, waveNote, waveRow, wavesHeadline } from './discover-view';

/**
 * §SC-43 面板：把这一台实例的发现页缓存账与跨实例总线账渲染出来，每 4 秒问一次
 * `/api/admin/discover-cache`。四条与 `/admin/gateway` 同一口径的诚实：
 * - 拉取失败说"拉取失败"，**不画成 0、也不清空上一帧**——一次失败的读什么都没证明，旧账带日期；
 * - `bus:null`（单机/未接）渲染成单独一档中性说法，**绝不画成 published/received/errors/applied 四个 0**；
 * - 命中率分母为 0 说"还没有读"，不说 0%；
 * - **后台标签暂停轮询**（visibilitychange），回前台立刻补一发。
 *
 * 视觉全部复用 §SC-40 已证的 `.gw-` 层（卡片渐变描边 / 状态灯 color-mix 柔光 / 骨架 shimmer /
 * 浮现呼吸），状态色只出现在圆点上、旁边文字一律中性 fg-*，故浅色也过 WCAG AA、不触
 * style-tokens 的"强调色当文字"硬门。零新增颜色 token、零 CSS Module、零组件渲染库。
 * 展示判据抽在 `discover-view.ts`，本组件只消费。
 */

const POLL_MS = 4000;

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="gw-card" data-discover-kpi={label}>
      <div className="gw-kpiLabel">{label}</div>
      <div className="gw-kpiValue">{value}</div>
      {hint ? <div className="gw-kpiHint">{hint}</div> : null}
    </div>
  );
}

function LedgerRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="dc-ledgerRow" data-discover-ledger={label}>
      <span className="dc-ledgerLabel">{label}</span>
      <span className={mono ? 'gw-ident' : 'am-mutedText'}>{value}</span>
    </div>
  );
}

export function DiscoverPanel({ initial, initialError, locale = 'zh' }: { initial: DiscoverCacheReadout | null; initialError: string | null; locale?: Locale }) {
  const c = COPY[locale];
  const [readout, setReadout] = useState<DiscoverCacheReadout | null>(initial);
  const [error, setError] = useState<string | null>(initialError);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initial ? new Date().toLocaleTimeString('zh-CN', { hour12: false }) : null);

  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      if (!pollAllowed(document.visibilityState)) return; // 后台不发（判据在 discover-view.pollAllowed）
      try {
        const res = await fetch('/api/admin/discover-cache', { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !isKnownReadout(body)) {
          setError(c.fetchFailedHttp(res.status, body?.message));
          return; // keepPreviousOnError：不清空上一帧，旧账带 measuredAt 比空白诚实
        }
        setReadout(body);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false }));
      } catch {
        // 不清空 readout 就是"保留上一帧"（语义判据在 discover-view.keepPreviousOnError，
        // 那里钉住"失败的读什么都不证明、旧账带日期比空白诚实"）。effect 里不读 state，
        // 否则 readout 会被拖进依赖、让轮询随每次刷新重建。
        if (alive) setError(c.fetchFailedNetwork);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // 首屏取数都失败、轮询还没回来：骨架屏，不画空账
  if (!readout) {
    return (
      <section data-discover-cache-loading aria-label={c.loadingAria}>
        {error ? (
          <p className="ar-errorNote" data-discover-cache-error>{error}</p>
        ) : (
          <div className="gw-grid">
            {[0, 1, 2, 3].map((i) => <div key={i} className="gw-skeleton" />)}
          </div>
        )}
      </section>
    );
  }

  const { stats, busAttached, busUrlConfigured, measuredAt } = readout;
  const tag = busTag(stats.bus, locale);
  const rate = hitRate(stats.hits, stats.misses, locale);
  const cfg = stats.config;

  return (
    <div className="am-stackXl" data-discover-cache-ready>
      {/* KPI：命中率 + 缓存六账；分母为 0 说"还没有读"，不画 0% */}
      <section className="gw-grid" aria-label={c.kpiGridAria}>
        <Kpi label={c.kpiHitRate} value={rate} hint={`${stats.hits}${c.hitsWord}${stats.misses}${c.missesWord}`} />
        <Kpi label={c.kpiSize} value={`${stats.size}/${cfg.maxEntries}`} hint={c.kpiEvictions(dashOr(stats.evictions))} />
        <Kpi label={c.kpiLoads} value={dashOr(stats.loads, undefined, locale)} hint={c.kpiLoadsHint} />
        <Kpi label={c.kpiInFlight} value={dashOr(stats.inFlight, undefined, locale)} hint={c.kpiInFlightHint} />
      </section>

      {/* 跨实例总线：这一片最要紧的诚实——没接 ≠ 接了但全 0 */}
      <section className="dc-busCard" data-discover-bus={busAttached ? 'attached' : 'detached'} aria-label={c.busAria}>
        <div className="dc-busHead">
          <span className={`gw-dot ${tag.dot}`} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          <span className="dc-busHeadline">{tag.headline}</span>
          <span className="gw-pill" data-discover-bus-attached={busAttached ? 'true' : 'false'}>
            {busAttached ? c.busAttachedPill : c.busDetachedPill}
          </span>
        </div>
        <p className="dc-busDetail">{tag.detail}</p>
        {busAttached && stats.bus ? (
          <>
            <div className="dc-ledgerGrid" data-discover-bus-ledger>
              <LedgerRow label="发出帧 published" value={dashOr(stats.bus.published)} />
              <LedgerRow label="收到帧 received" value={dashOr(stats.bus.received)} />
              <LedgerRow label="错误合计 errors" value={dashOr(stats.bus.errors)} />
              <LedgerRow label="本地处置 applied" value={dashOr(stats.bus.applied)} />
            </div>
            <p className="dc-note" data-discover-errors-note>
              {c.errorsNote}
            </p>
          </>
        ) : (
          <p className="dc-busHint" data-discover-bus-null>
            {c.busDetachedHint}
          </p>
        )}
      </section>

      {error ? (
        <p className="am-warnNote" data-discover-cache-refresh-error>
          {c.refreshError(updatedAt, error)}
        </p>
      ) : null}

      {/* 单调水位线：把 ADR-0113 的方法论结论第一次放到运维眼前 */}
      <section className="am-audit" aria-label={c.generationAria}>
        <h2 className="am-sectionHeadSm">{c.generationSectionTitle}</h2>
        <div className="dc-ledgerGrid" data-discover-generation>
          <LedgerRow label={c.genLedgerLabel} value={dashOr(stats.globalGen, undefined, locale)} />
          <LedgerRow label={c.viewerGenerations} value={`${stats.viewerGenerations}/${cfg.maxViewers}`} />
          <LedgerRow label={c.ttlLabel} value={`${Math.round(cfg.ttlMs / 1000)}${c.ttlSuffix}`} />
          <LedgerRow label={c.ttlConvergence} value="TTL" />
        </div>
        <p className="dc-note" data-discover-generation-note>
          {generationNote(stats.globalGen, stats.viewerGenerations, cfg.maxViewers, locale)}
        </p>
      </section>

      {/* §SC-44 全局世代：把"新作品即时可见"的收益与冷启动代价一起放到运维眼前 */}
      <section className="am-audit" aria-label={c.epochAria}>
        <h2 className="am-sectionHeadSm">{c.epochSectionTitle}</h2>
        <div className="dc-ledgerGrid" data-discover-epoch>
          <LedgerRow label={c.epochLabel} value={dashOr(stats.globalEpoch, undefined, locale)} />
          <LedgerRow label={c.epochEvery} value={c.epochScope} mono={false} />
        </div>
        <p className="dc-note" data-discover-epoch-note>
          {epochNote(stats.globalEpoch, locale)}
        </p>
      </section>

      {/* §SC-45 发布冷启动波：把 ADR-0116 诚实留下的"预期尖峰"从猜测变成可观测数字，只记不拦 */}
      <section className="am-audit" aria-label={c.wavesAria}>
        <h2 className="am-sectionHeadSm">{c.wavesTitle}</h2>
        <p className="am-subNote" data-discover-waves-headline>
          {wavesHeadline(stats.waves, locale)}
        </p>
        {stats.waves.length ? (
          <div className="dc-ledgerGrid" data-discover-waves>
            {stats.waves.map((w) => (
              <LedgerRow
                key={`${w.epoch}-${w.openedAtMs}`}
                label={c.waveLabel(w.epoch)}
                value={waveRow(w, locale)}
                mono={false}
              />
            ))}
          </div>
        ) : null}
        <p className="dc-note" data-discover-waves-note>
          {waveNote(stats.waveConfig.windowMs, stats.waveConfig.capacity, locale)}
        </p>
      </section>

      {/* §SC-46 上游故障降级：DB 抖动时端过几次旧页，0 只表示还没抖过、不是功能没开 */}
      <section className="am-audit" aria-label={c.staleAria}>
        <h2 className="am-sectionHeadSm">{c.staleSectionTitle}</h2>
        <div className="dc-ledgerGrid" data-discover-stale>
          <LedgerRow label={c.staleServedLabel} value={dashOr(stats.staleServed, undefined, locale)} />
          <LedgerRow label={c.staleMaxLabel} value={`${Math.round(cfg.staleMaxMs / 1000)}s`} />
        </div>
        <p className="dc-note" data-discover-stale-note>
          {staleNote(stats.staleServed, cfg.staleMaxMs, locale)}
        </p>
      </section>

      {/* §SC-47 加载耗时观测：先量再治，只记真实打库的墙钟、不设闸；0 = 没量到，不是都很快 */}
      <section className="am-audit" aria-label={c.loadAria}>
        <h2 className="am-sectionHeadSm">{c.loadSectionTitle}</h2>
        <p className="am-subNote" data-discover-load-headline>
          {loadTimingHeadline(stats.loadsTimed, stats.maxLoadMs, stats.slowLoads, locale)}
        </p>
        <div className="dc-ledgerGrid" data-discover-load-timing>
          <LedgerRow label={c.loadsTimedLabel} value={dashOr(stats.loadsTimed, undefined, locale)} />
          <LedgerRow label={c.maxLoadLabel} value={dashOr(stats.maxLoadMs, c.noMeasured, locale)} />
          <LedgerRow label={c.slowLoadsLabel} value={dashOr(stats.slowLoads, undefined, locale)} />
          {/* 慢查询阈值是毫秒粒度（可配 50/100ms），画成秒会得到 "0s" 的谎，故照画毫秒 */}
          <LedgerRow label={c.slowThresholdLabel} value={`${cfg.slowLoadMs}ms`} />
          <LedgerRow label={c.gapLabel} value={dashOr(Math.max(0, stats.loads - stats.loadsTimed), undefined, locale)} />
        </div>
        {stats.recentLoads.length ? (
          <div className="dc-ledgerGrid" data-discover-load-samples>
            {stats.recentLoads.map((d, i) => (
              <LedgerRow key={`${d.atMs}-${i}`} label={c.sampleLabel(i + 1)} value={loadRow(d, locale)} mono={false} />
            ))}
          </div>
        ) : null}
        <p className="dc-note" data-discover-load-note>
          {loadNote(cfg.slowLoadMs, cfg.loadSampleCapacity, locale)}
        </p>
      </section>

      <footer className="adm-capNote" data-discover-cache-footer>
        {c.updatedLabel} {updatedAt ?? '—'} · {c.measuredAtLabel} {new Date(measuredAt).toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })} ·{' '}
        {footNote(busAttached, busUrlConfigured, POLL_MS, locale)}
      </footer>
    </div>
  );
}
