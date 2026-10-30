import { BREAKPOINT_WIDTH, type BreakpointName, type Page as DesignPage } from '@nexus/design-model';

/**
 * §14 / ADR-0063：查看器状态（看哪一页、按哪个断点重解、放大多少）走**服务端查询参数**，
 * 界面上给的是 `<a>` 而不是客户端岛——零 JS 也生效、可收藏、可分享，
 * 且与 SSR 投影共用同一份 `resolveLayout`，不存在"第二条渲染路径"。
 *
 * 这个模块存在的理由是先前的两处手抄：`/preview` 里一份断点表、Studio 顶栏里一份宽度数字。
 * 宽度一律取自模型的 `BREAKPOINT_WIDTH`（§16：断点是模型说的，不是界面说的）。
 */

/** 访客页与预览页共用的查询参数；缺省即"作者发布的那一份"，不改任何像素 */
export interface ViewerQuery {
  page?: string;
  viewport?: string;
  zoom?: string;
  /** 仅 `/preview` 用（§124 / ADR-0063）；公开页不提供状态模拟，所以那里不会出现这一项 */
  state?: string;
}

const VIEWER_KEYS = ['page', 'viewport', 'zoom', 'state'] as const;

const BREAKPOINT_NAMES: readonly BreakpointName[] = ['mobile', 'tablet', 'desktop', 'wide'];

/** 中文说法在这里，宽度数字一律从模型取——界面不复制一份会过期的数 */
export const BREAKPOINT_LABELS: Record<BreakpointName, string> = {
  mobile: '手机',
  tablet: '平板',
  desktop: '桌面',
  wide: '宽屏',
};

export interface ViewerViewportOption {
  id: BreakpointName;
  label: string;
  width: number;
}

/** 断点选项（含宽度读数），宽度取自模型的 `BREAKPOINT_WIDTH` */
export const VIEWPORT_OPTIONS: readonly ViewerViewportOption[] = BREAKPOINT_NAMES.map((id) => ({
  id,
  width: BREAKPOINT_WIDTH[id],
  label: `${BREAKPOINT_LABELS[id]} ${BREAKPOINT_WIDTH[id]}`,
}));

/** 只有这四个名字算断点；别的值（手改的、过期的链接）退回"按设计尺寸"，不 404 */
export function breakpointFromParam(raw: string | undefined): BreakpointName | undefined {
  return BREAKPOINT_NAMES.find((id) => id === raw);
}

/**
 * §14：这一页上哪几个断点**真的会改变投影**。
 *
 * 为什么需要这道判断而不是直接摆四个按钮：`resolveLayout` 在有断点时把根画框宽
 * 直接取 `BREAKPOINT_WIDTH[breakpoint]`（layout.ts 的 `finalRoot.width`），所以
 * 一个 375 宽的稿子点「手机 375」是一次**逐字节相同**的重解——那颗按钮点了没反应（§159）。
 *
 * 反过来，只要作者写过任何一条断点规则，四个都留着：规则按 `<=` 级联生效，
 * 而且重解本身会搬动 fill/hug 的孩子，证明不了哪一个一定是空的。
 * 证明不了就别藏——藏掉的是访客真的能用的那一格。
 */
export function liveBreakpoints(page: DesignPage): BreakpointName[] {
  if (Object.values(page.nodes).some((node) => (node.responsive?.length ?? 0) > 0)) {
    return [...BREAKPOINT_NAMES];
  }
  const root = page.nodes[page.rootId];
  const authored = typeof root?.size.width === 'number' ? root.size.width : null;
  // 根宽是写死的数字、且没有规则：那个数字对应的断点就是空按钮
  if (authored === null) return [...BREAKPOINT_NAMES];
  return BREAKPOINT_NAMES.filter((id) => BREAKPOINT_WIDTH[id] !== authored);
}

/** 缩到多小都不如看不见有用：下限 0.25，上限 1（放大由浏览器自己的双指负责，这里不接管） */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 1;
export const ZOOM_STEPS: readonly number[] = [1, 0.75, 0.5, 0.25];

/** 读不出数字、0、负数、比 1 大 → 一律回到 1；合法值夹进 [0.25, 1] */
export function zoomFromParam(raw: string | undefined): number {
  const parsed = Number(raw ?? 1);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parsed));
}

/**
 * 改一个查看器参数，其余带过去（ADR-0063 那条"切状态不丢取景框"的同一条纪律）：
 * 翻页、换断点、缩放都是"查看"，不该顺手把访客正在看的另外两个重置掉。
 *
 * `next` 里**显式给了键**（哪怕值是 `undefined`）就以它为准——那是"清掉这一项"；
 * 没给的键才沿用当前值。这两种意图在界面上是两颗不同的按钮，混不起。
 */
export function viewerHref(
  base: string,
  current: ViewerQuery,
  next: Partial<Record<keyof ViewerQuery, string | undefined>>,
): string {
  const sp = new URLSearchParams();
  for (const key of VIEWER_KEYS) {
    const value = key in next ? next[key] : current[key];
    if (value) sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

/** 服务端把当前查看器状态交给客户端组件时用的形状：翻页时要原样带走的除 page 之外的参数 */
export function keepViewerParams(current: ViewerQuery): Record<string, string> {
  const keep: Record<string, string> = {};
  if (current.viewport) keep.viewport = current.viewport;
  if (current.zoom) keep.zoom = current.zoom;
  return keep;
}
