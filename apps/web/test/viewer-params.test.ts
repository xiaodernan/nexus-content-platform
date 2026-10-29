import { describe, expect, it } from 'vitest';
import { BREAKPOINT_WIDTH, createDocument, type Page, type Size } from '@nexus/design-model';
import {
  VIEWPORT_OPTIONS,
  ZOOM_STEPS,
  liveBreakpoints,
  breakpointFromParam,
  keepViewerParams,
  viewerHref,
  zoomFromParam,
} from '@/studio/viewer-params';

/**
 * §14 / ADR-0069：查看器参数是**投影层的读法**，不是模型的一部分——
 * 但它决定访客看到的是哪一份几何，所以"名字怎么认、数怎么夹、链接怎么拼"这三件事
 * 必须在服务端一处定死，两个页面（公开页 / 预览页）才会说同一种话。
 *
 * 这里钉的是纯函数；参数真的换掉像素那一条在 e2e/viewer-breakpoint.spec.ts（要真路由的 HTML）。
 */

const doc = createDocument('查看器参数测试', 'website');
const starter = doc.pages.find((p) => p.id === doc.activePageId)!;

/** 造一份"根画框尺寸/断点规则已知"的页：先把模型自带的规则清空，
 *  这样 false 那一格是造出来的，不是碰巧 starter 页里没有规则 */
function pageWith(input: { rootSize?: Partial<Size>; ruleOn?: string }): Page {
  const nodes = { ...starter.nodes };
  for (const [id, node] of Object.entries(nodes)) {
    if (node.responsive?.length) nodes[id] = { ...node, responsive: undefined };
  }
  if (input.rootSize) {
    const root = nodes[starter.rootId]!;
    nodes[starter.rootId] = { ...root, size: { ...root.size, ...input.rootSize } };
  }
  if (input.ruleOn) {
    const node = nodes[input.ruleOn]!;
    nodes[input.ruleOn] = { ...node, responsive: [{ breakpoint: 'mobile', patch: { visible: false } }] };
  }
  return { ...starter, nodes };
}

const plainRoot = pageWith({});
const someNodeId = Object.keys(plainRoot.nodes).find((id) => id !== plainRoot.rootId)!;

describe('breakpointFromParam', () => {
  it('四个名字都认，别的值退回"按设计尺寸"而不是 404', () => {
    for (const id of ['mobile', 'tablet', 'desktop', 'wide'] as const) {
      expect(breakpointFromParam(id), `断点 ${id} 应该认得`).toBe(id);
    }
    expect(breakpointFromParam(undefined)).toBeUndefined();
    expect(breakpointFromParam('')).toBeUndefined();
    expect(breakpointFromParam('phone')).toBeUndefined();
    // 名字是模型里的键，大小写不认——手打的 Mobile 退回设计尺寸，不猜访客想说什么
    expect(breakpointFromParam('Mobile')).toBeUndefined();
    // 数字也不是断点名：?viewport=375 不该被当成 mobile
    expect(breakpointFromParam('375')).toBeUndefined();
  });
});

describe('VIEWPORT_OPTIONS', () => {
  it('宽度一个都不手抄：逐个等于模型的 BREAKPOINT_WIDTH', () => {
    expect(VIEWPORT_OPTIONS.map((o) => o.id)).toEqual(['mobile', 'tablet', 'desktop', 'wide']);
    expect(VIEWPORT_OPTIONS.map((o) => o.width)).toEqual(VIEWPORT_OPTIONS.map((o) => BREAKPOINT_WIDTH[o.id]));
    // 并且真的不是同一个数组自己跟自己对：换个说法钉住那四个数
    expect(VIEWPORT_OPTIONS.map((o) => o.width)).toEqual([
      BREAKPOINT_WIDTH.mobile,
      BREAKPOINT_WIDTH.tablet,
      BREAKPOINT_WIDTH.desktop,
      BREAKPOINT_WIDTH.wide,
    ]);
  });

  it('标签上写的数就是求解用的那个数（界面无处可撒谎）', () => {
    for (const option of VIEWPORT_OPTIONS) {
      expect(option.label).toContain(String(option.width));
    }
  });
});

describe('zoomFromParam', () => {
  it('合法值照收，读不出来的与越界的都回到能看见的那一侧', () => {
    expect(zoomFromParam(undefined)).toBe(1);
    expect(zoomFromParam('1')).toBe(1);
    expect(zoomFromParam('0.5')).toBe(0.5);
    expect(zoomFromParam('0.75')).toBe(0.75);
    // 比下限还小 → 夹到 0.25：缩到看不见不等于"按访客的意思办"
    expect(zoomFromParam('0.1')).toBe(0.25);
    expect(zoomFromParam('0')).toBe(1);
    expect(zoomFromParam('-2')).toBe(1);
    // 比 1 大 → 回到 1：这一排控件只管缩小，放大交给浏览器自己
    expect(zoomFromParam('2')).toBe(1);
    expect(zoomFromParam('abc')).toBe(1);
    expect(zoomFromParam('NaN')).toBe(1);
    // 界面上摆的就是这几个档，每一档读回来都得是它自己
    for (const step of ZOOM_STEPS) expect(zoomFromParam(String(step))).toBe(step);
  });
});

describe('viewerHref', () => {
  it('没给的键原样带过去：换断点不丢缩放，切状态不丢取景框', () => {
    expect(viewerHref('/n/a/b', { viewport: 'mobile', zoom: '0.5' }, { zoom: '0.75' })).toBe(
      '/n/a/b?viewport=mobile&zoom=0.75',
    );
    expect(viewerHref('/preview/p1', { page: 'p2', viewport: 'tablet', zoom: '0.5' }, { state: 'loading' })).toBe(
      '/preview/p1?page=p2&viewport=tablet&zoom=0.5&state=loading',
    );
  });

  it('显式给了 undefined 才算"清掉这一项"——这两种意图是两颗不同的按钮', () => {
    const current = { page: 'p2', viewport: 'mobile', zoom: '0.5', state: 'error' };
    expect(viewerHref('/n/a/b', current, { viewport: undefined })).toBe('/n/a/b?page=p2&zoom=0.5&state=error');
    // 空对象＝一个都不动；只有 next 里出现过的键才被改写
    expect(viewerHref('/n/a/b', current, {})).toBe('/n/a/b?page=p2&viewport=mobile&zoom=0.5&state=error');
  });

  it('键序固定，参数全空时不带问号', () => {
    // 顺序是 ADR-0063 那条 URL 断言的一部分：viewport 永远排在 state 前面
    expect(viewerHref('/preview/p1', {}, { state: 'loading', viewport: 'tablet' })).toBe(
      '/preview/p1?viewport=tablet&state=loading',
    );
    expect(viewerHref('/n/a/b', {}, { zoom: undefined })).toBe('/n/a/b');
  });
});

describe('keepViewerParams', () => {
  it('只带 viewport 与 zoom：page 由热点目标决定，state 只在预览页有意义', () => {
    expect(keepViewerParams({ page: 'p2', viewport: 'mobile', zoom: '0.5', state: 'error' })).toEqual({
      viewport: 'mobile',
      zoom: '0.5',
    });
    expect(keepViewerParams({})).toEqual({});
  });
});

describe('liveBreakpoints', () => {
  it('根宽 1440、没有规则 ⇒ 四个都留着：每个都会重解出别的宽', () => {
    expect(Object.values(plainRoot.nodes).filter((n) => (n.responsive?.length ?? 0) > 0)).toHaveLength(0);
    expect(typeof plainRoot.nodes[plainRoot.rootId]!.size.width).toBe('number');
    expect(liveBreakpoints(plainRoot)).toEqual(['mobile', 'tablet', 'desktop', 'wide']);
  });

  it('根宽正好等于某一档的断点宽、且没有规则 ⇒ 那一档是空按钮，不摆', () => {
    // 375 那一档与"按设计尺寸"逐字节同解，这条在 packages/design-model/test/layout.test.ts 里钉着
    for (const width of [375, 768, 1280, 1536]) {
      const ids = liveBreakpoints(pageWith({ rootSize: { width } }));
      const dead = (['mobile', 'tablet', 'desktop', 'wide'] as const).find((id) => BREAKPOINT_WIDTH[id] === width);
      expect(ids, `根宽 ${width} 时 ${dead} 那一档不该摆`).not.toContain(dead);
      expect(ids).toHaveLength(3);
    }
  });

  it('写过任何一条断点规则 ⇒ 四个都留着：规则按 <= 级联，证明不了哪一档是空的', () => {
    const authored = pageWith({ rootSize: { width: 375 }, ruleOn: someNodeId });
    expect(liveBreakpoints(authored)).toEqual(['mobile', 'tablet', 'desktop', 'wide']);
  });

  it('根宽是 fill/hug（不是数字）⇒ 四个都留着：设计宽本身就跟着可用宽走', () => {
    expect(liveBreakpoints(pageWith({ rootSize: { width: 'fill' } }))).toHaveLength(4);
    expect(liveBreakpoints(pageWith({ rootSize: { width: 'hug' } }))).toHaveLength(4);
  });
});
