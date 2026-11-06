'use client';

import { useEffect, useState } from 'react';

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

const WIRE_LABEL: Record<Stats['wire'], string> = {
  na: '—（这个驱动没有线路）',
  up: '接上了（判定走的是那台 Redis 的共享窗口）',
  pending: '还没落定 / 正在重连（这期间这一条由本机窗口判）',
  down: '没接上（这台正在用自己的窗口数，额度是各算各的）',
};

const REASON_LABEL: Record<string, string> = {
  'command-failed': '命令失败（Redis 没答上）',
  'bad-reply': '回执不认识',
  reset: '清桶没做成',
  'over-cap': '桶键名额用完（不是 Redis 坏了）',
  expired: '整窗过期',
  cap: '顶到上界后淘汰',
};

function reasonList(map: Record<string, number>): string {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '还没有过';
  return entries.map(([reason, value]) => `${REASON_LABEL[reason] ?? reason} ${value}`).join('、');
}

/** 毫秒 → "N 分钟"。这张表里窗口都是整分钟（60 分钟），不是拿来测不准的 */
function windowText(windowMs: number): string {
  const minutes = Math.round(windowMs / 60_000);
  return Number.isFinite(minutes) && minutes >= 1 ? `${minutes} 分钟` : `${windowMs} ms`;
}

export function RateLimitStatsPanel() {
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
          setError(`拉取失败（HTTP ${res.status}${body?.message ? `·${body.message}` : ''}）`);
          return;
        }
        if (!body || typeof body.driver !== 'string' || typeof body.bucketCeiling !== 'number') {
          setError('拉取失败（回执形状不认识）');
          return;
        }
        setStats(body as Stats);
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
      <p className="text-13 text-danger-ink" data-ratelimit-stats="error" data-ratelimit-error>
        {error}
      </p>
    );
  }
  if (!stats) {
    return (
      <p className="text-13 text-fg-2" data-ratelimit-stats="loading">
        正在问这台实例…
      </p>
    );
  }

  const sharedWindowIsLive = stats.driver === 'redis' && stats.wire === 'up';

  return (
    <div className="flex flex-col gap-2 text-13" data-ratelimit-stats="ready">
      <dl className="grid grid-cols-[11rem_1fr] gap-x-3 gap-y-1">
        <dt className="text-fg-3">驱动</dt>
        <dd data-ratelimit-driver={stats.driver}>
          {stats.driver === 'redis' ? 'Redis 有序集滑动窗口' : '进程内（单实例默认）'}
        </dd>
        <dt className="text-fg-3">那份窗口住在</dt>
        <dd data-ratelimit-window-scope={stats.windowScope}>
          {stats.windowScope === 'shared-across-instances'
            ? '那台 Redis（所有实例同一份数）'
            : '这台进程的内存（每台各数各的）'}
        </dd>
        <dt className="text-fg-3">跨实例线路</dt>
        <dd data-ratelimit-wire={stats.wire}>{WIRE_LABEL[stats.wire]}</dd>
        <dt className="text-fg-3">桶的上界</dt>
        <dd data-ratelimit-ceiling>{stats.bucketCeiling} 只</dd>
        <dt className="text-fg-3">驱动数到的桶</dt>
        <dd data-ratelimit-tracked>
          {stats.bucketsTracked} 只
          <span className="ml-1 text-11 text-fg-3">
            {stats.driver === 'redis'
              ? '（这台最近一次判定带回的名册条数；权威是那台 Redis 的 ZCARD，长时间没流量时它是旧的）'
              : '（这张表里的条数，就是权威）'}
          </span>
        </dd>
        <dt className="text-fg-3">键前缀</dt>
        <dd data-ratelimit-prefix>{stats.keyPrefix ?? '—（这个驱动没有键空间）'}</dd>
        <dt className="text-fg-3">交给本机窗口判</dt>
        <dd data-ratelimit-fallback={stats.fallbackCount === null ? 'na' : String(stats.fallbackCount)}>
          {stats.fallbackCount === null
            ? '—（进程内驱动没有"本该共享却退回"这回事）'
            : `${stats.fallbackCount} 次：${reasonList(stats.fallbackByReason)}`}
        </dd>
        <dt className="text-fg-3">桶被回收</dt>
        <dd data-ratelimit-pruned>{reasonList(stats.bucketsPrunedByReason)}</dd>
        <dt className="text-fg-3">部署那句</dt>
        <dd data-ratelimit-deployment={stats.deployment.redisUrlConfigured ? 'configured' : 'unset'}>
          {stats.deployment.envVar}{' '}
          {stats.deployment.redisUrlConfigured ? '已设' : '未设——限额那句话现在是"每台各数各的"'}（这台 pid=
          {stats.deployment.pid}）
        </dd>
        {stats.lastConnectionError ? (
          <>
            <dt className="text-fg-3">最近一次连接报错</dt>
            <dd data-ratelimit-connection-error>{stats.lastConnectionError}</dd>
          </>
        ) : null}
      </dl>
      {/* 静态装法：唯一真值端上来，不重新算、不抄第二遍 */}
      <section className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] p-2 flex flex-col gap-1" aria-label="IP 窗口闸怎么装的">
        <p className="text-11 text-fg-3">IP 窗口闸怎么装的（改动 IP_RATE_RULES 才算改数）</p>
        <ul className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-11" data-ratelimit-rules>
          {Object.entries(stats.rules)
            .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
            .map(([route, rule]) => (
              <li key={route} className="contents">
                <span className="font-mono text-fg-2">{route}</span>
                <span className="tabular-nums text-fg-1">
                  {rule.limit} 次 / {windowText(rule.windowMs)}
                </span>
              </li>
            ))}
        </ul>
      </section>
      {stats.driver === 'redis' && !sharedWindowIsLive ? (
        <p className="text-11 text-warn-ink" data-ratelimit-scope-warning>
          这台装的是共享窗口，但此刻线路不在：这期间这一台的额度是它自己看到的次数。
          闸还在挡，只是"多少次"那句暂时是每台各算的。
        </p>
      ) : null}
      <p className="text-11 text-fg-3" data-ratelimit-updated>
        {updatedAt ? `更新于 ${updatedAt}` : '还没更新过'} · 每 4 秒问一次 ·
        这只回答**这台实例**（多实例部署下每台各算各的，回答这次请求的那台会说话，别台不会）
      </p>
    </div>
  );
}
