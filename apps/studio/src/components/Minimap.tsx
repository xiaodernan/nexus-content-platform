'use client';
import { useCallback, useEffect, useRef } from 'react';
import { childIdList, layoutPage, type DesignNode } from '@nexus/design-model';
import { fitPage, intersectRects, projectRect, unprojectPoint, viewportCenteredAt, viewportWorldRect } from '@/lib/minimap';
import { instanceView, useStudio } from '@/lib/store';

const MM_W = 200;
const MM_H = 150;
const PAD = 6;

function collectVisible(nodes: Record<string, DesignNode>, pageId: string, out: DesignNode[]): void {
  const page = nodes[pageId];
  if (!page) return;
  for (const id of childIdList(page)) {
    const n = nodes[id];
    if (!n || !n.visible) continue;
    out.push(n);
    collectVisible(nodes, id, out);
  }
}

export default function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const doc = useStudio((s) => s.doc);
  const activePageId = useStudio((s) => s.activePageId);
  const viewport = useStudio((s) => s.viewport);

  const canvasSize = useCallback((): { w: number; h: number } => {
    const el = document.getElementById('nexus-canvas');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { w: r.width, h: r.height };
    }
    return { w: window.innerWidth, h: window.innerHeight };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = MM_W * dpr;
    el.height = MM_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, MM_W, MM_H);

    const { doc: viewDoc } = instanceView(doc);
    const layout = layoutPage(viewDoc, activePageId);
    const page = layout[activePageId];
    if (!page) return;
    const t = fitPage(page, { width: MM_W, height: MM_H }, PAD);

    const pr = projectRect(t, page);
    ctx.fillStyle = '#11161f';
    ctx.fillRect(pr.x, pr.y, pr.width, pr.height);
    ctx.strokeStyle = 'rgba(110,168,254,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pr.x, pr.y, pr.width, pr.height);

    const nodes: DesignNode[] = [];
    collectVisible(viewDoc.nodes, activePageId, nodes);
    // Depth-1 frames read as faint outlines; leaf shapes get a solid tile.
    for (const n of nodes) {
      const r = layout[n.id];
      if (!r) continue;
      const m = projectRect(t, r);
      const isFrame = n.type === 'frame' || n.type === 'group' || n.type === 'component' || n.type === 'instance';
      if (isFrame) {
        ctx.strokeStyle = 'rgba(148,170,210,0.35)';
        ctx.strokeRect(m.x, m.y, m.width, m.height);
      } else {
        ctx.fillStyle = n.type === 'text' ? '#8aa3c8' : '#41527a';
        ctx.fillRect(m.x, m.y, Math.max(1, m.width), Math.max(1, m.height));
      }
    }

    const { w: cssW, h: cssH } = canvasSize();
    const vr = intersectRects(page, viewportWorldRect(viewport, cssW, cssH));
    if (vr) {
      const m = projectRect(t, vr);
      ctx.strokeStyle = '#6ea8fe';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(m.x, m.y, m.width, m.height);
      ctx.fillStyle = 'rgba(110,168,254,0.08)';
      ctx.fillRect(m.x, m.y, m.width, m.height);
    }
  }, [doc, activePageId, viewport, canvasSize]);

  const jumpTo = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = useStudio.getState();
    const layout = layoutPage(s.doc, s.activePageId);
    const page = layout[s.activePageId];
    if (!page) return;
    const t = fitPage(page, { width: MM_W, height: MM_H }, PAD);
    const world = unprojectPoint(t, { x: clientX - r.left, y: clientY - r.top });
    const { w, h } = canvasSize();
    s.setViewport(viewportCenteredAt(s.viewport, world, w, h));
  }, [canvasSize]);

  return (
    <canvas
      ref={ref}
      aria-label="Minimap"
      style={{ width: MM_W, height: MM_H, display: 'block', borderRadius: 8, border: '1px solid var(--nexus-border)', cursor: 'pointer', touchAction: 'none', opacity: 0.92 }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        jumpTo(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (dragging.current) jumpTo(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }}
    />
  );
}
