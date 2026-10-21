import {
  childIdList,
  type AbsRect,
  type DesignDocument,
  type Point,
  type TextNode,
} from '@nexus/design-model';
import { paintToCss, resolveTextStyle, strokeToCss } from './paint';
import { clipBoxFor } from './clip';
import { handlePoints, rectCenter, rotateHandlePoint, ROTATE_HANDLE_GAP } from './rotate';
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
  /** Text node id currently edited on-canvas — its glyphs are replaced by the DOM overlay. */
  hideId?: string | null;
  /** Transient live-rotate preview (id → degrees); overrides each node's authored rotation while dragging. */
  rotations?: Record<string, number>;
  showChrome: boolean;
}

const PAGE_PAD = 40;
const DEG = Math.PI / 180;

/** Rotate a point about `c` by `deg` (clockwise/y-down, matching ctx.rotate). */
function rotPoint(c: Point, deg: number, px: number, py: number): Point {
  const rad = deg * DEG;
  const dx = px - c.x;
  const dy = py - c.y;
  return { x: c.x + Math.cos(rad) * dx - Math.sin(rad) * dy, y: c.y + Math.sin(rad) * dx + Math.cos(rad) * dy };
}

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
    for (const cid of childIdList(root)) drawNode(ctx, doc, layout, cid, viewport.zoom, scene.hideId, scene.rotations);
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

function drawNode(ctx: CanvasRenderingContext2D, doc: DesignDocument, layout: Record<string, AbsRect>, id: string, zoom: number, hideId?: string | null, rotations?: Record<string, number>): void {
  const node = doc.nodes[id];
  const r = layout[id];
  if (!node || !r || !node.visible) return;
  // While a text node is edited on-canvas, the DOM overlay replaces its glyphs.
  if (hideId && id === hideId && node.type === 'text') return;
  ctx.save();
  ctx.globalAlpha = node.opacity;
  const { x, y, width, height } = r;
  // Rotate the node about its own centre (per-node visual; container subtrees rotate individually).
  const rot = rotations?.[id] ?? node.rotation;
  if (rot) {
    const c = rectCenter(r);
    ctx.translate(c.x, c.y);
    ctx.rotate(rot * DEG);
    ctx.translate(-c.x, -c.y);
  }
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

  // A clipping container cuts its CHILDREN, never its own painted box, and the cut is applied AFTER the
  // node's own rotation is undone — the same axis-aligned turned bounds the SVG thumb and the artifact use
  // (`lib/clip`), so a turned frame clips wider than it looks in all three renderers alike.
  const clip = clipBoxFor(node, layout);
  if (clip) {
    ctx.save();
    roundRect(ctx, clip.x, clip.y, clip.width, clip.height, clip.radius);
    ctx.clip();
  }
  for (const cid of childIdList(node)) drawNode(ctx, doc, layout, cid, zoom, hideId, rotations);
  if (clip) ctx.restore();
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
  const { layout, selection, hoverId, viewport, doc, rotations } = scene;
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
    const rot = rotations?.[id] ?? doc.nodes[id]?.rotation ?? 0;
    const c = rectCenter(r);
    const corners = handlePoints(r).map(([hx, hy]) => rotPoint(c, rot, hx, hy));
    ctx.strokeStyle = '#6ea8fe';
    ctx.lineWidth = 1.5 / z;
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    if (selection.length === 1) {
      const hs = 8 / z;
      for (const p of corners) {
        ctx.beginPath();
        ctx.rect(p.x - hs / 2, p.y - hs / 2, hs, hs);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#6ea8fe';
        ctx.lineWidth = 1 / z;
        ctx.stroke();
      }
      // Rotate grip: stem from the top-edge midpoint out to a grab circle, carried with rotation.
      const topMid = rotPoint(c, rot, c.x, r.y);
      const grip = rotateHandlePoint(r, rot, ROTATE_HANDLE_GAP / z);
      ctx.strokeStyle = '#6ea8fe';
      ctx.lineWidth = 1 / z;
      ctx.beginPath();
      ctx.moveTo(topMid.x, topMid.y);
      ctx.lineTo(grip.x, grip.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(grip.x, grip.y, 4 / z, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();
    }
  }
}
