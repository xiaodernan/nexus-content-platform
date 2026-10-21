import {
  childIdList,
  colorToCss,
  layoutPage,
  resolveToken,
  type DesignDocument,
  type DesignNode,
} from '@nexus/design-model';
import { resolveTextStyle, strokeToCss } from './paint';
import { clipBoxFor } from './clip';

/**
 * The most text a thumbnail may carry. A thumb travels as a data URI inside an `<img>`, so its bytes are the
 * price of every card in the gallery — the cap is real. What was NOT real until v294: the cut used to be
 * silent, which told a viewer the words ended where they did not. A cut is now marked.
 */
const TEXT_CAP = 80;

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

  const clips: string[] = [];
  let clipSeq = 0;
  const walk = (id: string): string => {
    const node = doc.nodes[id];
    const r = layout[id];
    if (!node || !r || !node.visible) return '';
    const fill = fillOf(node, doc);
    // Match the canvas: turn about the node's own centre, and let children turn individually.
    const turn = node.rotation
      ? ` transform="rotate(${n(node.rotation)} ${n(r.x + r.width / 2)} ${n(r.y + r.height / 2)})"`
      : '';
    // SVG strokes a path centred on it, exactly as `ctx.stroke()` does, so the same weight carries over.
    // Both the weight and the alpha are emitted RAW, as the canvas and the artifact use them — rounding a
    // 0.05-step opacity to one decimal would fade the thumb to a value no renderer was ever given.
    const s = node.strokes[0];
    const line = s ? ` stroke="${strokeToCss(s)}" stroke-width="${s.weight}"` : '';
    // The canvas sets globalAlpha per node and restores before recursing, so a parent's fade does not
    // multiply into its children — which is what these flat siblings do too, hence one attribute per element.
    const fade = node.opacity === 1 ? '' : ` opacity="${node.opacity}"`;
    let self = '';
    if (node.type === 'text') {
      // v294 — the thumb used to INVENT a size from the box (`height * 0.6`): a hero headline the model sets
      // to `font.size.2xl` = 40px painted at 57.6px, a 20px subhead at 38.4px, and left/center/right all drew
      // at the same x. It now resolves the SAME style the canvas and the artifact resolve, tokens included.
      const st = resolveTextStyle(doc, node.style);
      // The canvas picks the anchor point the same way (`render.drawText`: x, x + w/2, x + w).
      const tx = st.align === 'center' ? r.x + r.width / 2 : st.align === 'right' ? r.x + r.width : r.x;
      const anchor = st.align === 'center' ? 'middle' : st.align === 'right' ? 'end' : null;
      const raw = String(node.characters ?? '');
      const shown = raw.length > TEXT_CAP ? `${raw.slice(0, TEXT_CAP)}…` : raw;
      const lh = st.sizePx * st.lineHeight;
      // SVG's `y` is a BASELINE where the canvas' `textBaseline:'top'` is a line TOP, so 0.8em stands in for
      // the ascent — the thumb's own stated convention, not a measurement. One divergence is accepted rather
      // than faked: the canvas measures glyphs and WRAPS at the box width, and an SVG string has no font
      // engine to measure with, so the thumb breaks only on the author's own newlines.
      const lines = shown.split('\n');
      const spans = lines.map((line, i) => `<tspan x="${n(tx)}" dy="${i === 0 ? n(st.sizePx * 0.8) : n(lh)}">${escapeXml(line)}</tspan>`).join('');
      const weight = ` font-weight="${n(st.weight)}"`;
      const track = st.letterSpacing ? ` letter-spacing="${n(st.letterSpacing)}"` : '';
      // `xml:space` because the artifact renders the author's spaces (`white-space:pre-wrap`) and SVG would
      // otherwise collapse them — a thumb that closes up the words it pictures is a different kind of lie.
      self = `<text${turn} x="${n(tx)}" y="${n(r.y)}" font-family="${escapeXml(st.family)}" font-size="${n(st.sizePx)}"${weight}${track}${anchor ? ` text-anchor="${anchor}"` : ''} xml:space="preserve" fill="${fill}"${fade}>${spans}</text>`;
    } else if (node.type !== 'page' && node.type !== 'document') {
      if (node.type === 'ellipse') {
        self = `<ellipse${turn} cx="${n(r.x + r.width / 2)}" cy="${n(r.y + r.height / 2)}" rx="${n(r.width / 2)}" ry="${n(r.height / 2)}" fill="${fill}"${line}${fade}/>`;
      } else {
        const rx = 'cornerRadius' in node ? node.cornerRadius : 0;
        self = `<rect${turn} x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" rx="${n(rx)}" fill="${fill}"${line}${fade}/>`;
      }
    }

    const kids = childIdList(node).map(walk).join('');
    // The canvas turns a node about its own centre and restores before recursing, so children keep their
    // own unturned positions; the clip must therefore be the container's turned BOUNDS, not its quad.
    // A clipping container cuts its CHILDREN, never its own box, and the cut is the same axis-aligned
    // turned bounds the canvas clips to and the artifact insets to (`lib/clip`).
    const box = clipBoxFor(node, layout);
    if (!box || !kids) return self + kids;
    const ref = `clip${++clipSeq}`;
    clips.push(`<clipPath id="${ref}" clipPathUnits="userSpaceOnUse"><rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" rx="${n(box.radius)}"/></clipPath>`);
    return `${self}<g clip-path="url(#${ref})">${kids}</g>`;
  };
  const body = walk(pageId);

  const page = layout[pageId];
  const bg = page ? `<rect x="${n(page.x)}" y="${n(page.y)}" width="${n(page.width)}" height="${n(page.height)}" fill="#0b0e14"/>` : '';
  const defs = clips.length ? `<defs>${clips.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(minX)} ${n(minY)} ${n(w)} ${n(h)}" width="${Math.round(w)}" height="${Math.round(h)}" preserveAspectRatio="xMidYMid meet">${bg}${defs}${body}</svg>`;
}

/** Encode an SVG string as an inline data URI safe to drop into an <img src>. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
