import { BREAKPOINT_WIDTH, type BreakpointName, type Page as DesignPage } from '@nexus/design-model';

/**
 * §14 / §85 第三十一片：公开页的「默认按访客视口自动选档」。
 *
 * ADR-0069 否掉了"服务端猜视口宽"（CSS 不能拿长度除长度、Client Hints 只有 Chromium、
 * UA 猜设备不可靠）。剩下的零 JS 做法只有一条：**服务端把每一档都投影出来，
 * 用媒体查询决定哪一档可见**。它不是第二条渲染路径——四份投影来自同一个
 * `resolveLayout`，只是 breakpoint 不同；隐藏的那几份 `display:none`，不在可访问树里。
 *
 * 只在"作者真的写过断点规则"时启用：没有规则时四档的差别只是根画框宽度不同，
 * 内容仍按绝对坐标摆着，自动切换只会把画面裁掉——那种页面保持"设计尺寸"不变。
 */

export const PUBLISHED_VARIANT_ORDER: readonly BreakpointName[] = ['mobile', 'tablet', 'desktop', 'wide'];

/** 这一页有没有任何一条 responsive 规则（= 自动选档有没有意义） */
export function hasResponsiveRules(page: DesignPage): boolean {
  return Object.values(page.nodes).some((node) => (node.responsive?.length ?? 0) > 0);
}

export type PublishedViewport = 'auto' | 'design' | BreakpointName;

/**
 * `?viewport=` 的三个意思：没写 / `auto` = 自动；`design` = 钉住设计尺寸；
 * 四个断点名 = 钉住那一档。认不出来的值退回 `auto`（ADR-0063：认不出就降级，不 404）。
 */
export function publishedViewportFromParam(raw: string | undefined): PublishedViewport {
  if (!raw || raw === 'auto') return 'auto';
  if (raw === 'design') return 'design';
  return PUBLISHED_VARIANT_ORDER.find((id) => id === raw) ?? 'auto';
}

/**
 * 四档的媒体查询。区间由模型的 `BREAKPOINT_WIDTH` 推出来，界面不另抄一份数字：
 * mobile 0–767、tablet 768–1279、desktop 1280–1535、wide 1536+。
 * 默认全部 `display:none`，每个区间只放自己的那一档——JS 没加载也成立。
 */
export function publishedVariantsStyle(): string {
  const rules = ['[data-published-variant]{display:none}'];
  PUBLISHED_VARIANT_ORDER.forEach((id, index) => {
    const min = BREAKPOINT_WIDTH[id];
    const next = PUBLISHED_VARIANT_ORDER[index + 1];
    const condition =
      index === 0
        ? `(max-width: ${BREAKPOINT_WIDTH[next!] - 1}px)`
        : next
          ? `(min-width: ${min}px) and (max-width: ${BREAKPOINT_WIDTH[next] - 1}px)`
          : `(min-width: ${min}px)`;
    rules.push(`@media ${condition}{[data-published-variant="${id}"]{display:block}}`);
  });
  return rules.join('\n');
}
