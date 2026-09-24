'use client';

import { useEffect, useRef, useState } from 'react';
import {
  WORLD_KINDS,
  WORLD_KIND_LABELS,
  linkWorldNodes,
  removeWorldLink,
  setWorldNodePosition,
  worldGraph,
  type WorldKind,
} from '@nexus/world-model';
import { cn } from '@/lib/cn';
import { useStudioReady } from './store';
import { useWorld, worldStore } from './worldStore';

/**
 * §45 World Graph：世界条目之间的关系画成一张可拖的图。
 *
 * 位置存在世界文档里（`positions`），不碰条目内容——换视图、换设备不该改写谁写过的正文。
 * 没拖过的节点按 `autoLayout` 确定性排布：同一份文档每次打开排成同一个样子，
 * 否则"刷新之后图乱跑了"会被当成 bug，其实只是随机数。
 *
 * 这一版不做自动避障、不做缩放、不做多选：能连线、能拖、能删、刷新还在，就是 §45 要的闭环。
 */

const NODE_W = 176;
const NODE_H = 46;

/** 九类的色相：只用来分类，不承担语义（真正的语义在关系标签上） */
const KIND_FILL: Record<WorldKind, string> = {
  lore: '#3b2f63',
  history: '#2f4b63',
  geography: '#245446',
  factions: '#5b3f2a',
  characters: '#4a2f4f',
  creatures: '#2f5038',
  items: '#4f4526',
  quests: '#26414f',
  story: '#4d2b34',
};

export function WorldGraphView() {
  const studio = useStudioReady();
  const snapshot = useWorld();
  const [label, setLabel] = useState('');
  const [pickedEdge, setPickedEdge] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  /** 拖完那一下也会触发 click：不吞掉它，节点就会被顺手选中（拖 ≠ 选） */
  const suppressClick = useRef(false);

  useEffect(() => {
    worldStore.ensure(studio.projectId);
  }, [studio.projectId]);

  const world = snapshot.world;

  if (!world) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-3 p-6" data-world-graph>
        <p className="max-w-[420px] text-13 leading-relaxed text-fg-2" data-graph-empty>
          {snapshot.saveState === 'loading'
            ? '读取世界…'
            : snapshot.error
              ? `读不出世界：${snapshot.error}`
              : '这个项目还没有世界。先建一份模板骨架，再来这里连关系。'}
        </p>
        {!snapshot.error && snapshot.saveState !== 'loading' ? (
          <button
            type="button"
            onClick={() => void worldStore.createSkeleton(studio.document?.name ?? '未命名世界')}
            data-graph-create
            className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1"
          >
            创建世界骨架（模板）
          </button>
        ) : null}
      </div>
    );
  }

  const { nodes, edges } = worldGraph(world);
  const width = Math.max(900, ...nodes.map((n) => n.x + NODE_W + 120));
  const height = Math.max(520, ...nodes.map((n) => n.y + NODE_H + 120));
  const center = (x: number, y: number) => ({ cx: x + NODE_W / 2, cy: y + NODE_H / 2 });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const picked = snapshot.picked;

  const startDrag = (event: React.PointerEvent<SVGGElement>, id: string) => {
    const node = byId.get(id);
    if (!node) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    drag.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
      moved: false,
    };
    setDragging(id);
  };

  const moveDrag = (event: React.PointerEvent<SVGGElement>) => {
    const active = drag.current;
    if (!active) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (!active.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    active.moved = true;
    worldStore.setLocal(
      setWorldNodePosition(world, active.id, {
        x: Math.max(0, Math.round(active.originX + dx)),
        y: Math.max(0, Math.round(active.originY + dy)),
      }),
    );
  };

  const endDrag = () => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    setDragging(null);
    if (active.moved) {
      suppressClick.current = true;
      void worldStore.commit();
    }
  };

  const connect = () => {
    if (picked.length !== 2) return;
    const result = linkWorldNodes(world, picked[0]!, picked[1]!, label);
    if (result.reason) {
      // 连不上也要说清为什么，不能点了没反应
      worldStore.showNotice(result.reason);
      return;
    }
    worldStore.setLocal(result.document);
    worldStore.clearNotice();
    setLabel('');
    worldStore.clearPick();
    void worldStore.commit();
  };

  const removeEdge = () => {
    if (!pickedEdge) return;
    worldStore.setLocal(removeWorldLink(world, pickedEdge));
    setPickedEdge(null);
    void worldStore.commit();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-0" data-world-graph>
      {/* 工具条与回执固定在滚动区之外：跟着画布一起横滚，"已保存"和「连一条」会在往右拖时消失 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--nexus-color-border-subtle)] bg-bg-1 px-3 py-2">
        <span className="font-mono text-12 text-fg-3" data-graph-count>
          {nodes.length} 个条目 · {edges.length} 条关系
        </span>
        {/* §140：图上摆过的位置就是 3D 世界的地面布局，所以入口放在这里而不是另造一个页面 */}
        <a
          href={`/world/${studio.projectId}`}
          className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-2 hover:bg-bg-3"
          data-enter-world3d
        >
          走进这个世界（3D）
        </a>
        <span className="text-11 text-fg-3">
          {picked.length === 2 ? `已选 ${byId.get(picked[0]!)?.title} → ${byId.get(picked[1]!)?.title}` : '点两个节点就能连一条关系'}
        </span>
        {picked.length === 2 ? (
          <>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="关系叫什么（可留空）"
              aria-label="关系标签"
              data-graph-label
              className="w-[180px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3"
            />
            <button
              type="button"
              onClick={connect}
              data-graph-connect
              className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1"
            >
              连一条
            </button>
            <button
              type="button"
              onClick={() => worldStore.clearPick()}
              data-graph-clear
              className="rounded-[var(--nexus-radius-sm)] px-2 py-1 text-11 text-fg-3 hover:bg-bg-2"
            >
              取消选择
            </button>
          </>
        ) : null}
        {pickedEdge ? (
          <button
            type="button"
            onClick={removeEdge}
            data-graph-remove-edge
            className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-danger"
          >
            删除这条关系
          </button>
        ) : null}
        <span
          className={cn(
            'ml-auto font-mono text-11',
            snapshot.saveState === 'error' ? 'text-danger' : 'text-fg-3',
          )}
          data-graph-state
        >
          {snapshot.saveState === 'saving'
            ? '保存中…'
            : snapshot.saveState === 'dirty'
              ? '未保存'
              : snapshot.saveState === 'saved'
                ? '已保存'
                : snapshot.saveState === 'error'
                  ? '保存失败'
                  : ''}
        </span>
        {/* 还有没写完的保存吗？面板上给一个可读的信号，测试也用它等落库稳定 */}
        <span data-graph-pending={snapshot.saveState === 'saving' || snapshot.saveState === 'dirty' ? 'true' : 'false'} />
      </div>
      {snapshot.notice ? (
        <p className="px-3 py-2 text-11 text-warn" data-graph-notice>
          {snapshot.notice}
          <button
            type="button"
            onClick={() => worldStore.clearNotice()}
            className="ml-2 text-fg-3 underline"
            data-graph-notice-dismiss
          >
            知道了
          </button>
        </p>
      ) : null}
      {snapshot.error ? (
        <p className="px-3 py-2 text-11 text-danger" data-graph-error>
          {snapshot.error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <svg width={width} height={height} className="block" data-graph-canvas>
        <defs>
          <marker id="world-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--nexus-color-border-strong)" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const a = center(edge.from.x, edge.from.y);
          const b = center(edge.to.x, edge.to.y);
          const mid = { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2 };
          const active = pickedEdge === edge.id;
          return (
            <g key={edge.id} data-graph-edge={edge.id}>
              <line
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                stroke={active ? 'var(--nexus-color-accent-2)' : 'var(--nexus-color-border-strong)'}
                strokeWidth={active ? 2.5 : 1.5}
                markerEnd="url(#world-arrow)"
              />
              {/* 细线不好点：垫一条透明的粗线当命中区 */}
              <line
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                stroke="transparent"
                strokeWidth={16}
                className="cursor-pointer"
                onClick={() => setPickedEdge(active ? null : edge.id)}
              />
              {edge.label ? (
                <text x={mid.x} y={mid.y - 6} textAnchor="middle" className="fill-fg-3 text-[11px]">
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {nodes.map((node) => {
          const isPicked = picked.includes(node.id);
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className={cn('cursor-grab', dragging === node.id && 'cursor-grabbing')}
              data-graph-node={node.id}
              data-graph-kind={node.kind}
              data-graph-picked={isPicked ? 'true' : 'false'}
              onPointerDown={(event) => startDrag(event, node.id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                worldStore.togglePick(node.id);
              }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill={KIND_FILL[node.kind] ?? '#20242e'}
                stroke={isPicked ? 'var(--nexus-color-accent-2)' : 'var(--nexus-color-border-strong)'}
                strokeWidth={isPicked ? 2 : 1}
              />
              <text x={12} y={19} className="fill-fg-1 text-[12px] font-medium">
                {node.title.length > 16 ? `${node.title.slice(0, 15)}…` : node.title}
              </text>
              <text x={12} y={35} className="fill-fg-3 text-[10px]">
                {WORLD_KIND_LABELS[node.kind] ?? node.kind}
              </text>
            </g>
          );
        })}
        </svg>
      </div>
      {!edges.length ? (
        <p className="pointer-events-none px-3 pt-2 text-11 text-fg-3" data-graph-hint>
          还没有关系：点两个节点（顺序就是箭头方向），再点「连一条」。
        </p>
      ) : null}
      <p className="shrink-0 px-3 py-2 text-11 leading-relaxed text-fg-3" data-graph-note>
        位置存在世界文档里，拖完松手即写库；没拖过的按类分列自动排布。
        九类：{WORLD_KINDS.map((k) => WORLD_KIND_LABELS[k]).join(' / ')}。
      </p>
    </div>
  );
}
