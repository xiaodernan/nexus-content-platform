'use client';

import { useEffect, useState } from 'react';
import type { DiscoverCacheReadout } from '@/server/domain/discover-cache';
import { busTag, dashOr, epochNote, footNote, generationNote, hitRate, isKnownReadout, pollAllowed } from './discover-view';

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
      <span className="text-fg-3">{label}</span>
      <span className={mono ? 'gw-mono text-fg-1' : 'text-fg-2'}>{value}</span>
    </div>
  );
}

export function DiscoverPanel({ initial, initialError }: { initial: DiscoverCacheReadout | null; initialError: string | null }) {
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
          setError(`拉取失败（HTTP ${res.status}${body?.message ? ` · ${body.message}` : ''}）`);
          return; // keepPreviousOnError：不清空上一帧，旧账带 measuredAt 比空白诚实
        }
        setReadout(body);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      } catch {
        // 不清空 readout 就是"保留上一帧"（语义判据在 discover-view.keepPreviousOnError，
        // 那里钉住"失败的读什么都不证明、旧账带日期比空白诚实"）。effect 里不读 state，
        // 否则 readout 会被拖进依赖、让轮询随每次刷新重建。
        if (alive) setError('拉取失败（网络错误）');
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
      <section data-discover-cache-loading aria-label="正在读取发现页缓存读数">
        {error ? (
          <p className="text-13 text-danger-ink" data-discover-cache-error>{error}</p>
        ) : (
          <div className="gw-grid">
            {[0, 1, 2, 3].map((i) => <div key={i} className="gw-skeleton h-[92px]" />)}
          </div>
        )}
      </section>
    );
  }

  const { stats, busAttached, busUrlConfigured, measuredAt } = readout;
  const tag = busTag(stats.bus);
  const rate = hitRate(stats.hits, stats.misses);
  const cfg = stats.config;

  return (
    <div className="flex flex-col gap-5" data-discover-cache-ready>
      {/* KPI：命中率 + 缓存六账；分母为 0 说"还没有读"，不画 0% */}
      <section className="gw-grid" aria-label="缓存概览">
        <Kpi label="命中率" value={rate} hint={`${stats.hits} 命中 / ${stats.misses} 未命中`} />
        <Kpi label="缓存条目" value={`${stats.size}/${cfg.maxEntries}`} hint={`淘汰 ${stats.evictions} 次`} />
        <Kpi label="真查库次数" value={dashOr(stats.loads)} hint="每次 miss 才打一次 loader" />
        <Kpi label="在途合并" value={dashOr(stats.inFlight)} hint="singleflight 当前键数" />
      </section>

      {/* 跨实例总线：这一片最要紧的诚实——没接 ≠ 接了但全 0 */}
      <section className="dc-busCard" data-discover-bus={busAttached ? 'attached' : 'detached'} aria-label="跨实例失效总线">
        <div className="dc-busHead">
          <span className={`gw-dot ${tag.dot}`} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          <span className="text-14 font-semibold text-fg-1">{tag.headline}</span>
          <span className="gw-pill" data-discover-bus-attached={busAttached ? 'true' : 'false'}>
            {busAttached ? 'bus 在线' : '单机语义'}
          </span>
        </div>
        <p className="dc-busDetail">{tag.detail}</p>
        {busAttached && stats.bus ? (
          <div className="dc-ledgerGrid" data-discover-bus-ledger>
            <LedgerRow label="发出帧 published" value={dashOr(stats.bus.published)} />
            <LedgerRow label="收到帧 received" value={dashOr(stats.bus.received)} />
            <LedgerRow label="线路错误 errors" value={dashOr(stats.bus.errors)} />
            <LedgerRow label="本地处置 applied" value={dashOr(stats.bus.applied)} />
          </div>
        ) : (
          <p className="dc-busHint" data-discover-bus-null>
            四账此刻不是 0，是"没有这条线路"——本机屏蔽/关注的即时失效仍照旧工作。
          </p>
        )}
      </section>

      {error ? (
        <p className="text-12 text-warn-ink" data-discover-cache-refresh-error>
          最近一次刷新失败（{error}）；下面仍是 {updatedAt ?? '上一次'} 读到的账，未清空。
        </p>
      ) : null}

      {/* 单调水位线：把 ADR-0113 的方法论结论第一次放到运维眼前 */}
      <section className="flex flex-col gap-2" aria-label="generation 水位线">
        <h2 className="text-13 font-semibold text-fg-2">隐私失效的内存账</h2>
        <div className="dc-ledgerGrid" data-discover-generation>
          <LedgerRow label="单调水位线 globalGen" value={dashOr(stats.globalGen)} />
          <LedgerRow label="generation 表 viewer 数" value={`${stats.viewerGenerations}/${cfg.maxViewers}`} />
          <LedgerRow label="缓存 TTL" value={`${Math.round(cfg.ttlMs / 1000)}s`} />
          <LedgerRow label="未接总线时的收敛上界" value="TTL" />
        </div>
        <p className="dc-note" data-discover-generation-note>
          {generationNote(stats.globalGen, stats.viewerGenerations, cfg.maxViewers)}
        </p>
      </section>

      {/* §SC-44 全局世代：把"新作品即时可见"的收益与冷启动代价一起放到运维眼前 */}
      <section className="flex flex-col gap-2" aria-label="全局世代">
        <h2 className="text-13 font-semibold text-fg-2">内容新鲜度的内存账</h2>
        <div className="dc-ledgerGrid" data-discover-epoch>
          <LedgerRow label="全局世代 globalEpoch" value={dashOr(stats.globalEpoch)} />
          <LedgerRow label="每次 +1 作废" value="所有 sort · 所有 viewer · 含匿名" mono={false} />
        </div>
        <p className="dc-note" data-discover-epoch-note>
          {epochNote(stats.globalEpoch)}
        </p>
      </section>

      <footer className="text-11 text-fg-3" data-discover-cache-footer>
        更新于 {updatedAt ?? '—'} · 上游测量时刻 {new Date(measuredAt).toLocaleTimeString('zh-CN', { hour12: false })} ·{' '}
        {footNote(busAttached, busUrlConfigured, POLL_MS)}
      </footer>
    </div>
  );
}
