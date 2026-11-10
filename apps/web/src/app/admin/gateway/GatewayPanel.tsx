'use client';

import { useEffect, useState } from 'react';
import type { GatewaySnapshot } from '@/server/gateway/snapshot';
import type { ReadoutState } from '@/server/gateway/types';
import { CLASS_LABEL, healthView, numberOrDash, pollAllowed, STATE_LABEL } from './gateway-view';

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

function ColumnState({ label, state, measuredAt, ageMs }: { label: string; state: ReadoutState; measuredAt: string | null; ageMs: number }) {
  return (
    <span className="gw-pill" data-gateway-column={label} data-state={state}>
      <span className="gw-mono">{label}</span>
      <span>·</span>
      <span>{STATE_LABEL[state]}</span>
      <span className="gw-mono" style={{ color: 'var(--nexus-color-fg-3)' }}>
        {measuredAt ? new Date(measuredAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—'
        }{ageMs > 1000 ? ` (+${Math.round(ageMs / 1000)}s)` : ''}
      </span>
    </span>
  );
}

export function GatewayPanel({
  initial,
  initialError,
  driver,
}: {
  initial: GatewaySnapshot | null;
  initialError: string | null;
  driver: Driver;
}) {
  const [snapshot, setSnapshot] = useState<GatewaySnapshot | null>(initial);
  const [error, setError] = useState<string | null>(initialError);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initial ? new Date().toLocaleTimeString('zh-CN', { hour12: false }) : null);

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
          setError(`拉取失败（HTTP ${res.status}${body?.message ? ` · ${body.message}` : ''}）`);
          return; // 不清空上一帧：旧图还带日期，比空白诚实
        }
        setSnapshot(body);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      } catch {
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

  // 首屏取数都失败、且轮询还没回来：骨架屏，不画空图
  if (!snapshot) {
    return (
      <section data-gateway-loading aria-label="正在读取网关态势">
        {error ? (
          <p className="text-13 text-danger-ink" data-gateway-error>{error}</p>
        ) : (
          <div className="gw-grid">
            {[0, 1, 2, 3].map((i) => <div key={i} className={`gw-skeleton h-[92px]`} />)}
          </div>
        )}
      </section>
    );
  }

  const { totals, columns, gaps, services: rows, notes } = snapshot;

  return (
    <div className="flex flex-col gap-5" data-gateway-ready>
      {/* KPI：null 一律"—（未测）"，不显示 0 */}
      <section className="gw-grid" aria-label="网关概览">
        <Kpi label="生效路由" value={numberOrDash(totals.routes)} />
        <Kpi label="注册服务" value={numberOrDash(totals.services)} />
        <Kpi label="注册实例" value={numberOrDash(totals.instances)} />
        <Kpi label="中断实例" value={String(totals.downInstances)} dot={totals.downInstances > 0 ? 'gw-dotDown' : 'gw-dotUp'} />
        <Kpi label="没答上的实例" value={String(totals.unknownInstances)} dot={totals.unknownInstances > 0 ? 'gw-dotUnknown' : 'gw-dotUp'} />
      </section>

      {/* 三列各自的时间与可信状态：这一屏最要紧的诚实 */}
      <section className="flex flex-wrap items-center gap-2" data-gateway-columns aria-label="三份读数各自的时刻">
        <ColumnState label="routes" state={columns.routes.state} measuredAt={columns.routes.measuredAt} ageMs={columns.routes.ageMs} />
        <ColumnState label="services" state={columns.services.state} measuredAt={columns.services.measuredAt} ageMs={columns.services.ageMs} />
        <ColumnState label="health" state={columns.health.state} measuredAt={columns.health.measuredAt} ageMs={columns.health.ageMs} />
      </section>

      {error ? (
        <p className="text-12 text-warn-ink" data-gateway-refresh-error>
          最近一次刷新失败（{error}）；下面仍是 {updatedAt ?? '上一次'} 读到的图，未清空。
        </p>
      ) : null}

      {/* 错处才是价值：三列对齐后的逐服务视图 */}
      <section className="flex flex-col gap-1" aria-label="逐服务态势">
        <div className={`gw-row text-11 text-fg-3`} aria-hidden="true">
          <span>服务 id</span>
          <span>健康</span>
          <span>注册实例</span>
          <span>归类</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-13 text-fg-2" data-gateway-empty>
            三列都没给出服务名——先看上面哪一列是「未测到」，别把空表读成"平台没有服务"。
          </p>
        ) : (
          rows.map((row) => {
            const h = healthView(row.health);
            return (
              <div className="gw-row" key={row.id} data-gateway-service={row.id} data-classification={row.classification}>
                <span className={`gw-mono text-fg-1`} title={row.routeIds.join(', ')}>{row.id}</span>
                <span className="gw-status">
                  <span className={`gw-dot ${h.dot}`} />
                  <span>{h.text}</span>
                </span>
                <span className={`gw-mono text-fg-2`}>{numberOrDash(row.registeredInstances)}</span>
                <span className="text-fg-2">{CLASS_LABEL[row.classification]}</span>
              </div>
            );
          })
        )}
      </section>

      {/* 诚实边界与错处：一条条上屏，不藏在注释里 */}
      {gaps.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="读数的限度与错配">
          <h2 className="text-13 font-semibold text-fg-2">读数的限度（不是报错，是事实的边界）</h2>
          {gaps.map((gap, i) => (
            <p className="gw-gapItem" key={`${gap.kind}-${i}`} data-gateway-gap={gap.kind}>
              {gap.note}
            </p>
          ))}
        </section>
      ) : null}

      {/* 三份上游各自的 note 原样端出 */}
      <section className="flex flex-col gap-1 text-11 text-fg-3" aria-label="上游原话">
        {notes.routes ? <p data-gateway-note="routes">routes：{notes.routes}</p> : null}
        {notes.services ? <p data-gateway-note="services">services：{notes.services}</p> : null}
        {notes.health ? <p data-gateway-note="health">health：{notes.health}</p> : null}
      </section>

      <footer className="text-11 text-fg-3" data-gateway-footer>
        更新于 {updatedAt ?? '—'} · 每 {POLL_MS / 1000} 秒问一次 · 后台标签暂停 · 问的是 {driver.baseUrl} ·
        共享缓存 {driver.shared.driver === 'redis' ? 'Redis' : '进程内'}
        {driver.shared.lastError ? `（线路最近报错：${driver.shared.lastError}）` : ''} ·
        三列 measuredAt 不同，这是三张带各自日期的事实拼成的图，不是同一瞬间的原子快照
      </footer>
    </div>
  );
}
