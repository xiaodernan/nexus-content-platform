import { describe, expect, it } from 'vitest';
import { BREAKPOINT_WIDTH, createDocument, type Page } from '@nexus/design-model';
import {
  PUBLISHED_VARIANT_ORDER,
  hasResponsiveRules,
  publishedVariantsStyle,
  publishedViewportFromParam,
} from '@/studio/published-variants';

/**
 * §85 第三十一片 / ADR-0074：公开页的"默认按访客视口自动选档"。
 *
 * 这里钉的是服务端那半边的**纯函数**：参数怎么认、哪一页才值得铺四份、媒体查询的
 * 区间怎么从模型推出来。真浏览器里"390 下确实只有 mobile 那份可见"那一条在
 * e2e/viewer-breakpoint.spec.ts（要真路由 + 真媒体查询）。
 *
 * 区间那组断言直接**解析生成出来的 CSS**再逐宽度求值，而不是照着实现重写一遍：
 * `max-width: 767px` / `min-width: 768px` 少一 px 就会让某个宽度落进 0 份或 2 份，
 * 那种错只有把输出当数据读才抓得住。
 */

const starterDoc = createDocument('自动选档测试', 'website');
const starter = starterDoc.pages.find((p) => p.id === starterDoc.activePageId)!;

/** 一份断点规则都没有的页（starter 页自带 mobile 规则，先清掉，false 那一格才是造出来的） */
function plainPage(): Page {
  const nodes = { ...starter.nodes };
  for (const [id, node] of Object.entries(nodes)) {
    if (node.responsive?.length) nodes[id] = { ...node, responsive: undefined };
  }
  return { ...starter, nodes };
}

function withRuleOn(page: Page, breakpoint: 'mobile' | 'tablet' | 'desktop' | 'wide'): Page {
  const id = Object.keys(page.nodes).find((nodeId) => nodeId !== page.rootId)!;
  const nodes = { ...page.nodes };
  nodes[id] = { ...nodes[id]!, responsive: [{ breakpoint, patch: { visible: false } }] };
  return { ...page, nodes };
}

interface Band {
  id: string;
  min: number | null;
  max: number | null;
}

/** 把生成的 CSS 读回成区间：@media (…) { [data-published-variant="x"] { display:block } } */
function bandsOf(style: string): Band[] {
  const bands: Band[] = [];
  const pattern = /@media ([^{]+)\{\[data-published-variant="([a-z]+)"\]\{display:block\}\}/g;
  for (const match of style.matchAll(pattern)) {
    const condition = match[1]!;
    const min = /min-width:\s*(\d+)px/.exec(condition)?.[1];
    const max = /max-width:\s*(\d+)px/.exec(condition)?.[1];
    bands.push({
      id: match[2]!,
      min: min === undefined ? null : Number(min),
      max: max === undefined ? null : Number(max),
    });
  }
  return bands;
}

const matches = (band: Band, width: number): boolean =>
  (band.min === null || width >= band.min) && (band.max === null || width <= band.max);

describe('publishedViewportFromParam', () => {
  it('没写 / auto = 自动；design = 钉住设计尺寸；四个断点名原样认', () => {
    expect(publishedViewportFromParam(undefined)).toBe('auto');
    expect(publishedViewportFromParam('')).toBe('auto');
    expect(publishedViewportFromParam('auto')).toBe('auto');
    expect(publishedViewportFromParam('design')).toBe('design');
    for (const id of PUBLISHED_VARIANT_ORDER) expect(publishedViewportFromParam(id)).toBe(id);
  });

  it('认不出来的值退回 auto（ADR-0063：降级，不 404），大小写与数字都不猜', () => {
    expect(publishedViewportFromParam('phone')).toBe('auto');
    expect(publishedViewportFromParam('Mobile')).toBe('auto');
    expect(publishedViewportFromParam('375')).toBe('auto');
  });
});

describe('hasResponsiveRules', () => {
  it('一条规则都没有 = false（这种页铺四份只是把画面裁掉，默认输出不该变）', () => {
    expect(hasResponsiveRules(plainPage())).toBe(false);
  });

  it('任意一档有规则 = true（四档都值得解一份）', () => {
    for (const breakpoint of PUBLISHED_VARIANT_ORDER) {
      expect(hasResponsiveRules(withRuleOn(plainPage(), breakpoint)), `${breakpoint} 规则没被认出来`).toBe(true);
    }
  });
});

describe('publishedVariantsStyle', () => {
  const style = publishedVariantsStyle();

  it('先全部藏起来，再由媒体查询逐档放出来（顺序反了就会四份一起显示）', () => {
    expect(style.trimStart().startsWith('[data-published-variant]{display:none}')).toBe(true);
    expect(style.indexOf('display:none')).toBeLessThan(style.indexOf('@media'));
  });

  it('恰好四段，档名与顺序来自 PUBLISHED_VARIANT_ORDER', () => {
    expect(bandsOf(style).map((b) => b.id)).toEqual([...PUBLISHED_VARIANT_ORDER]);
  });

  it('0..2000 的每个宽度恰好落进一份（区间无缺口、无重叠，边界由模型推出）', () => {
    const bands = bandsOf(style);
    const gaps: number[] = [];
    const overlaps: number[] = [];
    for (let width = 0; width <= 2000; width += 1) {
      const hit = bands.filter((band) => matches(band, width));
      if (hit.length === 0) gaps.push(width);
      if (hit.length > 1) overlaps.push(width);
    }
    expect({ gaps: gaps.slice(0, 5), overlaps: overlaps.slice(0, 5) }).toEqual({ gaps: [], overlaps: [] });
    // 每一档的上下界都从模型推出：首档没有下界，末档没有上界，中间档的上界是下一档 −1
    PUBLISHED_VARIANT_ORDER.forEach((id, index) => {
      const band = bands.find((b) => b.id === id)!;
      const next = PUBLISHED_VARIANT_ORDER[index + 1];
      expect(band.min, `${id} 的下界`).toBe(index === 0 ? null : BREAKPOINT_WIDTH[id]);
      expect(band.max, `${id} 的上界`).toBe(next ? BREAKPOINT_WIDTH[next] - 1 : null);
    });
  });
});
