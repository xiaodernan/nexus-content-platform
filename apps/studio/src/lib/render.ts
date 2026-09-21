import {
  childIdList,
  type AbsRect,
  type DesignDocument,
  type TextNode,
} from '@nexus/design-model';
import { paintToCss, resolveTextStyle, strokeToCss } from './paint';
import type { Viewport } from './store';

export interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Scene {
  doc: DesignDocument;
  pageId: string;
  layout: Record<string, AbsRect>;
  viewport: Viewport;
  selection: string[];
  hoverId?: string | null;
  marquee?: Marquee | null;
  guides?: { xs: number[]; ys: number[] };
  showChrome: boolean;
}

const PAGE_PAD = 40;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, cssW: number, cssH: number, dpr: number): void {
  const { doc, pageId, layout, viewport, marquee, guides, showChrome } = scene;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0a0d13';
  ctx.fillRect(0, 0, cssW, cssH);

  const grid = viewport.zoom > 0.9 ? 40 : 0;
  if (grid > 0) drawGrid(ctx, viewport, cssW, cssH, grid);

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.zoom, viewport.zoom);

  const page = layout[pageId];
  if (page) {
    ctx.fillStyle = '#0b0e14';
    ctx.strokeStyle = 'rgba(110,168,254,0.25)';
    ctx.lineWidth = 1 / viewport.zoom;
    roundRect(ctx, page.x - PAGE_PAD, page.y - PAGE_PAD, page.width + 2 * PAGE_PAD, page.height + 2 * PAGE_PAD, 12);
    ctx.fill();
    ctx.fillStyle = '#0e131d';
    ctx.fillRect(page.x, page.y, page.width, page.height);
  }

  const root = doc.nodes[pageId];
  if (root) {
    ctx.save();
    ctx.beginPath();
    if (page) ctx.rect(page.x, page.y, page.width, page.height);
    ctx.clip();
    for (const cid of childIdList(root)) drawNode(ctx, doc, layout, cid, viewport.zoom);
    ctx.restore();
  }

  if (showChrome) drawChrome(ctx, scene);

  if (guides?.xs || guides?.ys) {
    ctx.strokeStyle = '#ff5da2';
    ctx.lineWidth = 1 / viewport.zoom;
    for (const gx of guides?.xs ?? []) {
      ctx.beginPath();
      ctx.moveTo(gx, page ? page.y - PAGE_PAD : -1e5);
      ctx.lineTo(gx, page ? page.y + page.height + PAGE_PAD : 1e5);
      ctx.stroke();
    }
    for (const gy of guides?.ys ?? []) {
      ctx.beginPath();
      ctx.moveTo(page ? page.x - PAGE_PAD : -1e5, gy);
      ctx.lineTo(page ? page.x + page.width + PAGE_PAD : 1e5, gy);
      ctx.stroke();
    }
  }

  if (marquee) {
    ctx.fillStyle = 'rgba(110,168,254,0.12)';
    ctx.strokeStyle = 'rgba(110,168,254,0.9)';
    ctx.lineWidth = 1 / viewport.zoom;
    const x = Math.min(marquee.x0, marquee.x1);
    const y = Math.min(marquee.y0, marquee.y1);
    const w = Math.abs(marquee.x1 - marquee.x0);
    const h = Math.abs(marquee.y1 - marquee.y0);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, v: Viewport, cssW: number, cssH: number, step: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  const startWX = Math.floor(-v.x / v.zoom / step) * step;
  const startWY = Math.floor(-v.y / v.zoom / step) * step;
  const endWX = (cssW - v.x) / v.zoom;
  const endWY = (cssH - v.y) / v.zoom;
  for (let x = startWX; x < endWX; x += step) {
    const sx = x * v.zoom + v.x;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, cssH);
    ctx.stroke();
  }
  for (let y = startWY; y < endWY; y += step) {
    const sy = y * v.zoom + v.y;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(cssW, sy);
    ctx.stroke();
  }
}

function drawNode(ctx: CanvasRenderingContext2D, doc: DesignDocument, layout: Record<string, AbsRect>, id: string, zoom: number): void {
  const node = doc.nodes[id];
  const r = layout[id];
  if (!node || !r || !node.visible) return;
  ctx.save();
  ctx.globalAlpha = node.opacity;
  const { x, y, width, height } = r;
  const radius = 'cornerRadius' in node ? node.cornerRadius : 0;

  if (node.type === 'text') {
    drawText(ctx, node as TextNode, doc, x, y, width, height, zoom);
  } else if (node.type === 'line') {
    ctx.strokeStyle = node.strokes[0] ? strokeToCss(node.strokes[0]) : '#888';
    ctx.lineWidth = (node.strokes[0]?.weight ?? 2) / 1;
    ctx.beginPath();
    ctx.moveTo(x, y + height / 2);
    ctx.lineTo(x + width, y + height / 2);
    ctx.stroke();
  } else if (node.type === 'path') {
    try {
      const p = new Path2D((node as { d: string }).d);
      ctx.translate(x, y);
      for (const f of node.fills) {
        ctx.fillStyle = paintToCss(f, doc);
        ctx.fill(p);
      }
    } catch {
      /* ignore invalid path in demo */
    }
  } else {
    if (node.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2, Math.max(0.1, width / 2), Math.max(0.1, height / 2), 0, 0, Math.PI * 2);
    } else {
      roundRect(ctx, x, y, width, height, radius);
    }
    for (const f of node.fills) {
      const css = paintToCss(f, doc);
      ctx.fillStyle = css;
      ctx.fill();
    }
    if (node.type === 'image') drawImagePlaceholder(ctx, width, height, zoom);
    for (const s of node.strokes) {
      ctx.strokeStyle = strokeToCss(s);
      ctx.lineWidth = s.weight;
      ctx.stroke();
    }
  }
  ctx.restore();

  for (const cid of childIdList(node)) drawNode(ctx, doc, layout, cid, zoom);
}

function drawImagePlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, h);
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, node: TextNode, doc: DesignDocument, x: number, y: number, w: number, h: number, zoom: number): void {
  const st = resolveTextStyle(doc, node.style);
  ctx.fillStyle = node.fills[0] ? paintToCss(node.fills[0], doc) : '#e6ecf5';
  ctx.font = st.font;
  ctx.textBaseline = 'top';
  ctx.textAlign = st.align;
  const lines = wrapText(ctx, node.characters, w);
  const lh = st.sizePx * st.lineHeight;
  let ty = y;
  const tx = st.align === 'center' ? x + w / 2 : st.align === 'right' ? x + w : x;
  void h;
  void zoom;
  for (const line of lines) {
    ctx.fillText(line, tx, ty);
    ty += lh;
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/);
    let line = '';
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = wd;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

function drawChrome(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { layout, selection, hoverId, viewport, doc } = scene;
  const z = viewport.zoom;
  if (hoverId && !selection.includes(hoverId) && layout[hoverId]) {
    const r = layout[hoverId];
    ctx.strokeStyle = 'rgba(110,168,254,0.55)';
    ctx.lineWidth = 1 / z;
    ctx.strokeRect(r.x, r.y, r.width, r.height);
  }
  for (const id of selection) {
    const r = layout[id];
    if (!r) continue;
    ctx.strokeStyle = '#6ea8fe';
    ctx.lineWidth = 1.5 / z;
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    if (selection.length === 1) {
      const hs = 8 / z;
      ctx.fillStyle = '#0b0e14';
      for (const [hx, hy] of handlePoints(r)) {
        ctx.beginPath();
        ctx.rect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#6ea8fe';
        ctx.lineWidth = 1 / z;
        ctx.stroke();
      }
    }
  }
  void doc;
}

export function handlePoints(r: AbsRect): [number, number, string][] {
  const { x, y, width: w, height: h } = r;
  return [
    [x, y, 'nw'],
    [x + w, y, 'ne'],
    [x, y + h, 'sw'],
    [x + w, y + h, 'se'],
  ];
}
