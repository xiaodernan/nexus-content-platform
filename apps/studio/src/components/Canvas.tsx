'use client';
import { useCallback, useEffect, useRef } from 'react';
import {
  boundsOfSubtree,
  hitTest,
  layoutPage,
  type AbsRect,
  type Point,
} from '@nexus/design-model';
import { drawScene, handlePoints, type Marquee } from '@/lib/render';
import { useStudio, type LiveGeom } from '@/lib/store';

const MOVE_THRESHOLD = 3; // px on screen before a click becomes a drag

function rectIntersects(a: AbsRect, m: Marquee): boolean {
  const x0 = Math.min(m.x0, m.x1);
  const x1 = Math.max(m.x0, m.x1);
  const y0 = Math.min(m.y0, m.y1);
  const y1 = Math.max(m.y0, m.y1);
  return a.x < x1 && a.x + a.width > x0 && a.y < y1 && a.y + a.height > y0;
}

function applyMove(base: AbsRect, dx: number, dy: number): LiveGeom {
  return { x: base.x + dx, y: base.y + dy, width: base.width, height: base.height };
}

function applyResize(base: AbsRect, corner: string, dx: number, dy: number): LiveGeom {
  let { x, y, width, height } = base;
  if (corner.includes('e')) width = Math.max(4, width + dx);
  if (corner.includes('s')) height = Math.max(4, height + dy);
  if (corner.includes('w')) {
    width = Math.max(4, width - dx);
    x = base.x + (base.width - width);
  }
  if (corner.includes('n')) {
    height = Math.max(4, height - dy);
    y = base.y + (base.height - height);
  }
  return { x, y, width, height };
}

export default function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mutable interaction scratch that must not trigger re-render per mousemove.
  const drag = useRef<{
    kind: 'idle' | 'pan' | 'move' | 'resize' | 'marquee' | 'maybeMove';
    startClient: Point;
    startWorld: Point;
    baseGeoms: Record<string, LiveGeom>;
    resizeId?: string;
    corner?: string;
    additive?: boolean;
    moved: boolean;
    spaceHeld: boolean;
  }>({ kind: 'idle', startClient: { x: 0, y: 0 }, startWorld: { x: 0, y: 0 }, baseGeoms: {}, moved: false, spaceHeld: false });

  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const el = canvasRef.current!;
    const rect = el.getBoundingClientRect();
    const v = useStudio.getState().viewport;
    return { x: (clientX - rect.left - v.x) / v.zoom, y: (clientY - rect.top - v.y) / v.zoom };
  }, []);

  // ---- render loop ---------------------------------------------------------
  const render = useCallback(() => {
    const el = canvasRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    if (el.width !== Math.round(cssW * dpr) || el.height !== Math.round(cssH * dpr)) {
      el.width = Math.round(cssW * dpr);
      el.height = Math.round(cssH * dpr);
      el.style.width = cssW + 'px';
      el.style.height = cssH + 'px';
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const s = useStudio.getState();
    const pageId = s.doc.activePageId;
    const base = layoutPage(s.doc, pageId);
    // overlay live geometry for smooth drag/resize without mutating the doc
    const layout: Record<string, AbsRect> = { ...base };
    for (const [id, g] of Object.entries(s.liveGeom)) {
      if (layout[id]) layout[id] = { ...layout[id], ...g };
    }
    let marquee: Marquee | null = null;
    const it = s.interaction;
    if (it.type === 'marquee') {
      marquee = { x0: it.start.x, y0: it.start.y, x1: it.current.x, y1: it.current.y };
    }
    drawScene(
      ctx,
      { doc: s.doc, pageId, layout, viewport: s.viewport, selection: s.selection, hoverId: s.hoverId, marquee, showChrome: true },
      cssW,
      cssH,
      dpr,
    );
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const wrap = wrapRef.current;
    const ro = new ResizeObserver(() => render());
    if (wrap) ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [render]);

  // ---- keyboard ------------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const st = useStudio.getState();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const mod = e.metaKey || e.ctrlKey;

      if (e.code === 'Space') {
        drag.current.spaceHeld = true;
        e.preventDefault();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.duplicateSelection();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.deleteSelection();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (e.key === 'ArrowLeft') st.moveSelectionBy(-step, 0);
        else if (e.key === 'ArrowRight') st.moveSelectionBy(step, 0);
        else if (e.key === 'ArrowUp') st.moveSelectionBy(0, -step);
        else st.moveSelectionBy(0, step);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'v') st.setTool('select');
      else if (k === 'r') st.setTool('rectangle');
      else if (k === 'o') st.setTool('ellipse');
      else if (k === 'f') st.setTool('frame');
      else if (k === 't') st.setTool('text');
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') drag.current.spaceHeld = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---- pointer handlers ----------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    const el = canvasRef.current!;
    el.setPointerCapture(e.pointerId);
    const s = useStudio.getState();
    const world = toWorld(e.clientX, e.clientY);
    const d = drag.current;
    d.startClient = { x: e.clientX, y: e.clientY };
    d.startWorld = world;
    d.moved = false;
    d.baseGeoms = {};

    // shape tools: drop a shape and return to select
    if (s.tool !== 'select') {
      s.addShape(s.tool, world);
      d.kind = 'idle';
      return;
    }

    const pageId = s.doc.activePageId;
    const layout = layoutPage(s.doc, pageId);

    // middle button or space => pan
    if (e.button === 1 || d.spaceHeld) {
      d.kind = 'pan';
      return;
    }

    // resize handles on single selection
    if (s.selection.length === 1) {
      const id = s.selection[0]!;
      const r = layout[id];
      if (r) {
        const tol = 8 / s.viewport.zoom;
        for (const [hx, hy, corner] of handlePoints(r)) {
          if (Math.abs(world.x - hx) <= tol && Math.abs(world.y - hy) <= tol) {
            d.kind = 'resize';
            d.resizeId = id;
            d.corner = corner;
            d.baseGeoms[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
            s.setLiveGeom({ [id]: d.baseGeoms[id]! });
            return;
          }
        }
      }
    }

    const hit = hitTest(s.doc, layout, pageId, world);
    if (hit) {
      const inSel = s.selection.includes(hit);
      if (e.shiftKey) s.toggleInSelection(hit);
      else if (!inSel) s.select([hit]);
      // begin a possible move of whatever is now selected
      const sel = useStudio.getState().selection;
      for (const id of sel) {
        const r = layout[id];
        if (r && !s.doc.nodes[id]?.locked) d.baseGeoms[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
      }
      d.kind = 'maybeMove';
      return;
    }

    // empty space: marquee
    d.kind = 'marquee';
    d.additive = e.shiftKey;
    s.setInteraction({ type: 'marquee', start: world, current: world });
    if (!e.shiftKey) s.clearSelection();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = useStudio.getState();
    const d = drag.current;
    const world = toWorld(e.clientX, e.clientY);
    const dx = e.clientX - d.startClient.x;
    const dy = e.clientY - d.startClient.y;
    if (!d.moved && Math.hypot(dx, dy) > MOVE_THRESHOLD) d.moved = true;

    if (d.kind === 'idle') {
      const pageId = s.doc.activePageId;
      const layout = layoutPage(s.doc, pageId);
      const hit = hitTest(s.doc, layout, pageId, world);
      if (hit !== s.hoverId) s.setHover(hit);
      return;
    }

    if (d.kind === 'pan') {
      s.setViewport({ ...s.viewport, x: s.viewport.x + (e.movementX ?? 0), y: s.viewport.y + (e.movementY ?? 0) });
      return;
    }

    if (d.kind === 'maybeMove') {
      if (!d.moved) return;
      d.kind = 'move';
    }

    const wx = world.x - d.startWorld.x;
    const wy = world.y - d.startWorld.y;

    if (d.kind === 'move') {
      const next: Record<string, LiveGeom> = {};
      for (const [id, b] of Object.entries(d.baseGeoms)) next[id] = applyMove(b, wx, wy);
      s.setLiveGeom(next);
      return;
    }

    if (d.kind === 'resize' && d.resizeId && d.corner) {
      const b = d.baseGeoms[d.resizeId]!;
      const g = applyResize(b, d.corner, wx, wy);
      s.setLiveGeom({ [d.resizeId]: g });
      return;
    }

    if (d.kind === 'marquee') {
      s.setInteraction({ type: 'marquee', start: d.startWorld, current: world });
      const m: Marquee = { x0: d.startWorld.x, y0: d.startWorld.y, x1: world.x, y1: world.y };
      const pageId = s.doc.activePageId;
      const layout = layoutPage(s.doc, pageId);
      const ids = Object.entries(layout)
        .filter(([, r]) => rectIntersects(r, m))
        .map(([id]) => id)
        .filter((id) => id !== pageId && s.doc.nodes[id]?.type !== 'document');
      s.select(ids, d.additive);
      return;
    }
  };

  const finishDrag = (e: React.PointerEvent) => {
    const s = useStudio.getState();
    const d = drag.current;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const world = toWorld(e.clientX, e.clientY);

    if (d.kind === 'move') {
      const wx = Math.round(world.x - d.startWorld.x);
      const wy = Math.round(world.y - d.startWorld.y);
      s.clearLiveGeom();
      if (wx || wy) s.moveSelectionBy(wx, wy);
    } else if (d.kind === 'resize' && d.resizeId) {
      const g = s.liveGeom[d.resizeId];
      s.clearLiveGeom();
      if (g) s.resizeTo(d.resizeId, g);
    } else if (d.kind === 'marquee') {
      s.setInteraction({ type: 'idle' });
    }
    d.kind = 'idle';
    d.resizeId = undefined;
    d.corner = undefined;
    d.baseGeoms = {};
    d.moved = false;
  };

  const onWheel = (e: React.WheelEvent) => {
    const s = useStudio.getState();
    if (e.ctrlKey || !e.shiftKey) {
      // zoom toward cursor
      const rect = canvasRef.current!.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      s.zoomAt(factor, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      s.setViewport({ ...s.viewport, x: s.viewport.x - e.deltaX, y: s.viewport.y - e.deltaY });
    }
  };

  // zoom controls overlay
  const zoom = useStudio((s) => s.viewport.zoom);
  const zoomAtCenter = (factor: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    useStudio.getState().zoomAt(factor, { x: wrap.clientWidth / 2, y: wrap.clientHeight / 2 });
  };
  const fitToContent = () => {
    const s = useStudio.getState();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const pageId = s.doc.activePageId;
    const layout = layoutPage(s.doc, pageId);
    const bb = boundsOfSubtree(layout, [pageId]) ?? layout[pageId];
    if (!bb) return;
    const pad = 80;
    const z = Math.min(8, Math.max(0.05, Math.min((wrap.clientWidth - pad) / bb.width, (wrap.clientHeight - pad) / bb.height)));
    s.setViewport({ zoom: z, x: (wrap.clientWidth - bb.width * z) / 2 - bb.x * z, y: (wrap.clientHeight - bb.height * z) / 2 - bb.y * z });
  };

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'crosshair' }}>
      <canvas
        id="nexus-canvas"
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onWheel={onWheel}
      />
      <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="btn" onClick={() => zoomAtCenter(1 / 1.2)}>−</button>
        <button className="btn" style={{ minWidth: 64 }} onClick={fitToContent} title="Zoom to fit">{Math.round(zoom * 100)}%</button>
        <button className="btn" onClick={() => zoomAtCenter(1.2)}>+</button>
      </div>
    </div>
  );
}
