'use client';

import { useEffect } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import {
  FLUSH_INTERVAL_MS,
  addVisibleMs,
  completionPct,
  takePending,
  type VisitAggregate,
} from '@/lib/visit-meter';

const KEY_STORAGE = 'nexus.visit.key';
const TICK_MS = 1_000;

/**
 * 匿名访客 key：同一个浏览器里稳定，用来把多次心跳并成"一个人的一天"。
 * 拿不到 localStorage（隐私模式）就退化成"每次打开一个 key"——
 * 这时访客数会偏高，界面上要按"至少这么多人"来读，所以这一笔由调用方带在注释里，
 * 而不是在这里假装两个分支等价。
 */
function visitorKey(): string {
  try {
    const stored = window.localStorage.getItem(KEY_STORAGE);
    if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const fresh = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    window.localStorage.setItem(KEY_STORAGE, fresh);
    return fresh;
  } catch {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

/** 页面被看到的最大比例：竖向滚动 + 视口，横着滚不算"没看到"（整页宽度是设计稿的一部分） */
function seenPct(): number {
  const root = document.scrollingElement ?? document.documentElement;
  return completionPct(root.scrollTop, window.innerHeight, root.scrollHeight);
}

/**
 * 已经记过"打开"的路径。dev 下 React StrictMode 会把 effect 挂上→卸载→再挂一次，
 * 不去重的话一次真实打开会变成两次；生产路径同样是整份文档重新加载，所以按 path 记一次即可。
 */
const openedPaths = new Set<string>();

/**
 * §168 的采集端。三条规则决定这两个数可不可信：
 * 1. 只在 `document.visibilityState === 'visible'` 时累计——切走标签页不算在看；
 * 2. 单次 tick 超过上限的部分丢掉（见 visit-meter 的 MAX_SAMPLE_MS）——挂起、断点、
 *    系统睡眠都会一次性给出巨大的 delta，不丢掉的话"浏览时长"可以随便编；
 * 3. 离开页面时用 keepalive fetch 收尾，攒着没报的那一段不能丢。
 */
export function VisitMeter({ path }: { path: string }) {
  useEffect(() => {
    const key = visitorKey();
    let aggregate: VisitAggregate = { visibleMs: 0, completionPct: seenPct() };
    let lastTick = Date.now();

    const send = (open: boolean): void => {
      // 先把"此刻看到哪儿"并进去，再取要上报的那一份：
      // 反过来的话，滚到底部这一次要等到下一次上报才看得出来，短访问会把 100% 报成 50%
      aggregate = { ...aggregate, completionPct: Math.max(aggregate.completionPct, seenPct()) };
      const { report, rest } = takePending(aggregate);
      aggregate = rest;
      const body = JSON.stringify({
        path,
        visitorKey: key,
        open,
        visibleMs: report.visibleMs,
        completionPct: report.completionPct,
        // §168 第三片：自报自动化标记（Playwright/Puppeteer 里是 true）。
        // 说谎没有收益——服务端还看 UA，而自报只是让"这是个工具"这件事少绕一圈
        webdriver: navigator.webdriver === true,
      });
      void fetch('/api/published/visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body,
        keepalive: true,
      }).catch(() => undefined);
    };

    // 打开这一页先记一次：visibleMs=0 的那一行也要留下"有人来过"
    const isOpen = !openedPaths.has(path);
    if (isOpen) openedPaths.add(path);
    send(isOpen);

    const tick = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      if (document.visibilityState === 'visible') aggregate = { ...aggregate, visibleMs: addVisibleMs(aggregate.visibleMs, delta) };
    }, TICK_MS);

    const flush = window.setInterval(() => send(false), FLUSH_INTERVAL_MS);

    const onHide = (): void => {
      if (document.visibilityState === 'hidden') send(false);
    };
    const onLeave = (): void => send(false);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(flush);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      send(false);
    };
  }, [path]);

  return null;
}
