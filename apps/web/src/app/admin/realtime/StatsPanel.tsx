'use client';

import { useEffect, useState } from 'react';

/**
 * §163 诊断入口的表盘（`/admin/realtime` 里轮询这块）。每 4 秒问一次
 * `/api/admin/realtime`——问的是**回答这次请求的那台实例**：多实例部署下
 * 每台各算各的计数，页脚那句话写死这个口径，别让人把它读成全平台的数。
 *
 * 两处诚实与 api-tokens 那本账同一口径：
 * - 拉取失败写"拉取失败（HTTP 500…）"，不写成 0——一次失败的读不能被画成"线路很好"；
 * - 进程内驱动的 `wireReady` / `wireErrorCount` 是 `null`（不适用），渲染成"—"而不是 0。
 */
type Stats = {
  driver: 'in-process' | 'redis';
  instance: string;
  subscriberCount: number;
  wireReady: boolean | null;
  wireErrorCount: number | null;
};

const WIRE_LABEL: Record<string, string> = {
  na: '—（这个驱动没有线路）',
  up: '已接上（构造那一次；后来断了由连接层自动重连）',
  down: '没接上——这台实例收不到别机的事件',
  pending: '还没落定（刚启动或正在重试）',
};

function wireTag(stats: Stats): 'na' | 'up' | 'down' | 'pending' {
  if (stats.driver === 'in-process') return 'na';
  if (stats.wireReady === true) return 'up';
  if (stats.wireReady === false) return 'down';
  return 'pending';
}

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
        if (!body || typeof body.driver !== 'string' || typeof body.subscriberCount !== 'number') {
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
      <p className="text-13 text-danger" data-realtime-stats="error" data-realtime-error>
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

  const wire = wireTag(stats);
  const errorsText = stats.wireErrorCount === null ? '—（没有线路，不适用）' : String(stats.wireErrorCount);

  return (
    <div className="flex flex-col gap-2 text-13" data-realtime-stats="ready">
      <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
        <dt className="text-fg-3">驱动</dt>
        <dd data-realtime-driver={stats.driver}>
          {stats.driver === 'redis' ? 'Redis 跨实例扇出' : '进程内（单实例默认）'}
        </dd>
        <dt className="text-fg-3">实例身份</dt>
        <dd data-realtime-instance>{stats.instance}</dd>
        <dt className="text-fg-3">跨实例线路</dt>
        <dd data-realtime-wire={wire}>{WIRE_LABEL[wire]}</dd>
        <dt className="text-fg-3">线路失败累计</dt>
        <dd data-realtime-errors>{errorsText}</dd>
        <dt className="text-fg-3">本进程订阅者</dt>
        <dd data-realtime-subscribers>
          {stats.subscriberCount} 人（不是全平台的数——线路查不到远端有谁在订）
        </dd>
      </dl>
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
