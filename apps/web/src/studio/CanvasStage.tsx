'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, memo } from 'react';
import { boundsOf, visiblePaintOrder, type ResolvedNode } from '@nexus/design-model';
import { studio, useStudio } from './store';
import { nodeStyle } from './render';
import { AnnotationsPanel } from './AnnotationsPanel';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: { id: Handle; cursor: string; dx: number; dy: number }[] = [
  { id: 'nw', cursor: 'nwse-resize', dx: 0, dy: 0 },
  { id: 'n', cursor: 'ns-resize', dx: 0.5, dy: 0 },
  { id: 'ne', cursor: 'nesw-resize', dx: 1, dy: 0 },
  { id: 'e', cursor: 'ew-resize', dx: 1, dy: 0.5 },
  { id: 'se', cursor: 'nwse-resize', dx: 1, dy: 1 },
  { id: 's', cursor: 'ns-resize', dx: 0.5, dy: 1 },
  { id: 'sw', cursor: 'nesw-resize', dx: 0, dy: 1 },
  { id: 'w', cursor: 'ew-resize', dx: 0, dy: 0.5 },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  kind: 'pan' | 'move' | 'resize' | 'marquee';
  originClient: { x: number; y: number };
  originPan: { x: number; y: number };
  originCanvas: Box;
  nodeId?: string;
  handle?: Handle;
}

interface Preview {
  move?: { nodeId: string; dx: number; dy: number };
  resize?: { nodeId: string; box: Box };
  marquee?: Box;
  insertion?: { parentId: string; index: number };
  guides?: { axis: 'x' | 'y'; at: number }[];
}

const SNAP_PX = 6;
const GRID_STEP = 8;

interface NodeRenderProps {
  resolved: ResolvedNode;
  tokens: ReturnType<typeof useStudio>['tokens'];
  mode: string | null;
  assets: ReturnType<typeof useStudio>['assetContext'];
  moved: { dx: number; dy: number } | null;
  resized: { x: number; y: number; width: number; height: number } | null;
  isRoot: boolean;
  isLocked: boolean;
  editing: { nodeId: string; value: string } | null;
}

/** Memoized node renderer: 只有位置/尺寸/样式上下文/拖拽预览/编辑态变化才重渲染 */
const Node = memo(function NodeComponent({
  resolved,
  tokens,
  mode,
  assets,
  moved,
  resized,
  isRoot,
  isLocked,
  editing,
}: NodeRenderProps) {
  const ctx = useMemo(() => ({ tokens, mode, assets }), [tokens, mode, assets]);
  const style = useMemo(() => {
    const baseStyle = nodeStyle(resolved, ctx);
    const s: CSSProperties = {
      ...baseStyle,
      userSelect: 'none',
      ...(isRoot ? { boxShadow: 'none' } : {}),
      ...(moved ? { transform: `translate(${moved.dx}px, ${moved.dy}px)` } : {}),
      ...(resized ? { left: resized.x, top: resized.y, width: resized.width, height: resized.height } : {}),
      ...(isLocked ? { outline: '1px dashed var(--nexus-color-warn)', outlineOffset: '-1px' } : {}),
    };
    if (editing?.nodeId === resolved.id) return { ...s, visibility: 'hidden' as React.CSSProperties['visibility'] };
    return s;
  }, [resolved, ctx, moved, resized, isRoot, isLocked, editing?.nodeId]);

  return (
    <div
      data-node-id={resolved.id}
      data-node-type={resolved.node.type}
      style={style}
    >
      {resolved.node.text ?? null}
    </div>
  );
}, (prev, next) => {
  if (prev.resolved.id !== next.resolved.id) return false;
  if (prev.resolved.x !== next.resolved.x) return false;
  if (prev.resolved.y !== next.resolved.y) return false;
  if (prev.resolved.width !== next.resolved.width) return false;
  if (prev.resolved.height !== next.resolved.height) return false;
  if (prev.resolved.node.locked !== next.resolved.node.locked) return false;
  if (prev.resolved.node.visible !== next.resolved.node.visible) return false;
  if (prev.resolved.node.style.opacity !== next.resolved.node.style.opacity) return false;
  if (prev.resolved.node.style.cornerRadius !== next.resolved.node.style.cornerRadius) return false;
  if (prev.resolved.node.style.fills !== next.resolved.node.style.fills) return false;
  if (prev.resolved.node.style.strokes !== next.resolved.node.style.strokes) return false;
  if (prev.resolved.node.style.effects !== next.resolved.node.style.effects) return false;
  if (prev.resolved.node.style.blendMode !== next.resolved.node.style.blendMode) return false;
  if (prev.resolved.node.style.rotation !== next.resolved.node.style.rotation) return false;
  if (prev.resolved.node.style.cursor !== next.resolved.node.style.cursor) return false;
  if (prev.resolved.node.style.overflowX !== next.resolved.node.style.overflowX) return false;
  if (prev.resolved.node.style.overflowY !== next.resolved.node.style.overflowY) return false;
  if (prev.resolved.node.layout.scroll !== next.resolved.node.layout.scroll) return false;
  if (prev.resolved.node.typography !== next.resolved.node.typography) return false;
  if (prev.resolved.node.style.textWrap !== next.resolved.node.style.textWrap) return false;
  if (prev.resolved.node.style.cornerRadius !== next.resolved.node.style.cornerRadius) return false;
  if (prev.tokens !== next.tokens) return false;
  if (prev.mode !== next.mode) return false;
  if (prev.assets !== next.assets) return false;
  if (prev.moved !== next.moved) return false;
  if (prev.resized !== next.resized) return false;
  if (prev.isRoot !== next.isRoot) return false;
  if (prev.isLocked !== next.isLocked) return false;
  if (prev.editing?.nodeId !== next.editing?.nodeId) return false;
  return true;
});

Node.displayName = 'Node';

/** §8 Canvas：无限画布 + zoom/pan + 选择/框选 + 拖拽 + 8 手柄缩放 + 吸附/网格 + viewport 预览 */
export function CanvasStage() {
  const state = useStudio();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const spaceRef = useRef(false);
  const previewRef = useRef<Preview>({});
  const [preview, setPreviewState] = useState<Preview>({});
  const [editing, setEditing] = useState<{ nodeId: string; value: string } | null>(null);
  // §147：视口大小要参与渲染决策，所以它得是 state（ResizeObserver 报一次，缩放/平移时也用它算）
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });

  const setPreview = (next: Preview) => {
    previewRef.current = next;
    setPreviewState(next);
  };

  const layout = state.layout;
  const page = state.page;

  const canvasPoint = useCallback((clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const snap = studio.getSnapshot();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - snap.pan.x) / snap.zoom, y: (clientY - rect.top - snap.pan.y) / snap.zoom };
  }, []);

  const toScreen = useCallback((box: Box): Box => {
    const snap = studio.getSnapshot();
    return {
      x: box.x * snap.zoom + snap.pan.x,
      y: box.y * snap.zoom + snap.pan.y,
      width: box.width * snap.zoom,
      height: box.height * snap.zoom,
    };
  }, []);

  // 首帧就要知道视口多大：只靠 ResizeObserver 的回调会先按"视口未知"把整页画一遍、
  // 再重画成裁剪后的那一遍，实测让 1000 节点档的首帧从 ~900ms 抖到 ~1150ms。
  // 所以先用一次同步测量定初值，observer 只负责后续变化。
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    setSurfaceSize({ width: surface.clientWidth, height: surface.clientHeight });
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSurfaceSize({ width: box.width, height: box.height });
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  // 滚轮：默认平移；Ctrl/⌘ + 滚轮以指针为锚点缩放（§8）
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = surface.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.ctrlKey || event.metaKey) studio.zoomBy(Math.exp(-event.deltaY * 0.0015), anchor);
      else if (event.shiftKey) studio.panBy(-event.deltaY, 0);
      else studio.panBy(-event.deltaX, -event.deltaY);
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.isContentEditable) || Boolean(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.code === 'Space' && !typing) {
        spaceRef.current = true;
        event.preventDefault();
        return;
      }
      if (typing) return;
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (meta && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) studio.redo();
        else studio.undo();
      } else if (meta && key === 'y') {
        event.preventDefault();
        studio.redo();
      } else if (meta && key === 's') {
        event.preventDefault();
        void studio.save();
      } else if (meta && key === 'a') {
        event.preventDefault();
        const snap = studio.getSnapshot();
        if (snap.layout) studio.select(snap.layout.paintOrder.filter((id) => id !== snap.layout!.rootId));
      } else if (meta && key === 'g') {
        event.preventDefault();
        studio.toggleGrid();
      } else if (event.key === 'Escape') {
        studio.clearSelection();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (studio.getSnapshot().selection.length) {
          event.preventDefault();
          studio.deleteSelection();
        }
      } else if (event.key.startsWith('Arrow')) {
        if (!studio.getSnapshot().selection.length) return;
        event.preventDefault();
        const step = event.shiftKey ? GRID_STEP : 1;
        studio.moveSelectionBy(
          event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
        );
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /** 吸附到邻居边缘/中心（±6px）与 8pt 基线（§8 snapping） */
  const snapDelta = useCallback((nodeId: string, dx: number, dy: number): Preview => {
    const snap = studio.getSnapshot();
    const l = snap.layout;
    const start = l?.nodes[nodeId];
    if (!l || !start) return { move: { nodeId, dx, dy } };
    const threshold = SNAP_PX / snap.zoom;
    const edges: Record<'x' | 'y', number[]> = {
      x: [start.x + dx, start.x + dx + start.width, start.x + dx + start.width / 2],
      y: [start.y + dy, start.y + dy + start.height, start.y + dy + start.height / 2],
    };
    const guides: { axis: 'x' | 'y'; at: number }[] = [];
    (['x', 'y'] as const).forEach((axis) => {
      let best: { delta: number; at: number } | null = null;
      for (const [id, node] of Object.entries(l.nodes)) {
        if (id === nodeId) continue;
        const candidates = axis === 'x' ? [node.x, node.x + node.width, node.x + node.width / 2] : [node.y, node.y + node.height, node.y + node.height / 2];
        for (const target of candidates) {
          for (const edge of edges[axis]) {
            const delta = target - edge;
            if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: target };
          }
        }
      }
      const found = best as { delta: number; at: number } | null;
      if (found) {
        if (axis === 'x') dx += found.delta;
        else dy += found.delta;
        guides.push({ axis, at: found.at });
      }
    });
    if (snap.grid) {
      const snappedX = Math.round((start.x + dx) / GRID_STEP) * GRID_STEP - (start.x + dx);
      const snappedY = Math.round((start.y + dy) / GRID_STEP) * GRID_STEP - (start.y + dy);
      if (Math.abs(snappedX) <= threshold / 2) dx += snappedX;
      if (Math.abs(snappedY) <= threshold / 2) dy += snappedY;
    }
    return { move: { nodeId, dx, dy }, guides };
  }, []);

  const beginDrag = (drag: DragState) => {
    dragRef.current = drag;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!layout) return;
    const point = canvasPoint(event.clientX, event.clientY);
    const snap = studio.getSnapshot();
    const origin = { originClient: { x: event.clientX, y: event.clientY }, originPan: snap.pan, originCanvas: { x: point.x, y: point.y, width: 0, height: 0 } };

    if (spaceRef.current || event.button === 1 || event.button === 2) {
      beginDrag({ kind: 'pan', ...origin });
      return;
    }
    event.preventDefault();

    const hitId = studio.hitAt(point.x, point.y);
    const hitNode = hitId ? (page?.nodes[hitId] ?? null) : null;
    if (!hitNode || hitNode.id === layout.rootId) {
      studio.clearSelection();
      beginDrag({ kind: 'marquee', ...origin });
      return;
    }
    if (event.shiftKey) studio.toggleSelection(hitNode.id);
    else if (!snap.selection.includes(hitNode.id)) studio.select([hitNode.id]);
    if (hitNode.locked) {
      beginDrag({ kind: 'pan', ...origin });
      return;
    }
    const box = layout.nodes[hitNode.id]!;
    beginDrag({ kind: 'move', nodeId: hitNode.id, ...origin, originCanvas: { x: box.x, y: box.y, width: box.width, height: box.height } });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !layout) return;
    const snap = studio.getSnapshot();
    const screenDx = event.clientX - drag.originClient.x;
    const screenDy = event.clientY - drag.originClient.y;
    if (drag.kind === 'pan') {
      studio.setPan({ x: drag.originPan.x + screenDx, y: drag.originPan.y + screenDy });
      return;
    }
    const dx = screenDx / snap.zoom;
    const dy = screenDy / snap.zoom;

    if (drag.kind === 'marquee') {
      setPreview({
        marquee: {
          x: Math.min(drag.originCanvas.x, drag.originCanvas.x + dx),
          y: Math.min(drag.originCanvas.y, drag.originCanvas.y + dy),
          width: Math.abs(dx),
          height: Math.abs(dy),
        },
      });
      return;
    }

    if (drag.kind === 'move' && drag.nodeId) {
      const node = snap.page?.nodes[drag.nodeId];
      if (!node) return;
      if (studio.canFreeMove(node.id)) {
        setPreview(snapDelta(node.id, dx, dy));
        return;
      }
      // 自动布局父级里的拖拽 = 重排：给出插入位而不是像素位移
      const parentId = node.parentId;
      const parent = parentId ? snap.page?.nodes[parentId] : null;
      if (!parent) return;
      const point = canvasPoint(event.clientX, event.clientY);
      let index = 0;
      for (const id of parent.children) {
        if (id === node.id) continue;
        const box = layout.nodes[id];
        if (!box) continue;
        const after = parent.layout.mode === 'horizontal' ? point.x > box.x + box.width / 2 : point.y > box.y + box.height / 2;
        if (after) index += 1;
      }
      setPreview({ insertion: { parentId: parent.id, index } });
    }

    if (drag.kind === 'resize' && drag.nodeId && drag.handle) {
      setPreview({ resize: { nodeId: drag.nodeId, box: resizeBox(drag.originCanvas, drag.handle, dx, dy, event.shiftKey) } });
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    const current = previewRef.current;
    const snap = studio.getSnapshot();
    if (drag?.kind === 'marquee' && current.marquee && snap.layout) {
      const box = current.marquee;
      const ids = Object.values(snap.layout.nodes)
        .filter((n) => n.depth > 0 && !n.node.locked && n.node.visible)
        .filter((n) => n.x < box.x + box.width && n.x + n.width > box.x && n.y < box.y + box.height && n.y + n.height > box.y)
        .map((n) => n.id);
      if (ids.length) studio.select(ids);
    }
    if (drag?.kind === 'move' && drag.nodeId && snap.page) {
      const node = snap.page.nodes[drag.nodeId];
      if (node && current.move && (current.move.dx || current.move.dy)) {
        const source = snap.layout?.nodes[node.id];
        if (source) studio.setPosition(node.id, source.x + current.move.dx, source.y + current.move.dy);
      } else if (node && current.insertion) {
        studio.reorderWithinParent(node.id, current.insertion.index);
      }
    }
    if (drag?.kind === 'resize' && drag.nodeId && current.resize) {
      studio.setSize(drag.nodeId, current.resize.box.width, current.resize.box.height);
    }
    setPreview({});
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!layout) return;
    const point = canvasPoint(event.clientX, event.clientY);
    const id = studio.hitAt(point.x, point.y);
    const node = id ? (page?.nodes[id] ?? null) : null;
    if (node && (node.type === 'text' || node.type === 'button' || node.type === 'input') && !node.locked) {
      studio.select([node.id]);
      setEditing({ nodeId: node.id, value: node.text ?? '' });
    }
  };

  const startResize = (handle: Handle, box: Box) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const id = studio.getSnapshot().selection[0];
    if (!id) return;
    beginDrag({ kind: 'resize', handle, nodeId: id, originClient: { x: event.clientX, y: event.clientY }, originPan: studio.getSnapshot().pan, originCanvas: box });
  };

  if (!layout || !page) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-0">
        <p className="font-mono text-13 text-fg-3">{state.loadError ?? '载入画布…'}</p>
      </div>
    );
  }

  const singleId = state.selection.length === 1 ? state.selection[0]! : null;
  const selectedBox = state.selection.length ? boundsOf(layout, state.selection) : null;
  const liveBox = singleId && preview.resize?.nodeId === singleId ? preview.resize.box : layout.nodes[singleId ?? ''] ?? null;
  const screenSelection = selectedBox ? toScreen(selectedBox) : null;
  const screenLive = liveBox ? toScreen({ x: liveBox.x, y: liveBox.y, width: liveBox.width, height: liveBox.height }) : null;
  const insertionLine = preview.insertion ? insertionRect(layout, preview.insertion, toScreen) : null;
  const ctx = { tokens: state.tokens, mode: state.activeMode, assets: state.assetContext };

  // §146/§147 视口裁剪：文档大了以后只把视口（外扩一圈）内的节点放进 DOM。
  // 小文档不裁——DOM 里有没有一个节点是可观察行为，不值得为几个节点改变它；
  // 裁了就要在画布上说一声，不能让人以为页面就只有这些元素。
  const visible = useMemo(() => {
    const view = {
      x: -state.pan.x / state.zoom,
      y: -state.pan.y / state.zoom,
      width: surfaceSize.width / state.zoom,
      height: surfaceSize.height / state.zoom,
    };
    return visiblePaintOrder(layout, view);
  }, [layout, state.pan.x, state.pan.y, state.zoom, surfaceSize.width, surfaceSize.height]);

  return (
    <div
      ref={surfaceRef}
      data-canvas-surface
      // overflow-clip 而不是 hidden：hidden 仍是滚动容器，聚焦/scrollIntoView 会把它滚出偏移，
      // 而画布的 屏幕→模型 映射只认 pan/zoom，滚过之后每次点选都落在别的节点上
      className="relative h-full w-full touch-none overflow-clip bg-bg-0"
      style={{ cursor: preview.marquee ? 'crosshair' : spaceRef.current ? 'grab' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        data-canvas-frame
        style={{
          position: 'absolute',
          transform: `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`,
          transformOrigin: '0 0',
          width: layout.width,
          height: layout.height,
          boxShadow: '0 0 0 1px var(--nexus-color-border-strong), 0 30px 80px rgba(0,0,0,.55)',
        }}
      >
        {state.grid ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.07) 1px, transparent 1px)',
              backgroundSize: `${GRID_STEP}px ${GRID_STEP}px`,
            }}
          />
        ) : null}
        {visible.ids.map((id) => {
          const resolved = layout.nodes[id];
          if (!resolved || editing?.nodeId === id) return null;
          const moved = preview.move?.nodeId === id ? preview.move : null;
          const resized = preview.resize?.nodeId === id ? preview.resize.box : null;
          return (
            <Node
              key={id}
              resolved={resolved}
              tokens={state.tokens}
              mode={state.activeMode}
              assets={state.assetContext}
              moved={moved}
              resized={resized}
              isRoot={id === layout.rootId}
              isLocked={resolved.node.locked}
              editing={editing}
            />
          );
        })}
      </div>

      {/* overlay：选择框 / 手柄 / 参考线 / 批注标记，独立层，不触发节点重绘 */}
      <div data-canvas-overlay style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* §111：钉了批注的节点在右上角挂一个角标，点了就选中那个元素。
            位置取布局算出来的框，所以缩放平移时角标跟着走，不会飘在别处 */}
        {state.annotations.map((a) => {
          const box = layout.nodes[a.nodeId];
          if (!box || (a.pageId && a.pageId !== state.page?.id)) return null;
          const p = toScreen({ x: box.x + box.width, y: box.y, width: 0, height: 0 });
          return (
            <button
              key={a.id}
              type="button"
              data-annotation-badge={a.nodeId}
              // §111「已解决」的批注角标退成灰并淡出：元素上还有话，但已经处理过了
              data-annotation-resolved={a.resolvedAt ? 'on' : 'off'}
              title={`${a.nodeName}：${a.body}${a.resolvedAt ? '（已解决）' : ''}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => studio.select([a.nodeId])}
              style={{
                position: 'absolute',
                left: p.x - 7,
                top: p.y - 7,
                width: 14,
                height: 14,
                pointerEvents: 'auto',
                borderRadius: 999,
                background: a.resolvedAt ? 'var(--nexus-color-border-strong)' : 'var(--nexus-color-brand)',
                border: '1px solid var(--nexus-color-bg-0)',
                opacity: a.resolvedAt ? 0.55 : 1,
                cursor: 'pointer',
              }}
            />
          );
        })}
        <div style={{ pointerEvents: 'auto' }}>
          <AnnotationsPanel />
        </div>
        {visible.virtualized ? (
          <span
            className="absolute right-3 top-3 rounded bg-bg-1/90 px-2 py-1 font-mono text-11 text-fg-3"
            data-canvas-virtualized
          >
            画布按视口裁剪：显示 {visible.ids.length} / {layout.paintOrder.length}
          </span>
        ) : null}
        {preview.guides?.map((guide, i) => {
          const p = toScreen({ x: guide.at, y: guide.at, width: 0, height: 0 });
          return (
            <div
              key={`${guide.axis}-${guide.at}-${i}`}
              style={{
                position: 'absolute',
                background: 'var(--nexus-color-accent-1)',
                ...(guide.axis === 'x' ? { left: p.x, top: 0, width: 1, height: '100%' } : { top: p.y, left: 0, height: 1, width: '100%' }),
              }}
            />
          );
        })}
        {insertionLine ? <div style={{ ...insertionLine, background: 'var(--nexus-color-brand)' }} /> : null}
        {preview.marquee ? (
          <div
            style={{
              ...toScreen(preview.marquee),
              position: 'absolute',
              border: '1px solid var(--nexus-color-brand)',
              background: 'color-mix(in srgb, var(--nexus-color-brand) 14%, transparent)',
            }}
          />
        ) : null}
        {screenSelection ? (
          <div style={{ ...screenSelection, position: 'absolute', border: '1px solid var(--nexus-color-brand)' }} />
        ) : null}
        {screenLive && singleId ? (
          <>
            {HANDLES.map((handle) => (
              <div
                key={handle.id}
                data-resize-handle={handle.id}
                onPointerDown={startResize(handle.id, {
                  x: layout.nodes[singleId]!.x,
                  y: layout.nodes[singleId]!.y,
                  width: layout.nodes[singleId]!.width,
                  height: layout.nodes[singleId]!.height,
                })}
                style={{
                  position: 'absolute',
                  left: screenLive.x + screenLive.width * handle.dx - 5,
                  top: screenLive.y + screenLive.height * handle.dy - 5,
                  width: 10,
                  height: 10,
                  pointerEvents: 'auto',
                  background: 'var(--nexus-color-bg-0)',
                  border: '1.5px solid var(--nexus-color-brand)',
                  borderRadius: 2,
                  cursor: handle.cursor,
                }}
              />
            ))}
            <span style={badgeStyle(screenLive)}>
              {Math.round(liveBox?.width ?? 0)} × {Math.round(liveBox?.height ?? 0)}
            </span>
          </>
        ) : null}
        {editing ? (
          <InlineTextEditor
            editing={editing}
            tokens={ctx}
            onChange={(value) => setEditing({ ...editing, value })}
            onCommit={() => {
              studio.setText(editing.nodeId, editing.value);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
        {Object.keys(page.nodes).length <= 1 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <p className="max-w-[420px] rounded-[var(--nexus-radius-md)] border border-dashed border-border-subtle bg-bg-1 px-[var(--nexus-space-5)] py-[var(--nexus-space-4)] text-center text-13 text-fg-3">
              空页面：用左侧 Layers 面板的“+”添加元素。画布上的每次修改都会写回设计模型，再投影成渲染与代码。
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function resizeBox(start: Box, handle: Handle, dx: number, dy: number, keepRatio: boolean): Box {
  let { x, y, width, height } = { x: start.x, y: start.y, width: start.width, height: start.height };
  if (handle.includes('w')) {
    width = start.width - dx;
    x = start.x + dx;
  } else if (handle.includes('e')) width = start.width + dx;
  if (handle.includes('n')) {
    height = start.height - dy;
    y = start.y + dy;
  } else if (handle.includes('s')) height = start.height + dy;
  if (keepRatio && start.width > 0 && start.height > 0 && handle.length === 2) {
    height = width / (start.width / start.height);
  }
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
}

/** 自动布局里的插入位置：算出该索引处兄弟节点的前边缘线段 */
function insertionRect(
  layout: NonNullable<ReturnType<typeof useStudio>['layout']>,
  insertion: { parentId: string; index: number },
  toScreen: (box: Box) => Box,
): CSSProperties | null {
  const parent = layout.nodes[insertion.parentId];
  if (!parent) return null;
  const siblings = parent.children.filter((id) => layout.nodes[id]);
  const anchorId = siblings[Math.min(insertion.index, siblings.length - 1)];
  const anchor = anchorId ? layout.nodes[anchorId] : null;
  if (!anchor) return null;
  const horizontal = parent.node.layout.mode === 'horizontal';
  const at = horizontal ? anchor.x : anchor.y;
  const cross = horizontal ? { x: at, y: parent.y, width: 2, height: parent.height } : { x: parent.x, y: at, width: parent.width, height: 2 };
  return { ...toScreen(cross), position: 'absolute' };
}

function badgeStyle(box: Box): CSSProperties {
  return {
    position: 'absolute',
    left: box.x,
    top: box.y + box.height + 6,
    padding: '1px 6px',
    font: '500 11px var(--nexus-font-mono)',
    color: 'var(--nexus-color-fg-1)',
    background: 'var(--nexus-color-brand)',
    borderRadius: 3,
    whiteSpace: 'nowrap',
  };
}

function InlineTextEditor(props: {
  editing: { nodeId: string; value: string };
  tokens: { tokens: ReturnType<typeof useStudio>['tokens']; mode: string | null };
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const snap = useStudio();
  const resolved = snap.layout?.nodes[props.editing.nodeId];
  if (!resolved) return null;
  const style = nodeStyle(resolved, props.tokens);
  const box = toScreenBox({ x: resolved.x, y: resolved.y, width: resolved.width, height: resolved.height }, snap.zoom, snap.pan);
  return (
    <textarea
      data-inline-editor
      autoFocus
      value={props.editing.value}
      onChange={(e) => props.onChange(e.target.value)}
      onBlur={props.onCommit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          props.onCommit();
        }
        if (e.key === 'Escape') props.onCancel();
      }}
      style={{
        ...style,
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: Math.max(80, box.width),
        height: Math.max(24, box.height),
        transform: 'none',
        margin: 0,
        padding: 0,
        border: '1px solid var(--nexus-color-brand)',
        background: 'rgba(0,0,0,.45)',
        outline: 'none',
        resize: 'none',
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    />
  );
}

function toScreenBox(box: Box, zoom: number, pan: { x: number; y: number }): Box {
  return { x: box.x * zoom + pan.x, y: box.y * zoom + pan.y, width: box.width * zoom, height: box.height * zoom };
}
