'use client';

import { useEffect, useState } from 'react';
import type { GatewaySnapshot } from '@/server/gateway/snapshot';
import type { ReadoutState } from '@/server/gateway/types';
import type { Locale } from '@/lib/i18n';
import { classLabel, healthView, numberOrDash, pollAllowed, sharedHealthView, stateLabel } from './gateway-view';

const COPY = {
  zh: {
    loadingAria: '正在读取网关态势',
    fetchFailedHttp: (status: number, message?: string) => `拉取失败（HTTP ${status}${message ? ` · ${message}` : ''}）`,
    fetchFailedNetwork: '拉取失败（网络错误）',
    refreshError: (updatedAt: string | null, err: string) =>
      `最近一次刷新失败（${err}）；下面仍是 ${updatedAt ?? '上一次'} 读到的图，未清空。`,
    kpiOverviewAria: '网关概览',
    kpiRoutes: '生效路由',
    kpiServices: '注册服务',
    kpiInstances: '注册实例',
    kpiDown: '中断实例',
    kpiUnknown: '没答上的实例',
    columnsAria: '三份读数各自的时刻',
    perServiceAria: '逐服务态势',
    colId: '服务 id',
    colHealth: '健康',
    colInstances: '注册实例',
    colClass: '归类',
    empty: '三列都没给出服务名——先看上面哪一列是「未测到」，别把空表读成"平台没有服务"。',
    gapsAria: '读数的限度与错配',
    gapsTitle: '读数的限度（不是报错，是事实的边界）',
    notesAria: '上游原话',
    footerUpdated: '更新于',
    footerPoll: '秒问一次',
    footerPausesInBg: '后台标签暂停',
    footerAsking: '问的是',
    footerNonAtomic: '三列 measuredAt 不同，这是三张带各自日期的事实拼成的图，不是同一瞬间的原子快照',
  },
  en: {
    loadingAria: 'Reading gateway posture',
    fetchFailedHttp: (status: number, message?: string) => `Fetch failed (HTTP ${status}${message ? ` · ${message}` : ''})`,
    fetchFailedNetwork: 'Fetch failed (network error)',
    refreshError: (updatedAt: string | null, err: string) =>
      `Last refresh failed (${err}); the panel still shows the picture read at ${updatedAt ?? 'last time'}, nothing cleared.`,
    kpiOverviewAria: 'Gateway overview',
    kpiRoutes: 'Effective routes',
    kpiServices: 'Registered services',
    kpiInstances: 'Registered instances',
    kpiDown: 'Down instances',
    kpiUnknown: 'Unanswered instances',
    columnsAria: 'Timestamps of the three reads',
    perServiceAria: 'Per-service posture',
    colId: 'Service id',
    colHealth: 'Health',
    colInstances: 'Instances',
    colClass: 'Class',
    empty: 'None of the three columns produced a service name — check which column above reads “unmeasured” first; do not read an empty table as “the platform has no services”.',
    gapsAria: 'Limits and mismatches',
    gapsTitle: 'Limits of the reads (not errors — the edges of the facts)',
    notesAria: 'Upstream verbatim',
    footerUpdated: 'Updated',
    footerPoll: 's between reads',
    footerPausesInBg: 'paused in background tabs',
    footerAsking: 'asking',
    footerNonAtomic: 'The three measuredAt values differ — this is a picture assembled from three facts with their own timestamps, not an atomic snapshot of one instant',
  },
} as const;

/**
 * §SC-40 面板：把 join 后的态势图渲染出来，并每 4 秒问一次 `/api/admin/gateway`。
 *
 * 四条与 `/admin/rate-limit`、`/admin/realtime` 同一口径的诚实：
 * - 拉取失败说"拉取失败"，**不画成 0、也不清空上一帧**——一次失败的读什么都没证明，旧图还带着日期；
 * - `null`（没测到）渲染成"—（未测）"，不渲染成 0；state=stale/cached 的那列单独打"旧/缓存"标；
 * - 三列 measuredAt 各不同，页脚明说这不是同一瞬间的原子快照；
 * - **后台标签暂停轮询**（visibilitychange），不在没人看的时候给网关制造流量；回到前台立刻补一发。
 *
 * 美学全部用 token 与 globals.css 的 §SC-40 段（`.gw-` 类）：状态色只出现在圆点上，旁边文字一律
 * 中性 fg-*，所以浅色主题也过 WCAG AA，且不会触发 style-tokens 门禁的"强调色当文字"那几道硬门。
 * 展示判据（null→Dash、健康态映射、后台暂停）抽在 `gateway-view.ts`，与本组件分开判据。
 *
 * v770：双语（locale prop 默认 zh）。
 */

interface Driver {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly cacheTtlMs: number;
  readonly shared: { readonly driver: 'in-process' | 'redis'; readonly lastError: string | null; readonly fallbacks: number };
}

const POLL_MS = 4000;

function Kpi({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="gw-card" data-gateway-kpi={label}>
      <div className="gw-kpiLabel">{label}</div>
      <div className="gw-kpiValue">
        {dot ? <span className={`gw-dot ${dot}`} style={{ verticalAlign: 'middle', marginRight: 8 }} /> : null}
        {value}
      </div>
    </div>
  );
}

function ColumnState({ label, state, measuredAt, ageMs, locale }: { label: string; state: ReadoutState; measuredAt: string | null; ageMs: number; locale: Locale }) {
  return (
    <span className="gw-pill" data-gateway-column={label} data-state={state}>
      <span className="gw-mono">{label}</span>
      <span>·</span>
      <span>{stateLabel(state, locale)}</span>
      <span className="gw-mono" style={{ color: 'var(--nexus-color-fg-3)' }}>
        {measuredAt ? new Date(measuredAt).toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false }) : '—'
        }{ageMs > 1000 ? ` (+${Math.round(ageMs / 1000)}s)` : ''}
      </span>
    </span>
  );
}

export function GatewayPanel({
  initial,
  initialError,
  driver,
  locale = 'zh',
}: {
  initial: GatewaySnapshot | null;
  initialError: string | null;
  driver: Driver;
  locale?: Locale;
}) {
  const c = COPY[locale];
  const [snapshot, setSnapshot] = useState<GatewaySnapshot | null>(initial);
  const [error, setError] = useState<string | null>(initialError);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initial ? new Date().toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false }) : null);

  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      // 后台标签不发请求；回到前台由 visibilitychange 立刻补一发（判据在 gateway-view.pollAllowed）
      if (!pollAllowed(document.visibilityState)) return;
      try {
        const res = await fetch('/api/admin/gateway', { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as (GatewaySnapshot & { message?: string }) | null;
        if (!alive) return;
        if (!res.ok || !body || typeof body !== 'object' || !('services' in body)) {
          setError(c.fetchFailedHttp(res.status, body?.message));
          return; // 不清空上一帧：旧图还带日期，比空白诚实
        }
        setSnapshot(body);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false }));
      } catch {
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
    // 仅挂载时起一次 interval；locale 变化带新字符串就够
  }, []);

  // 首屏取数都失败、且轮询还没回来：骨架屏，不画空图
  if (!snapshot) {
    return (
      <section data-gateway-loading aria-label={c.loadingAria}>
        {error ? (
          <p className="ar-errorNote" data-gateway-error>{error}</p>
        ) : (
          <div className="gw-grid">
            {[0, 1, 2, 3].map((i) => <div key={i} className="gw-skeleton" />)}
          </div>
        )}
      </section>
    );
  }

  const { totals, columns, gaps, services: rows, notes } = snapshot;

  return (
    <div className="am-stackXl" data-gateway-ready>
      {/* KPI：null 一律"—（未测）"，不显示 0 */}
      <section className="gw-grid" aria-label={c.kpiOverviewAria}>
        <Kpi label={c.kpiRoutes} value={numberOrDash(totals.routes, locale)} />
        <Kpi label={c.kpiServices} value={numberOrDash(totals.services, locale)} />
        <Kpi label={c.kpiInstances} value={numberOrDash(totals.instances, locale)} />
        <Kpi label={c.kpiDown} value={String(totals.downInstances)} dot={totals.downInstances > 0 ? 'gw-dotDown' : 'gw-dotUp'} />
        <Kpi label={c.kpiUnknown} value={String(totals.unknownInstances)} dot={totals.unknownInstances > 0 ? 'gw-dotUnknown' : 'gw-dotUp'} />
      </section>

      {/* 三列各自的时间与可信状态：这一屏最要紧的诚实 */}
      <section className="am-chipRow" data-gateway-columns aria-label={c.columnsAria}>
        <ColumnState label="routes" state={columns.routes.state} measuredAt={columns.routes.measuredAt} ageMs={columns.routes.ageMs} locale={locale} />
        <ColumnState label="services" state={columns.services.state} measuredAt={columns.services.measuredAt} ageMs={columns.services.ageMs} locale={locale} />
        <ColumnState label="health" state={columns.health.state} measuredAt={columns.health.measuredAt} ageMs={columns.health.ageMs} locale={locale} />
      </section>

      {error ? (
        <p className="am-warnNote" data-gateway-refresh-error>
          {c.refreshError(updatedAt, error)}
        </p>
      ) : null}

      {/* 错处才是价值：三列对齐后的逐服务视图 */}
      <section className="am-stack" aria-label={c.perServiceAria}>
        <div className="gw-row am-rowHead" aria-hidden="true">
          <span>{c.colId}</span>
          <span>{c.colHealth}</span>
          <span>{c.colInstances}</span>
          <span>{c.colClass}</span>
        </div>
        {rows.length === 0 ? (
          <p className="am-empty" data-gateway-empty>
            {c.empty}
          </p>
        ) : (
          rows.map((row) => {
            const h = healthView(row.health, locale);
            return (
              <div className="gw-row" key={row.id} data-gateway-service={row.id} data-classification={row.classification}>
                <span className="gw-ident" title={row.routeIds.join(', ')}>{row.id}</span>
                <span className="gw-status">
                  <span className={`gw-dot ${h.dot}`} />
                  <span>{h.text}</span>
                </span>
                <span className="gw-ident2">{numberOrDash(row.registeredInstances, locale)}</span>
                <span className="am-mutedText">{classLabel(row.classification, locale)}</span>
              </div>
            );
          })
        )}
      </section>

      {/* 诚实边界与错处：一条条上屏，不藏在注释里 */}
      {gaps.length > 0 ? (
        <section className="am-audit" aria-label={c.gapsAria}>
          <h2 className="am-sectionHeadSm">{c.gapsTitle}</h2>
          {gaps.map((gap, i) => (
            <p className="gw-gapItem" key={`${gap.kind}-${i}`} data-gateway-gap={gap.kind}>
              {gap.note}
            </p>
          ))}
        </section>
      ) : null}

      {/* 三份上游各自的 note 原样端出 */}
      <section className="am-stackSm" aria-label={c.notesAria}>
        {notes.routes ? <p data-gateway-note="routes">routes：{notes.routes}</p> : null}
        {notes.services ? <p data-gateway-note="services">services：{notes.services}</p> : null}
        {notes.health ? <p data-gateway-note="health">health：{notes.health}</p> : null}
      </section>

      <footer className="adm-capNote" data-gateway-footer>
        {c.footerUpdated} {updatedAt ?? '—'} · {c.footerPausesInBg} · {POLL_MS / 1000} {c.footerPoll} {c.footerAsking} {driver.baseUrl} ·
        {(() => {
          // §SC-50 / ADR-0125：driver=redis 只表示「已配置」，不等于「此刻连着」。
          // 把配置意图与 fail-open 实况分开说，坏回执也由纯函数兜成中性说法。
          const shared = sharedHealthView(driver.shared, locale);
          return (
            <>
              {shared.label}
              {shared.detail ? `（${shared.detail}）` : ''} ·
            </>
          );
        })()}
        {c.footerNonAtomic}
      </footer>
    </div>
  );
}
