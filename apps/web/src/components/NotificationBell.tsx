'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * §164 顶栏铃铛：只报"查到了没有"和"几条没读"。
 *
 * 这里最重要的一条是**读不到的时候不许显示 0**：一次失败的请求看起来和"没有通知"一模一样，
 * 而后者会让作者以为没人理他的作品的。所以 fetch 失败走 failed 分支，
 * 没有登录（401）走"不渲染"分支，只有真查到数才写数。
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

  useEffect(() => {
    let alive = true;
    fetch('/api/notifications?limit=1')
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as Summary | null;
        if (!alive) return;
        // 没有会话：这一页本来就没有收件箱，"通知：—"会让人以为系统在查
        if (res.status === 401) return setSignedOut(true);
        if (!json?.ok) return setFailed(true);
        setSummary(json);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

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
    <Link href="/notifications" className="text-accent-2 underline" data-notification-bell="ready">
      通知<span data-notification-unread={unread}>{unread > 0 ? `（${unread} 条未读）` : `（${summary.total ?? 0} 条）`}</span>
    </Link>
  );
}
