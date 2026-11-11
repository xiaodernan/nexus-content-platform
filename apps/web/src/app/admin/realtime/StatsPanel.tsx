'use client';

import { Fragment, useEffect, useState } from 'react';
import {
  BOOT_LABEL,
  LIVE_LABEL,
  bootTag,
  errorCountText,
  errorReasonList,
  isKnownStats,
  javaWireNote,
  javaWirePanelRows,
  liveTag,
  type RealtimeStatsReadout,
} from './stats-readout';

/**
 * §163 诊断入口的表盘（`/admin/realtime` 里轮询这块）。每 4 秒问一次
 * `/api/admin/realtime`——问的是**回答这次请求的那台实例**：多实例部署下
 * 每台各算各的计数，页脚那句话写死这个口径，别让人把它读成全平台的数。
 *
 * 三处诚实，与 api-tokens 那本账同一口径：
 * - 拉取失败写"拉取失败（HTTP 500…）"，不写成 0——一次失败的读不能被画成"线路很好"；
 * - 进程内驱动的 `wireReady` / `wireErrorCount` 是 `null`（不适用），渲染成"—"而不是 0；
 * - **此刻通不通**与**启动那一次接上没有**是两行，不是一行：`wireReady` 是一次性的闩，
 *   Redis 比这台晚起来的那台会合法地读出"没接上 + 在"。把两格并成一句，
 *   要么把已经通了的这台说成死的，要么把启动失败这件事洗掉。
 *
 * 措辞与分档都在 `stats-readout.ts`（那边才是能逐档判定的地方，见那里的文件头）。
 */
type Stats = RealtimeStatsReadout;

export function RealtimeStatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch('/api/admin/realtime', { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as (Partial<Stats> & { message?: string }) | null;
        if (!alive) return;
        if (!res.ok) {
          // 失败要说出来，不能画成 0：那次读什么都没证明
          setError(`拉取失败（HTTP ${res.status}${body?.message ? `·${body.message}` : ''}）`);
          return;
        }
        if (!isKnownStats(body)) {
          setError('拉取失败（回执形状不认识）');
          return;
        }
        setStats(body);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      } catch {
        if (alive) setError('拉取失败（网络错误）');
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <p className="text-13 text-danger-ink" data-realtime-stats="error" data-realtime-error>
        {error}
      </p>
    );
  }
  if (!stats) {
    return (
      <p className="text-13 text-fg-2" data-realtime-stats="loading">
        正在问这台实例…
      </p>
    );
  }

  const boot = bootTag(stats);
  // 上面那行读的是服务端的现读值，这里不做二次推断：把不认识的 `wire` 当成 `down` 或 `up`
  // 都会让"这台现在通不通"这一格说得出一句没根据的话，所以只认四档、其余归 `na`
  const live = liveTag(stats.wire);
  const javaRows = javaWirePanelRows(stats.javaWire);

  return (
    <div className="flex flex-col gap-2 text-13" data-realtime-stats="ready">
      <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
        <dt className="text-fg-3">驱动</dt>
        <dd data-realtime-driver={stats.driver}>
          {stats.driver === 'redis' ? 'Redis 跨实例扇出' : '进程内（单实例默认）'}
        </dd>
        <dt className="text-fg-3">实例身份</dt>
        <dd data-realtime-instance>{stats.instance}</dd>
        <dt className="text-fg-3">跨实例线路（此刻）</dt>
        <dd data-realtime-wire={live}>{LIVE_LABEL[live]}</dd>
        <dt className="text-fg-3">跨实例线路（启动那次）</dt>
        <dd data-realtime-wire-boot={boot}>{BOOT_LABEL[boot]}</dd>
        <dt className="text-fg-3">线路失败累计</dt>
        <dd data-realtime-errors>{errorCountText(stats.wireErrorCount)}</dd>
        <dt className="text-fg-3">失败按原因</dt>
        <dd data-realtime-errors-by-reason>{errorReasonList(stats.wireErrorByReason)}</dd>
        <dt className="text-fg-3">本进程订阅者</dt>
        <dd data-realtime-subscribers>
          {stats.subscriberCount} 人（不是全平台的数——线路查不到远端有谁在订）
        </dd>
      </dl>
      <section data-java-wire className="flex flex-col gap-1 border-t border-[var(--nexus-color-border-subtle)] pt-2">
        <p className="text-11 font-medium text-fg-3" data-java-wire-title>Java 生产者（domain-service）</p>
        {javaRows ? (
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
            {javaRows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-fg-3">{label}</dt>
                <dd data-java-wire-row={label}>{value}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className="text-13 text-fg-2" data-java-wire="missing">
            {javaWireNote(stats.javaWire)}
          </p>
        )}
      </section>
      {stats.wireErrorCount !== null && stats.wireErrorCount > 0 ? (
        <p className="text-11 text-fg-3" data-realtime-error-note>
          失败的帧不补发：实时是加速器，权威状态永远在库里——这个数只是"刚才有几帧没过去"的账。
        </p>
      ) : null}
      <p className="text-11 text-fg-3" data-realtime-updated>
        {updatedAt ? `更新于 ${updatedAt}` : '还没更新过'} · 每 4 秒问一次 ·
        这只回答这台实例（多实例部署下每台各算各的）
      </p>
    </div>
  );
}
