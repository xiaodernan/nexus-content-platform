'use client';

import { Fragment, useEffect, useState } from 'react';
import {
  BOOT_LABEL,
  LIVE_LABEL,
  bootTag,
  errorCountText,
  errorReasonList,
  isKnownStats,
  javaActuatorNote,
  javaActuatorPanelRows,
  javaWireNote,
  javaWirePanelRows,
  aiCapabilityNote,
  aiCapabilityPanelRows,
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
      <p className="ar-errorNote" data-realtime-stats="error" data-realtime-error>
        {error}
      </p>
    );
  }
  if (!stats) {
    return (
      <p className="ar-muted" data-realtime-stats="loading">
        正在问这台实例…
      </p>
    );
  }

  const boot = bootTag(stats);
  // 上面那行读的是服务端的现读值，这里不做二次推断：把不认识的 `wire` 当成 `down` 或 `up`
  // 都会让"这台现在通不通"这一格说得出一句没根据的话，所以只认四档、其余归 `na`
  const live = liveTag(stats.wire);
  const javaRows = javaWirePanelRows(stats.javaWire);
  const breakers = stats.javaBreakers;
  const javaActuatorRows = javaActuatorPanelRows(stats.javaActuator);
  const aiCapability = stats.aiCapability;
  const aiCapabilityRows = aiCapabilityPanelRows(aiCapability);

  return (
    <div className="ar-root" data-realtime-stats="ready">
      <dl className="ar-dl">
        <dt className="ar-dt">驱动</dt>
        <dd data-realtime-driver={stats.driver}>
          {stats.driver === 'redis' ? 'Redis 跨实例扇出' : '进程内（单实例默认）'}
        </dd>
        <dt className="ar-dt">实例身份</dt>
        <dd data-realtime-instance>{stats.instance}</dd>
        <dt className="ar-dt">跨实例线路（此刻）</dt>
        <dd data-realtime-wire={live}>{LIVE_LABEL[live]}</dd>
        <dt className="ar-dt">跨实例线路（启动那次）</dt>
        <dd data-realtime-wire-boot={boot}>{BOOT_LABEL[boot]}</dd>
        <dt className="ar-dt">线路失败累计</dt>
        <dd data-realtime-errors>{errorCountText(stats.wireErrorCount)}</dd>
        <dt className="ar-dt">失败按原因</dt>
        <dd data-realtime-errors-by-reason>{errorReasonList(stats.wireErrorByReason)}</dd>
        <dt className="ar-dt">本进程订阅者</dt>
        <dd data-realtime-subscribers>
          {stats.subscriberCount} 人（不是全平台的数——线路查不到远端有谁在订）
        </dd>
      </dl>
      <section data-java-wire className="ar-section">
        <p className="ar-sectionTitle" data-java-wire-title>Java 生产者（domain-service）</p>
        {javaRows ? (
          <dl className="ar-dl">
            {javaRows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="ar-dt">{label}</dt>
                <dd data-java-wire-row={label}>{value}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className="ar-muted" data-java-wire="missing">
            {javaWireNote(stats.javaWire)}
          </p>
        )}
      </section>
      <section data-java-breakers className="ar-section">
        <p className="ar-sectionTitle" data-java-breakers-title>actuator circuitbreakers（Java 自己报）</p>
        {breakers === null && (
          <p className="ar-muted" data-java-breakers="missing">
            没拿到 actuator 读数——没有在这份回执里看到 circuitBreakers 这格（不是"闭合"，是这台 instance 没接）。
          </p>
        )}
        {Array.isArray(breakers) && breakers.length === 0 && (
          <p className="ar-muted" data-java-breakers="empty">
            actuator 有，breaker 0 个——这台 domain-service 没装 resilience4j。
          </p>
        )}
        {Array.isArray(breakers) && breakers.length > 0 && (
          <dl className="ar-breakersGrid">
            <dt className="ar-dt">name / state</dt>
            <dt className="ar-dt">bufferedCalls</dt>
            <dt className="ar-dt">failedCalls</dt>
            <dt className="ar-dt">failureRate</dt>
            {breakers.map((b) => (
              <Fragment key={b.name}>
                <dt className="ar-breakerName" data-java-breaker-name={b.name}>
                  {b.name} <span className="ar-breakerState">· {b.state}</span>
                </dt>
                <dd data-java-breaker-buffered={b.name} className="ar-num">{b.bufferedCalls}</dd>
                <dd data-java-breaker-failed={b.name} className="ar-num">{b.failedCalls}</dd>
                <dd data-java-breaker-rate={b.name} className="ar-num">{b.failureRate}</dd>
              </Fragment>
            ))}
          </dl>
        )}
      </section>
      <section data-java-actuator className="ar-section">
        <p className="ar-sectionTitle" data-java-actuator-title>actuator info（Java runtime 自报）</p>
        {javaActuatorRows ? (
          <dl className="ar-dlSmall">
            {javaActuatorRows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="ar-dt">{label}</dt>
                <dd data-java-actuator-row={label} className="ar-num">{value}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className="ar-muted" data-java-actuator="missing">
            {javaActuatorNote(stats.javaActuator)}
          </p>
        )}
      </section>
      <section data-ai-capability className="ar-section">
        <p className="ar-sectionTitle" data-ai-capability-title>ai-service capability（/v1/capabilities 自报）</p>
        {aiCapabilityRows ? (
          <dl className="ar-dlSmall">
            {aiCapabilityRows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="ar-dt">{label}</dt>
                <dd data-ai-capability-row={label} className={label === 'capability' && value === 'real' ? 'ar-capabilityReal' : ''}>{value}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className="ar-muted" data-ai-capability="missing">
            {aiCapabilityNote(aiCapability)}
          </p>
        )}
      </section>

      {stats.wireErrorCount !== null && stats.wireErrorCount > 0 ? (
        <p className="ar-note" data-realtime-error-note>
          失败的帧不补发：实时是加速器，权威状态永远在库里——这个数只是"刚才有几帧没过去"的账。
        </p>
      ) : null}
      <p className="ar-note" data-realtime-updated>
        {updatedAt ? `更新于 ${updatedAt}` : '还没更新过'} · 每 4 秒问一次 ·
        这只回答这台实例（多实例部署下每台各算各的）
      </p>
    </div>
  );
}
