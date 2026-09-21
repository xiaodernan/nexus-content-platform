'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  boundsOfSubtree,
  childIdList,
  hitTest,
  layoutPage,
  subtreeIds,
  type AbsRect,
  type Point,
  type TextNode,
} from '@nexus/design-model';
import { drawScene, type Marquee } from '@/lib/render';
import { resolveTextStyle } from '@/lib/paint';
import { handleHitTest, rectCenter, rotationFromDrag, rotateHandlePoint, snapAngleDeg, ROTATE_HANDLE_GAP } from '@/lib/rotate';
import { computeSnap } from '@/lib/snap';
import { instanceView, useStudio, type LiveGeom } from '@/lib/store';

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

type HitMeta = Record<string, { instanceId: string; masterId: string }>;
type StudioState = ReturnType<typeof useStudio.getState>;

/** Focused instance id, guarded against staleness after undo/page switches. */
function liveFocus(s: StudioState): string | null {
  return s.focusedInstanceId && s.doc.nodes[s.focusedInstanceId]?.type === 'instance' ? s.focusedInstanceId : null;
}

/** Collapse a clone hit to its owning instance — except when that instance is focused (sub-select). */
function resolveHit(rawHit: string | null, meta: HitMeta, focus: string | null): string | null {
  if (!rawHit) return null;
  const owner = meta[rawHit]?.instanceId ?? null;
  if (owner === null) return rawHit;
  if (focus && owner === focus) return rawHit;
  return owner;
}

/** True for projected clone ids (they exist only in the view-time projection). */
function isCloneId(meta: HitMeta, id: string): boolean {
  const m = meta[id];
  return !!m && m.instanceId !== id;
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

  // Reactive slice the DOM overlay needs (the canvas itself draws from getState in rAF).
  const doc = useStudio((s) => s.doc);
  const viewport = useStudio((s) => s.viewport);
  const activePageId = useStudio((s) => s.activePageId);
  const editingId = useStudio((s) => s.editingId);
  const focusedInstanceId = useStudio((s) => s.focusedInstanceId);
  const [draft, setDraft] = useState('');

  const drag = useRef<{
    kind: 'idle' | 'pan' | 'move' | 'resize' | 'rotate' | 'marquee' | 'maybeMove';
    startClient: Point;
    startWorld: Point;
    baseGeoms: Record<string, LiveGeom>;
    resizeId?: string;
    corner?: string;
    rotateId?: string;
    rotateCenter?: Point;
    rotateStart?: Point;
    rotateStartDeg?: number;
    additive?: boolean;
    moved: boolean;
    spaceHeld: boolean;
  }>({ kind: 'idle', startClient: { x: 0, y: 0 }, startWorld: { x: 0, y: 0 }, baseGeoms: {}, moved: false, spaceHeld: false });

  useEffect(() => {
    if (!editingId) return;
    // editing may target a projected text clone, so read characters from the instance view
    const n = instanceView(useStudio.getState().doc).doc.nodes[editingId];
    setDraft(n && n.type === 'text' ? n.characters : '');
  }, [editingId]);

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
    const pageId = s.activePageId;
    const viewDoc = instanceView(s.doc).doc; // materialize component instances for paint only
    const base = layoutPage(viewDoc, pageId);
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
      {
        doc: viewDoc,
        pageId,
        layout,
        viewport: s.viewport,
        selection: s.selection,
        hoverId: s.hoverId,
        marquee,
        guides: s.guides,
        hideId: s.editingId,
        rotations: s.rotations,
        showChrome: true,
      },
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
      if (e.key === 'Escape' && st.focusedInstanceId) {
        e.preventDefault();
        const id = st.focusedInstanceId;
        st.setEditing(null);
        st.setFocused(null);
        st.select([id]);
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
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        st.selectAllOnPage();
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

    if (s.tool !== 'select') {
      s.addShape(s.tool, world);
      d.kind = 'idle';
      return;
    }

    const pageId = s.activePageId;
    const { doc: viewDoc, meta } = instanceView(s.doc);
    const layout = layoutPage(viewDoc, pageId);

    if (e.button === 1 || d.spaceHeld) {
      d.kind = 'pan';
      return;
    }

    if (s.selection.length === 1) {
      const id = s.selection[0]!;
      const r = layout[id];
      if (r) {
        const tol = 8 / s.viewport.zoom;
        const authored = s.doc.nodes[id];
        // clones have no authored entry; their projected node carries the (possibly overridden) rotation
        const node = authored ?? viewDoc.nodes[id];
        const rot = node?.rotation ?? 0;
        if (node && !node.locked) {
          const grip = rotateHandlePoint(r, rot, ROTATE_HANDLE_GAP / s.viewport.zoom);
          if (Math.hypot(world.x - grip.x, world.y - grip.y) <= tol) {
            d.kind = 'rotate';
            d.rotateId = id;
            d.rotateCenter = rectCenter(r);
            d.rotateStart = world;
            d.rotateStartDeg = rot;
            s.setRotations({ [id]: rot });
            return;
          }
        }
        const grabbed = handleHitTest(r, rot, world, tol);
        if (grabbed) {
          d.kind = 'resize';
          d.resizeId = id;
          d.corner = grabbed[2];
          d.baseGeoms[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
          s.setLiveGeom({ [id]: d.baseGeoms[id]! });
          return;
        }
      }
    }

    const rawHit = hitTest(viewDoc, layout, pageId, world);
    const hit = resolveHit(rawHit, meta, liveFocus(s));
    if (hit) {
      const inSel = s.selection.includes(hit);
      if (e.shiftKey) s.toggleInSelection(hit);
      else if (!inSel) s.select([hit]);
      const sel = useStudio.getState().selection;
      // grab a frame/parent → move its whole subtree as a unit; a selected clone moves by itself
      // (its projected descendants follow through layout placement automatically)
      const dragSet = new Set<string>();
      for (const id of sel) {
        if (isCloneId(meta, id)) {
          dragSet.add(id);
          continue;
        }
        for (const sub of subtreeIds(s.doc, id)) dragSet.add(sub);
      }
      for (const id of dragSet) {
        const r = layout[id];
        const nd = s.doc.nodes[id] ?? viewDoc.nodes[id];
        if (r && !nd?.locked) d.baseGeoms[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
      }
      d.kind = 'maybeMove';
      return;
    }

    d.kind = 'marquee';
    d.additive = e.shiftKey;
    s.setInteraction({ type: 'marquee', start: world, current: world });
    if (!e.shiftKey) s.clearSelection();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const s = useStudio.getState();
    if (s.tool !== 'select') return;
    const world = toWorld(e.clientX, e.clientY);
    const { doc: viewDoc, meta } = instanceView(s.doc);
    const layout = layoutPage(viewDoc, s.activePageId);
    const rawHit = hitTest(viewDoc, layout, s.activePageId, world);
    const focus = liveFocus(s);
    if (!rawHit) {
      if (focus) {
        s.setFocused(null);
        s.clearSelection();
      }
      return;
    }
    const n = viewDoc.nodes[rawHit];
    const owner = meta[rawHit]?.instanceId ?? null;
    // progressive drill: 1st dbl-click on an instance enters it (selecting the clicked clone),
    // dbl-clicking text inside the focused instance (or plain text) starts on-canvas editing
    if (n && n.type === 'text' && !n.locked && (!owner || owner === focus)) {
      s.select([rawHit]);
      s.setEditing(rawHit);
      return;
    }
    if (owner) {
      if (focus === owner && rawHit === owner) {
        s.setFocused(null);
        s.select([owner]);
        return;
      }
      s.setFocused(owner);
      s.select([rawHit === owner ? owner : rawHit]);
      return;
    }
    s.select([rawHit]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = useStudio.getState();
    const d = drag.current;
    const world = toWorld(e.clientX, e.clientY);
    const dxScreen = e.clientX - d.startClient.x;
    const dyScreen = e.clientY - d.startClient.y;
    if (!d.moved && Math.hypot(dxScreen, dyScreen) > MOVE_THRESHOLD) d.moved = true;

    const pageId = s.activePageId;

    if (d.kind === 'idle') {
      const { doc: viewDoc, meta } = instanceView(s.doc);
      const layout = layoutPage(viewDoc, pageId);
      const rawHit = hitTest(viewDoc, layout, pageId, world);
      const hit = resolveHit(rawHit, meta, liveFocus(s));
      if (hit !== s.hoverId) s.setHover(hit);
      return;
    }

    if (d.kind === 'pan') {
      s.setViewport({ ...s.viewport, x: s.viewport.x + (e.movementX ?? 0), y: s.viewport.y + (e.movementY ?? 0) });
      return;
    }

    if (d.kind === 'rotate' && d.rotateId && d.rotateCenter && d.rotateStart) {
      let deg = rotationFromDrag(d.rotateCenter, d.rotateStart, world, d.rotateStartDeg ?? 0);
      if (e.shiftKey) deg = snapAngleDeg(deg);
      s.setRotations({ [d.rotateId]: deg });
      return;
    }

    if (d.kind === 'maybeMove') {
      if (!d.moved) return;
      d.kind = 'move';
    }

    const wx = world.x - d.startWorld.x;
    const wy = world.y - d.startWorld.y;

    if (d.kind === 'move') {
      const layout = layoutPage(s.doc, pageId);
      const page = layout[pageId];
      const dragIds = Object.keys(d.baseGeoms);
      const selSet = new Set(s.selection);
      let sx = 0;
      let sy = 0;
      let guides: { xs: number[]; ys: number[] } = { xs: [], ys: [] };
      if (page && dragIds.length) {
        const moving = dragIds.map((id) => applyMove(d.baseGeoms[id]!, wx, wy));
        const others = childIdList(s.doc.nodes[pageId]!)
          .filter((id) => !selSet.has(id) && layout[id])
          .map((id) => layout[id]!);
        const snap = computeSnap(moving, others, page, 6 / s.viewport.zoom);
        sx = snap.dx;
        sy = snap.dy;
        guides = { xs: snap.xs, ys: snap.ys };
      }
      s.setGuides(guides);
      const next: Record<string, LiveGeom> = {};
      for (const [id, b] of Object.entries(d.baseGeoms)) next[id] = applyMove(b, wx + sx, wy + sy);
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
      const { doc: viewDoc, meta } = instanceView(s.doc);
      const layout = layoutPage(viewDoc, pageId);
      const hits = Object.entries(layout)
        .filter(([, r]) => rectIntersects(r, m))
        .map(([id]) => id);
      const ids = Array.from(
        new Set(
          hits
            .map((id) => resolveHit(id, meta, liveFocus(s)))
            .filter((id): id is string => id !== null && id !== pageId && viewDoc.nodes[id]?.type !== 'document' && viewDoc.nodes[id]?.type !== 'page'),
        ),
      );
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

    if (d.kind === 'move') {
      // Commit the *snapped* delta baked into liveGeom, not the raw pointer delta.
      const id = Object.keys(d.baseGeoms)[0];
      const live = id ? s.liveGeom[id] : undefined;
      const base = id ? d.baseGeoms[id] : undefined;
      const dx = live && base ? Math.round(live.x - base.x) : 0;
      const dy = live && base ? Math.round(live.y - base.y) : 0;
      s.clearLiveGeom();
      if (dx || dy) s.moveSelectionBy(dx, dy);
    } else if (d.kind === 'rotate' && d.rotateId) {
      const deg = s.rotations[d.rotateId];
      const startDeg = Math.round(d.rotateStartDeg ?? 0);
      s.clearLiveGeom(); // also clears the transient rotations map
      if (deg !== undefined) {
        const committed = Math.round(deg);
        if (committed !== startDeg) {
          const { meta } = instanceView(s.doc);
          const m = meta[d.rotateId];
          if (m && m.instanceId !== d.rotateId) s.setInstanceOverride(m.instanceId, m.masterId, { rotation: committed });
          else s.updateNode(d.rotateId, { rotation: committed });
        }
      }
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
    d.rotateId = undefined;
    d.rotateCenter = undefined;
    d.rotateStart = undefined;
    d.rotateStartDeg = undefined;
    d.baseGeoms = {};
    d.moved = false;
  };

  const onWheel = (e: React.WheelEvent) => {
    const s = useStudio.getState();
    if (e.ctrlKey || !e.shiftKey) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      s.zoomAt(factor, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      s.setViewport({ ...s.viewport, x: s.viewport.x - e.deltaX, y: s.viewport.y - e.deltaY });
    }
  };

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
    const pageId = s.activePageId;
    const layout = layoutPage(s.doc, pageId);
    const bb = boundsOfSubtree(layout, [pageId]) ?? layout[pageId];
    if (!bb) return;
    const pad = 80;
    const z = Math.min(8, Math.max(0.05, Math.min((wrap.clientWidth - pad) / bb.width, (wrap.clientHeight - pad) / bb.height)));
    s.setViewport({ zoom: z, x: (wrap.clientWidth - bb.width * z) / 2 - bb.x * z, y: (wrap.clientHeight - bb.height * z) / 2 - bb.y * z });
  };

  // ---- on-canvas text editing overlay -------------------------------------
  // The edited node may be a projected clone, so everything here reads from the instance view;
  // commits on clones become `characters` overrides keyed by the master id.
  const { doc: viewDoc, meta: viewMeta } = instanceView(doc);
  const editingNode = editingId ? (viewDoc.nodes[editingId] as TextNode | undefined) : undefined;
  let overlay: React.ReactNode = null;
  if (editingNode && editingNode.type === 'text') {
    const r = layoutPage(viewDoc, activePageId)[editingNode.id];
    if (r) {
      const st = resolveTextStyle(viewDoc, editingNode.style);
      const color = editingNode.fills[0]?.kind === 'solid' ? `rgb(${Math.round(editingNode.fills[0].color.r * 255)},${Math.round(editingNode.fills[0].color.g * 255)},${Math.round(editingNode.fills[0].color.b * 255)})` : '#e6ecf5';
      const commit = (cancel: boolean) => {
        const id = editingNode.id;
        const s = useStudio.getState();
        if (!cancel && draft !== editingNode.characters) {
          const m = viewMeta[id];
          if (m && m.instanceId !== id) s.setInstanceOverride(m.instanceId, m.masterId, { characters: draft });
          else s.updateNode(id, { characters: draft });
        }
        s.setEditing(null);
      };
      overlay = (
        <div
          style={{
            position: 'absolute',
            left: r.x * viewport.zoom + viewport.x,
            top: r.y * viewport.zoom + viewport.y,
            width: r.width * viewport.zoom,
            height: r.height * viewport.zoom,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ transform: `scale(${viewport.zoom})`, transformOrigin: '0 0', width: r.width, height: r.height }}>
            <textarea
              autoFocus
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onBlur={() => commit(false)}
              onKeyDown={(ev) => {
                if (ev.key === 'Escape') {
                  ev.preventDefault();
                  commit(true);
                } else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
                  ev.preventDefault();
                  commit(false);
                }
                ev.stopPropagation();
              }}
              style={{
                width: r.width,
                height: r.height,
                margin: 0,
                padding: 0,
                border: '1px solid #6ea8fe',
                outline: 'none',
                resize: 'none',
                background: 'rgba(11,14,20,0.35)',
                color,
                font: st.font,
                lineHeight: String(st.lineHeight),
                letterSpacing: `${st.letterSpacing}px`,
                textAlign: st.align,
                overflow: 'hidden',
              }}
            />
          </div>
        </div>
      );
    }
  }

  // Sub-select breadcrumb: shown while double-click has drilled into an instance.
  const focusedNode = focusedInstanceId && doc.nodes[focusedInstanceId]?.type === 'instance' ? focusedInstanceId : null;
  const focusLabel = focusedNode ? viewDoc.nodes[focusedNode]?.name : null;

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: editingId ? 'text' : 'crosshair' }}>
      <canvas
        id="nexus-canvas"
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
      />
      {overlay}
      {focusedNode && (
        <div
          id="nexus-focus-chip"
          style={{
            position: 'absolute',
            top: 10,
            left: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            background: 'rgba(11,14,20,0.85)',
            border: '1px solid var(--nexus-border, #2a3345)',
            borderRadius: 6,
            fontSize: 12,
            color: '#e6ecf5',
          }}
        >
          <span style={{ opacity: 0.7 }}>Editing inside</span>
          <strong>{focusLabel ?? focusedNode}</strong>
          <button
            className="btn"
            onClick={() => {
              const s = useStudio.getState();
              s.setEditing(null);
              s.setFocused(null);
              s.select([focusedNode]);
            }}
          >
            Exit (Esc)
          </button>
        </div>
      )}
      <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="btn" onClick={() => zoomAtCenter(1 / 1.2)}>−</button>
        <button className="btn" style={{ minWidth: 64 }} onClick={fitToContent} title="Zoom to fit">{Math.round(zoom * 100)}%</button>
        <button className="btn" onClick={() => zoomAtCenter(1.2)}>+</button>
      </div>
    </div>
  );
}
