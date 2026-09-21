import {
  childIdList,
  colorToCss,
  layoutPage,
  resolveToken,
  type DesignDocument,
  type DesignNode,
} from '@nexus/design-model';

function fillOf(node: DesignNode, doc: DesignDocument): string {
  const f = node.fills[0];
  if (!f) return 'none';
  if (f.kind === 'solid') return colorToCss(f.color);
  if (f.kind === 'token') {
    const t = resolveToken(doc.tokens, f.ref);
    return t ? colorToCss(t.$value) : '#888';
  }
  if (f.kind === 'linear') return colorToCss(f.stops[0]?.color ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 });
  return '#5a6e8c'; // image fill → flat placeholder in a thumbnail
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : '&quot;'));
}

const n = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : 0);

/**
 * A deterministic, self-contained SVG snapshot of one page rendered straight from the Design
 * Model — the same `layoutPage` geometry the canvas paints (ADR 0005). Pure + no DOM: used for the
 * before/after thumbnails in the AI-diff card (§36) and reusable headless in evidence scripts.
 */
export function docToSvg(doc: DesignDocument, pageId: string): string {
  const layout = layoutPage(doc, pageId);
  const rects = Object.values(layout).filter((r) => Number.isFinite(r.x) && r.width > 0 && r.height > 0);
  if (!rects.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80" preserveAspectRatio="xMidYMid meet"><rect width="120" height="80" fill="#0b0e14"/></svg>`;
  }
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const parts: string[] = [];
  const walk = (id: string): void => {
    const node = doc.nodes[id];
    const r = layout[id];
    if (!node || !r || !node.visible) return;
    const fill = fillOf(node, doc);
    if (node.type === 'text') {
      const size = Math.max(8, r.height * 0.6);
      parts.push(
        `<text x="${n(r.x + 2)}" y="${n(r.y + r.height * 0.72)}" font-family="Inter,sans-serif" font-size="${n(size)}" fill="${fill}">${escapeXml(String(node.characters ?? '').slice(0, 80))}</text>`,
      );
    } else if (node.type !== 'page' && node.type !== 'document') {
      if (node.type === 'ellipse') {
        parts.push(`<ellipse cx="${n(r.x + r.width / 2)}" cy="${n(r.y + r.height / 2)}" rx="${n(r.width / 2)}" ry="${n(r.height / 2)}" fill="${fill}"/>`);
      } else {
        const rx = 'cornerRadius' in node ? node.cornerRadius : 0;
        parts.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" rx="${n(rx)}" fill="${fill}"/>`);
      }
    }
    for (const c of childIdList(node)) walk(c);
  };
  walk(pageId);

  const page = layout[pageId];
  const bg = page ? `<rect x="${n(page.x)}" y="${n(page.y)}" width="${n(page.width)}" height="${n(page.height)}" fill="#0b0e14"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(minX)} ${n(minY)} ${n(w)} ${n(h)}" width="${Math.round(w)}" height="${Math.round(h)}" preserveAspectRatio="xMidYMid meet">${bg}${parts.join('')}</svg>`;
}

/** Encode an SVG string as an inline data URI safe to drop into an <img src>. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
