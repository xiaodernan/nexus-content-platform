'use client';

import { Fragment, useEffect, useState } from 'react';
import {
  bootLabel,
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
  liveLabel,
  liveTag,
  type RealtimeStatsReadout,
} from './stats-readout';
import type { Locale } from '@/lib/i18n';

const COPY = {
  zh: {
    fetchFailedHttp: (status: number, message?: string) => `拉取失败（HTTP ${status}${message ? `·${message}` : ''}）`,
    fetchFailedShape: '拉取失败（回执形状不认识）',
    fetchFailedNetwork: '拉取失败（网络错误）',
    loading: '正在问这台实例…',
    driverRedis: 'Redis 跨实例扇出',
    driverInProcess: '进程内（单实例默认）',
    dtDriver: '驱动',
    dtInstance: '实例身份',
    dtWireNow: '跨实例线路（此刻）',
    dtWireBoot: '跨实例线路（启动那次）',
    dtErrors: '线路失败累计',
    dtErrorsByReason: '失败按原因',
    dtSubscribers: '本进程订阅者',
    subscribersSuffix: ' 人（不是全平台的数——线路查不到远端有谁在订）',
    javaProducerTitle: 'Java 生产者（domain-service）',
    breakersTitle: 'actuator circuitbreakers（Java 自己报）',
    breakersMissing: '没拿到 actuator 读数——没有在这份回执里看到 circuitBreakers 这格（不是"闭合"，是这台 instance 没接）。',
    breakersEmpty: 'actuator 有，breaker 0 个——这台 domain-service 没装 resilience4j。',
    actuatorTitle: 'actuator info（Java runtime 自报）',
    aiCapabilityTitle: 'ai-service capability（/v1/capabilities 自报）',
    failuresNote: '失败的帧不补发：实时是加速器，权威状态永远在库里——这个数只是"刚才有几帧没过去"的账。',
    neverUpdated: '还没更新过',
    updatedAt: (time: string) => `更新于 ${time}`,
    pollSuffix: ' · 每 4 秒问一次 ·',
    scopeNote: ' 这只回答这台实例（多实例部署下每台各算各的）',
  },
  en: {
    fetchFailedHttp: (status: number, message?: string) => `Fetch failed (HTTP ${status}${message ? `·${message}` : ''})`,
    fetchFailedShape: 'Fetch failed (receipt shape not recognized)',
    fetchFailedNetwork: 'Fetch failed (network error)',
    loading: 'Asking this instance…',
    driverRedis: 'Redis cross-instance fan-out',
    driverInProcess: 'In-process (single-instance default)',
    dtDriver: 'Driver',
    dtInstance: 'Instance identity',
    dtWireNow: 'Cross-instance wire (now)',
    dtWireBoot: 'Cross-instance wire (at boot)',
    dtErrors: 'Wire failures (total)',
    dtErrorsByReason: 'Failures by reason',
    dtSubscribers: 'Subscribers on this process',
    subscribersSuffix: ' (not a platform-wide number — the wire cannot see who else is subscribed)',
    javaProducerTitle: 'Java producer (domain-service)',
    breakersTitle: 'actuator circuitbreakers (Java’s own report)',
    breakersMissing: 'No actuator reads — this receipt has no circuitBreakers cell (not “closed”, this instance did not wire it).',
    breakersEmpty: 'actuator is present, breakers are 0 — this domain-service does not ship resilience4j.',
    actuatorTitle: 'actuator info (Java runtime’s own report)',
    aiCapabilityTitle: 'ai-service capability (self-reported at /v1/capabilities)',
    failuresNote: 'Failed frames are never resent: realtime is an accelerator, the authority is always the library — this number is just “how many frames did not make it, just now”.',
    neverUpdated: 'Never updated',
    updatedAt: (time: string) => `Updated ${time}`,
    pollSuffix: ' · polling every 4 s ·',
    scopeNote: ' This answers only this instance (every instance counts for itself in multi-instance deployments)',
  },
} as const;

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

export function RealtimeStatsPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
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
          setError(c.fetchFailedHttp(res.status, body?.message));
          return;
        }
        if (!isKnownStats(body)) {
          setError(c.fetchFailedShape);
          return;
        }
        setStats(body);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false }));
      } catch {
        if (alive) setError(c.fetchFailedNetwork);
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
        {c.loading}
      </p>
    );
  }

  const boot = bootTag(stats);
  // 上面那行读的是服务端的现读值，这里不做二次推断：把不认识的 `wire` 当成 `down` 或 `up`
  // 都会让"这台现在通不通"这一格说得出一句没根据的话，所以只认四档、其余归 `na`
  const live = liveTag(stats.wire);
  const javaRows = javaWirePanelRows(stats.javaWire, locale);
  const breakers = stats.javaBreakers;
  const javaActuatorRows = javaActuatorPanelRows(stats.javaActuator, locale);
  const aiCapability = stats.aiCapability;
  const aiCapabilityRows = aiCapabilityPanelRows(aiCapability);

  return (
    <div className="ar-root" data-realtime-stats="ready">
      <dl className="ar-dl">
        <dt className="ar-dt">{c.dtDriver}</dt>
        <dd data-realtime-driver={stats.driver}>
          {stats.driver === 'redis' ? c.driverRedis : c.driverInProcess}
        </dd>
        <dt className="ar-dt">{c.dtInstance}</dt>
        <dd data-realtime-instance>{stats.instance}</dd>
        <dt className="ar-dt">{c.dtWireNow}</dt>
        <dd data-realtime-wire={live}>{liveLabel(live, locale)}</dd>
        <dt className="ar-dt">{c.dtWireBoot}</dt>
        <dd data-realtime-wire-boot={boot}>{bootLabel(boot, locale)}</dd>
        <dt className="ar-dt">{c.dtErrors}</dt>
        <dd data-realtime-errors>{errorCountText(stats.wireErrorCount, locale)}</dd>
        <dt className="ar-dt">{c.dtErrorsByReason}</dt>
        <dd data-realtime-errors-by-reason>{errorReasonList(stats.wireErrorByReason, locale)}</dd>
        <dt className="ar-dt">{c.dtSubscribers}</dt>
        <dd data-realtime-subscribers>
          {stats.subscriberCount}{c.subscribersSuffix}
        </dd>
      </dl>
      <section data-java-wire className="ar-section">
        <p className="ar-sectionTitle" data-java-wire-title>{c.javaProducerTitle}</p>
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
            {javaWireNote(stats.javaWire, locale)}
          </p>
        )}
      </section>
      <section data-java-breakers className="ar-section">
        <p className="ar-sectionTitle" data-java-breakers-title>{c.breakersTitle}</p>
        {breakers === null && (
          <p className="ar-muted" data-java-breakers="missing">
            {c.breakersMissing}
          </p>
        )}
        {Array.isArray(breakers) && breakers.length === 0 && (
          <p className="ar-muted" data-java-breakers="empty">
            {c.breakersEmpty}
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
        <p className="ar-sectionTitle" data-java-actuator-title>{c.actuatorTitle}</p>
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
            {javaActuatorNote(stats.javaActuator, locale)}
          </p>
        )}
      </section>
      <section data-ai-capability className="ar-section">
        <p className="ar-sectionTitle" data-ai-capability-title>{c.aiCapabilityTitle}</p>
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
            {aiCapabilityNote(aiCapability, locale)}
          </p>
        )}
      </section>

      {stats.wireErrorCount !== null && stats.wireErrorCount > 0 ? (
        <p className="ar-note" data-realtime-error-note>
          {c.failuresNote}
        </p>
      ) : null}
      <p className="ar-note" data-realtime-updated>
        {updatedAt ? c.updatedAt(updatedAt) : c.neverUpdated}{c.pollSuffix}{c.scopeNote}
      </p>
    </div>
  );
}
