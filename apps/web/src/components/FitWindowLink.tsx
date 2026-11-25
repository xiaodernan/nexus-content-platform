'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { fitZoom, viewerHref, type ViewerQuery } from '@/studio/viewer-params';

const COPY: Record<Locale, { label: string; title: string }> = {
  zh: {
    label: '适应窗口',
    title: '按你现在的窗口宽度把整页缩放进去（只改视图，不改作品本身）。',
  },
  en: {
    label: 'Fit window',
    title: 'Scale the whole page to your current window width (view only — the work itself is untouched).',
  },
};

/**
 * 公开作品页的「适应窗口」：Studio 有同一颗按钮（CanvasStage 的 fitToWindow），
 * 公开页此前没有——第十三片移动端审计量到 390 下首屏只见 27%、要平移 1082px。
 *
 * 这是这一排里唯一需要读访客视口的控件（服务端拿不到 window.innerWidth），
 * 所以它单独是客户端组件；SSR 阶段视口未知，先按 1 渲染，挂载后再量一次写入 state。
 * 点击后用与其余档位完全相同的 viewerHref 写 URL，因而分享/收藏出来的链接
 * 和手动点那一档没有区别（没有第二条渲染路径）。
 */
export function FitWindowLink({
  base,
  query,
  designWidth,
  currentZoom,
  locale = 'zh',
}: {
  base: string;
  query: ViewerQuery;
  designWidth: number;
  currentZoom: number;
  locale?: Locale;
}) {
  const router = useRouter();
  const c = COPY[locale];
  // SSR 安全：初值 1（视口未知，不缩）；挂载后量真实宽度再决定
  const [fit, setFit] = useState(1);
  useEffect(() => {
    setFit(fitZoom(designWidth || 0, window.innerWidth));
  }, [designWidth]);

  const href = viewerHref(base, query, { zoom: fit === 1 ? undefined : String(fit) });

  return (
    <a
      href={href}
      data-viewer-fit-window
      data-viewer-fit-zoom={fit}
      className={fit === currentZoom ? 'vc-pill vc-pillOn' : 'vc-pill vc-pillIdle'}
      title={c.title}
      onClick={(e) => {
        // 保留普通 <a> 的语义（可中键新开、可复制地址）；只在左键无修饰时交给 router 以免整页刷新
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        // 再量一次：窗口在链接渲染之后被拖动过，也按当前宽度走
        const fresh = fitZoom(designWidth || 0, window.innerWidth);
        router.push(viewerHref(base, query, { zoom: fresh === 1 ? undefined : String(fresh) }));
      }}
    >
      {c.label}
    </a>
  );
}
