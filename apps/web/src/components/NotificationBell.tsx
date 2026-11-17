'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { REALTIME_TEXT, REALTIME_TEXT_EN, useRealtime } from '@/lib/useRealtime';
import type { Locale } from '@/lib/i18n';

/** 双语：铃铛的每行文案按 cookie locale 选（不夹杂）；实时状态词来自 REALTIME_TEXT(_EN) */
const NB_TXT = {
  zh: { failed: '通知：没读到', loading: '通知：—', bell: '通知', unreadParen: (n: number, t: number) => (n > 0 ? `（${n} 条未读）` : `（${t} 条）`), realtime: '实时：' },
  en: { failed: 'Notifications: could not read', loading: 'Notifications: —', bell: 'Notifications', unreadParen: (n: number, t: number) => (n > 0 ? ` (${n} unread)` : ` (${t} total)`), realtime: 'Live: ' },
} as const;

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

export function NotificationBell({ locale = 'zh' }: { locale?: Locale }) {
  const NB = NB_TXT[locale];
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
    // §163：断线那段时间里过来的通知，一条帧都没收到。接回来就重读一次，
    // 否则铃铛会停在断线前那一刻——要等下一条事件或者用户自己刷新（ADR-0029）
    onReconnect: () => void refresh(),
  });

  if (signedOut) return null;
  if (failed) {
    return (
      <span className="nb-faint" data-notification-bell="failed">
        {NB.failed}
      </span>
    );
  }
  if (!summary) {
    return (
      <span className="nb-faint" data-notification-bell="loading">
        {NB.loading}
      </span>
    );
  }
  const unread = summary.unread ?? 0;
  return (
    <span className="nb-row">
      <Link href="/notifications" className="nb-link" data-notification-bell="ready">
        {NB.bell}<span data-notification-unread={unread}>{NB.unreadParen(unread, summary.total ?? 0)}</span>
      </Link>
      <span className="nb-faint" data-realtime={realtime.state}>
        {NB.realtime}{(locale === 'en' ? REALTIME_TEXT_EN : REALTIME_TEXT)[realtime.state]}
      </span>
    </span>
  );
}
