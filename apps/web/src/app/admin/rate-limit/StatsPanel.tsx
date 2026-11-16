'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * §SEC 第三十五片：限流闸的表盘（`/admin/rate-limit` 里轮询这块）。
 *
 * 这块存在的原因是那三个 ADR 的同一句"仍欠"：装的是哪个驱动、名额钉在几、有没有正在退回，
 * 原来只有启动那行日志与 Prometheus 那两个 counter 会说——而"不设 `NEXUS_REDIS_URL` 就等于把
 * 限额那句话改成每台各数各的"这件事，恰恰是部署里最容易没人看见的一种坏法。
 *
 * 三处诚实与实时总线那一页同一口径：
 * - 拉取失败说"拉取失败"，不画成 0——一次失败的读什么都没证明；
 * - 进程内驱动的 `wire` 是 `'na'`（没有线路），渲染成"—"而不是"断了"；
 * - `bucketsTracked` 在 Redis 那半是**这台最近一次判定带回的名册条数**，不是那台 Redis 的 `ZCARD`，
 *   所以长时间没流量时它是旧的。页面把这句写在数字旁边，不留在注释里。
 *
 * v769：双语（locale prop 默认 zh）。
 */
type Stats = {
  driver: 'in-process' | 'redis';
  windowScope: 'this-process' | 'shared-across-instances';
  bucketCeiling: number;
  bucketsTracked: number;
  keyPrefix: string | null;
  wire: 'up' | 'pending' | 'down' | 'na';
  fallbackCount: number | null;
  lastConnectionError: string | null;
  deployment: { envVar: string; redisUrlConfigured: boolean; pid: number };
  fallbackByReason: Record<string, number>;
  bucketsPrunedByReason: Record<string, number>;
  /** 每条 IP 窗口闸怎么装的（唯一真值 `IP_RATE_RULES`，服务端原样端出；只读） */
  rules: Record<string, { limit: number; windowMs: number }>;
};

const COPY = {
  zh: {
    wiireNa: '—（这个驱动没有线路）',
    wireUp: '接上了（判定走的是那台 Redis 的共享窗口）',
    wirePending: '还没落定 / 正在重连（这期间这一条由本机窗口判）',
    wireDown: '没接上（这台正在用自己的窗口数，额度是各算各的）',
    reasonCommandFailed: '命令失败（Redis 没答上）',
    reasonBadReply: '回执不认识',
    reasonReset: '清桶没做成',
    reasonOverCap: '桶键名额用完（不是 Redis 坏了）',
    reasonExpired: '整窗过期',
    reasonCap: '顶到上界后淘汰',
    reasonUnknown: '还没有过',
    minutesUnit: ' 分钟',
    driverRedis: 'Redis 有序集滑动窗口',
    driverInProcess: '进程内（单实例默认）',
    scopeShared: '那台 Redis（所有实例同一份数）',
    scopeOwn: '这台进程的内存（每台各数各的）',
    dtDriver: '驱动',
    dtWindowScope: '那份窗口住在',
    dtWire: '跨实例线路',
    dtCeiling: '桶的上界',
    dtTracked: '驱动数到的桶',
    trackedRedisNote: '（这台最近一次判定带回的名册条数；权威是那台 Redis 的 ZCARD，长时间没流量时它是旧的）',
    trackedLocalNote: '（这张表里的条数，就是权威）',
    dtPrefix: '键前缀',
    prefixNone: '—（这个驱动没有键空间）',
    dtFallback: '交给本机窗口判',
    fallbackNa: '—（进程内驱动没有"本该共享却退回"这回事）',
    fallbackCount: (n: number) => `${n} 次：`,
    dtPruned: '桶被回收',
    dtDeployment: '部署那句',
    deploymentConfigured: '已设',
    deploymentUnset: '未设——限额那句话现在是"每台各数各的"',
    pidLabel: '（这台 pid=',
    dtConnError: '最近一次连接报错',
    fetchFailedHttp: (status: number, message?: string) => `拉取失败（HTTP ${status}${message ? `·${message}` : ''}）`,
    fetchFailedShape: '拉取失败（回执形状不认识）',
    fetchFailedNetwork: '拉取失败（网络错误）',
    loading: '正在问这台实例…',
    scopeWarning: '这台装的是共享窗口，但此刻线路不在：这期间这一台的额度是它自己看到的次数。闸还在挡，只是"多少次"那句暂时是每台各算的。',
    rulesTitle: 'IP 窗口闸怎么装的',
    rulesNote: '改动 IP_RATE_RULES 才算改数',
    rulesAria: 'IP 窗口闸怎么装的',
    perUnit: ' 次 / ',
    updatedAt: (time: string) => `更新于 ${time}`,
    neverUpdated: '还没更新过',
    pollSuffix: ' · 每 4 秒问一次 ·',
    scopeNote: ' 这只回答',
    scopeNoteTail: '这台实例（多实例部署下每台各算各的，回答这次请求的那台会说话，别台不会）',
  },
  en: {
    wiireNa: '— (this driver has no wire)',
    wireUp: 'Up (verdicts run on Redis’ shared window)',
    wirePending: 'Undecided / reconnecting (this verdict runs on the local window for now)',
    wireDown: 'Not connected (this instance counts its own window — each instance counts its own quota)',
    reasonCommandFailed: 'Command failed (Redis did not answer)',
    reasonBadReply: 'Receipt not recognized',
    reasonReset: 'Bucket reset failed',
    reasonOverCap: 'Bucket key quota exhausted (not Redis being broken)',
    reasonExpired: 'Entire window expired',
    reasonCap: 'Evicted at the ceiling',
    reasonUnknown: 'No occurrences yet',
    minutesUnit: ' min',
    driverRedis: 'Redis sorted-set sliding window',
    driverInProcess: 'In-process (single-instance default)',
    scopeShared: 'That Redis (every instance shares one count)',
    scopeOwn: 'This process’ memory (each counts its own)',
    dtDriver: 'Driver',
    dtWindowScope: 'The window lives in',
    dtWire: 'Cross-instance wire',
    dtCeiling: 'Bucket ceiling',
    dtTracked: 'Buckets tracked by driver',
    trackedRedisNote: '(this instance’s last verdict’s registry count — authority is that Redis’ ZCARD; stale after long idle)',
    trackedLocalNote: '(the count in this table IS the authority)',
    dtPrefix: 'Key prefix',
    prefixNone: '— (this driver has no key space)',
    dtFallback: 'Commanded by the local window',
    fallbackNa: '— (in-process driver has no “should have been shared but fell back”)',
    fallbackCount: (n: number) => `${n} times: `,
    dtPruned: 'Buckets reaped',
    dtDeployment: 'Deploy note',
    deploymentConfigured: 'set',
    deploymentUnset: 'unset — “how many times” means each instance counts its own right now',
    pidLabel: '(this pid=',
    dtConnError: 'Last connection error',
    fetchFailedHttp: (status: number, message?: string) => `Fetch failed (HTTP ${status}${message ? `·${message}` : ''})`,
    fetchFailedShape: 'Fetch failed (receipt shape not recognized)',
    fetchFailedNetwork: 'Fetch failed (network error)',
    loading: 'Asking this instance…',
    scopeWarning: 'This instance is wired for a shared window, but the wire is down right now: until it reconnects, this instance’s quota is what it sees locally. The gate still blocks — “how many times” is just per-instance for now.',
    rulesTitle: 'How the IP window gates are wired',
    rulesNote: 'change IP_RATE_RULES to change numbers',
    rulesAria: 'How the IP window gates are wired',
    perUnit: ' / ',
    updatedAt: (time: string) => `Updated ${time}`,
    neverUpdated: 'Never updated',
    pollSuffix: ' · polling every 4 s ·',
    scopeNote: ' This answers only',
    scopeNoteTail: ' this instance (every instance counts for itself in multi-instance deployments — the one answering this request speaks, the others do not)',
  },
} as const;

const WIRE_LABEL: Record<Locale, Record<Stats['wire'], string>> = {
  zh: {
    na: COPY.zh.wiireNa,
    up: COPY.zh.wireUp,
    pending: COPY.zh.wirePending,
    down: COPY.zh.wireDown,
  },
  en: {
    na: COPY.en.wiireNa,
    up: COPY.en.wireUp,
    pending: COPY.en.wirePending,
    down: COPY.en.wireDown,
  },
};

const REASON_LABEL: Record<Locale, Record<string, string>> = {
  zh: {
    'command-failed': COPY.zh.reasonCommandFailed,
    'bad-reply': COPY.zh.reasonBadReply,
    reset: COPY.zh.reasonReset,
    'over-cap': COPY.zh.reasonOverCap,
    expired: COPY.zh.reasonExpired,
    cap: COPY.zh.reasonCap,
  },
  en: {
    'command-failed': COPY.en.reasonCommandFailed,
    'bad-reply': COPY.en.reasonBadReply,
    reset: COPY.en.reasonReset,
    'over-cap': COPY.en.reasonOverCap,
    expired: COPY.en.reasonExpired,
    cap: COPY.en.reasonCap,
  },
};

function reasonList(map: Record<string, number>, locale: Locale): string {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return locale === 'en' ? COPY.en.reasonUnknown : COPY.zh.reasonUnknown;
  return entries.map(([reason, value]) => `${REASON_LABEL[locale][reason] ?? reason} ${value}`).join('、');
}

/** 毫秒 → "N 分钟"。这张表里窗口都是整分钟（60 分钟），不是拿来测不准的 */
function windowText(windowMs: number, locale: Locale): string {
  const minutes = Math.round(windowMs / 60_000);
  if (Number.isFinite(minutes) && minutes >= 1) return `${minutes}${locale === 'en' ? COPY.en.minutesUnit : COPY.zh.minutesUnit}`;
  return `${windowMs} ms`;
}

export function RateLimitStatsPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch('/api/admin/rate-limit', { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as (Partial<Stats> & { message?: string }) | null;
        if (!alive) return;
        if (!res.ok) {
          setError(c.fetchFailedHttp(res.status, body?.message));
          return;
        }
        if (!body || typeof body.driver !== 'string' || typeof body.bucketCeiling !== 'number') {
          setError(c.fetchFailedShape);
          return;
        }
        setStats(body as Stats);
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
    // 仅挂载时起一次 interval；locale 变化带新字符串就够（默认值在首次渲染已定）
  }, []);

  if (error) {
    return (
      <p className="ar-errorNote" data-ratelimit-stats="error" data-ratelimit-error>
        {error}
      </p>
    );
  }
  if (!stats) {
    return (
      <p className="ar-muted" data-ratelimit-stats="loading">
        {c.loading}
      </p>
    );
  }

  const sharedWindowIsLive = stats.driver === 'redis' && stats.wire === 'up';

  return (
    <div className="ar-root" data-ratelimit-stats="ready">
      <dl className="rl-dl">
        <dt className="ar-dt">{c.dtDriver}</dt>
        <dd data-ratelimit-driver={stats.driver}>
          {stats.driver === 'redis' ? c.driverRedis : c.driverInProcess}
        </dd>
        <dt className="ar-dt">{c.dtWindowScope}</dt>
        <dd data-ratelimit-window-scope={stats.windowScope}>
          {stats.windowScope === 'shared-across-instances' ? c.scopeShared : c.scopeOwn}
        </dd>
        <dt className="ar-dt">{c.dtWire}</dt>
        <dd data-ratelimit-wire={stats.wire}>{WIRE_LABEL[locale][stats.wire]}</dd>
        <dt className="ar-dt">{c.dtCeiling}</dt>
        <dd data-ratelimit-ceiling>{stats.bucketCeiling}</dd>
        <dt className="ar-dt">{c.dtTracked}</dt>
        <dd data-ratelimit-tracked>
          {stats.bucketsTracked}
          <span className="rl-trackedNote">
            {stats.driver === 'redis' ? c.trackedRedisNote : c.trackedLocalNote}
          </span>
        </dd>
        <dt className="ar-dt">{c.dtPrefix}</dt>
        <dd data-ratelimit-prefix>{stats.keyPrefix ?? c.prefixNone}</dd>
        <dt className="ar-dt">{c.dtFallback}</dt>
        <dd data-ratelimit-fallback={stats.fallbackCount === null ? 'na' : String(stats.fallbackCount)}>
          {stats.fallbackCount === null
            ? c.fallbackNa
            : `${c.fallbackCount(stats.fallbackCount)}${reasonList(stats.fallbackByReason, locale)}`}
        </dd>
        <dt className="ar-dt">{c.dtPruned}</dt>
        <dd data-ratelimit-pruned>{reasonList(stats.bucketsPrunedByReason, locale)}</dd>
        <dt className="ar-dt">{c.dtDeployment}</dt>
        <dd data-ratelimit-deployment={stats.deployment.redisUrlConfigured ? 'configured' : 'unset'}>
          {stats.deployment.envVar}{' '}
          {stats.deployment.redisUrlConfigured ? c.deploymentConfigured : c.deploymentUnset}{' '}
          {c.pidLabel}{stats.deployment.pid})
        </dd>
        {stats.lastConnectionError ? (
          <>
            <dt className="ar-dt">{c.dtConnError}</dt>
            <dd data-ratelimit-connection-error>{stats.lastConnectionError}</dd>
          </>
        ) : null}
      </dl>
      {/* 静态装法：唯一真值端上来，不重新算、不抄第二遍 */}
      <section className="rl-rulesBox" aria-label={c.rulesAria}>
        <p className="adm-capNote">{c.rulesTitle}（{c.rulesNote}）</p>
        <ul className="rl-rulesList" data-ratelimit-rules>
          {Object.entries(stats.rules)
            .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
            .map(([route, rule]) => (
              <li key={route} className="rl-rulesItem">
                <span className="rl-ruleRoute">{route}</span>
                <span className="ar-num">
                  {rule.limit}{c.perUnit}{windowText(rule.windowMs, locale)}
                </span>
              </li>
            ))}
        </ul>
      </section>
      {stats.driver === 'redis' && !sharedWindowIsLive ? (
        <p className="am-warnNote" data-ratelimit-scope-warning>
          {c.scopeWarning}
        </p>
      ) : null}
      <p className="adm-capNote" data-ratelimit-updated>
        {updatedAt ? c.updatedAt(updatedAt) : c.neverUpdated}{c.pollSuffix}
        {c.scopeNote}<strong>{locale === 'en' ? 'this instance' : '这台实例'}</strong>{c.scopeNoteTail}
      </p>
    </div>
  );
}
