'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRealtime } from '@/lib/useRealtime';

/**
 * §164 顶栏铃铛：只报"查到了没有"和"几条没读"。
 *
 * 这里最重要的一条是**读不到的时候不许显示 0**：一次失败的请求看起来和"没有通知"一模一样，
 * 而后者会让作者以为没人理他的作品的。所以 fetch 失败走 failed 分支，
 * 没有登录（401）走"不渲染"分支，只有真查到数才写数。
 *
 * §163 落地后加了一条实时订阅：真的推来一条 notification 就重新查一次数。
 * 注意这里**没有**把事件里的标题当成新通知直接加进列表——实时事件只是"该重新查了"的信号，
 * 未读数与"有没有读过"以库为准（ADR-0010 后果第 4 条：断线期间的事件不补发，
 * 所以任何"数"都不能只从事件流里累加）。
 */

interface Summary {
  ok: boolean;
  unread?: number;
  total?: number;
}

export function NotificationBell() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=1');
      const json = (await res.json().catch(() => null)) as Summary | null;
      // 没有会话：这一页本来就没有收件箱，"通知：—"会让人以为系统在查
      if (res.status === 401) return setSignedOut(true);
      if (!json?.ok) return setFailed(true);
      setSummary(json);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 只有真读到过收件箱（= 确有会话）才开这条连接
  const realtime = useRealtime({
    enabled: summary !== null && !signedOut,
    onEvent: (event) => {
      if (event.type === 'notification') void refresh();
    },
  });

  if (signedOut) return null;
  if (failed) {
    return (
      <span className="text-11 text-fg-3" data-notification-bell="failed">
        通知：没读到
      </span>
    );
  }
  if (!summary) {
    return (
      <span className="text-11 text-fg-3" data-notification-bell="loading">
        通知：—
      </span>
    );
  }
  const unread = summary.unread ?? 0;
  return (
    <span className="flex items-center gap-2">
      <Link href="/notifications" className="text-accent-2 underline" data-notification-bell="ready">
        通知<span data-notification-unread={unread}>{unread > 0 ? `（${unread} 条未读）` : `（${summary.total ?? 0} 条）`}</span>
      </Link>
      <span className="text-11 text-fg-3" data-realtime={realtime.state}>
        {realtime.state === 'open'
          ? '实时：已连接'
          : realtime.state === 'connecting'
            ? '实时：连接中'
            : realtime.state === 'idle'
              ? '实时：未开'
              : '实时：已断开，以刷新后的数据为准'}
      </span>
    </span>
  );
}
