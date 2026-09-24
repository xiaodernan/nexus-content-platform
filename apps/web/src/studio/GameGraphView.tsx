'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  GAME_ENTITY_KINDS,
  GAME_ENTITY_LABELS,
  linkEntities,
  referenceGraph,
  removeRef,
  type GameDocument,
  type GameEntityKind,
} from '@nexus/game-model';
import { cn } from '@/lib/cn';
import { useStudioReady } from './store';
import { useGame, gameStore } from './gameStore';

/**
 * §54 的实体引用图：把 `referenceGraph` 那份投影画出来。
 *
 * **这里没有"拖节点存位置"这回事**，而且是刻意的：游戏文档里没有位置字段，
 * 模型层把布局划给了视图（"布局是视图的事"）。所以位置按**类分列**算出来——
 * 同一份文档每次打开排成同一个样子，刷新不会让图乱跑，也不会有人以为"摆位没保存成功"。
 *
 * 图上做的是 §54 要的那件：看清谁引用谁、方向朝哪、这条引用算什么关系，
 * 并能就地连一条 / 摘一条——写进文档的是 refs，不是图上的装饰。
 */

const NODE_W = 168;
const NODE_H = 44;
const COL_GAP = 56;
const ROW_GAP = 22;
const PAD_X = 40;
const PAD_Y = 78;

/** 11 类的色相：只用来分类，不承担语义（真正的语义在引用标签上） */
const KIND_FILL: Record<GameEntityKind, string> = {
  player: '#2f4b63',
  enemy: '#4d2b34',
  weapon: '#4f4526',
  item: '#245446',
  quest: '#3b2f63',
  dialogue: '#4a2f4f',
  trigger: '#5b3f2a',
  npc: '#2f5038',
  camera: '#26414f',
  animation: '#4d3f26',
  particle: '#33424f',
};

/** 位置由文档唯一决定：按 §54 的 11 类分列，列内按文档顺序往下排 */
function layoutOf(game: GameDocument): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  GAME_ENTITY_KINDS.forEach((kind, column) => {
    const inKind = game.entities.filter((entity) => entity.kind === kind);
    inKind.forEach((entity, row) => {
      map.set(entity.id, {
        x: PAD_X + column * (NODE_W + COL_GAP),
        y: PAD_Y + row * (NODE_H + ROW_GAP),
      });
    });
  });
  return map;
}

/**
 * 一条边的画法：两端裁到方块边上（箭头才能露出来），中间沿垂直方向拱开。
 *
 * 拱开不是为了好看：同一行的两个实体，中心连线正好从中间那一列节点的方块底下穿过，
 * 命中区被盖住后点上去选中的是节点——"点边删引用"就再也点不动了。
 */
function edgePath(
  a: { cx: number; cy: number },
  b: { cx: number; cy: number },
): { d: string; mid: { x: number; y: number } } {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.max(Math.abs(dx) / (NODE_W / 2 + 2), Math.abs(dy) / (NODE_H / 2 + 2));
  const trim = t > 0 ? 1 / t : 0;
  const from = { x: a.cx + dx * trim, y: a.cy + dy * trim };
  const to = { x: b.cx - dx * trim, y: b.cy - dy * trim };
  const bow = Math.min(56, len * 0.22);
  const ctrl = {
    x: (from.x + to.x) / 2 - (dy / len) * bow * 2,
    y: (from.y + to.y) / 2 + (dx / len) * bow * 2,
  };
  // 二阶贝塞尔 t=0.5 处：0.25·P0 + 0.5·P1 + 0.25·P2
  const mid = {
    x: 0.25 * from.x + 0.5 * ctrl.x + 0.25 * to.x,
    y: 0.25 * from.y + 0.5 * ctrl.y + 0.25 * to.y,
  };
  return { d: `M ${from.x} ${from.y} Q ${ctrl.x} ${ctrl.y} ${to.x} ${to.y}`, mid };
}

export function GameGraphView() {
  const studio = useStudioReady();
  const snapshot = useGame();
  const [role, setRole] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedEdge, setPickedEdge] = useState<string | null>(null);
  const game = snapshot.game;

  // 直接切到这张图（没开过左侧面板）也要有东西可读：载入由 store 幂等地兜住
  useEffect(() => {
    gameStore.ensure(studio.projectId);
  }, [studio.projectId]);

  const { nodes, edges, pos } = useMemo(() => {
    if (!game) return { nodes: [], edges: [], pos: new Map<string, { x: number; y: number }>() };
    return { ...referenceGraph(game), pos: layoutOf(game) };
  }, [game]);

  if (!game) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-3 p-6" data-game-graph>
        <p className="max-w-[420px] text-13 leading-relaxed text-fg-2" data-game-graph-empty>
          {snapshot.saveState === 'loading'
            ? '读取游戏设计…'
            : snapshot.error
              ? `读不出游戏：${snapshot.error}`
              : '这个项目还没有游戏设计。先去左侧「游戏」面板建一份模板骨架，再来这里连引用。'}
        </p>
        {!snapshot.error && snapshot.saveState !== 'loading' ? (
          <button
            type="button"
            onClick={() => void gameStore.createSkeleton(studio.document?.name ?? '未命名游戏')}
            data-game-graph-create
            className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1"
          >
            创建游戏骨架（模板）
          </button>
        ) : null}
      </div>
    );
  }

  const width = PAD_X * 2 + GAME_ENTITY_KINDS.length * (NODE_W + COL_GAP);
  const tallest = Math.max(
    1,
    ...GAME_ENTITY_KINDS.map((kind) => nodes.filter((node) => node.kind === kind).length),
  );
  const height = PAD_Y + tallest * (NODE_H + ROW_GAP) + 40;
  const at = (id: string) => pos.get(id) ?? { x: 0, y: 0 };
  const center = (id: string) => {
    const p = at(id);
    return { cx: p.x + NODE_W / 2, cy: p.y + NODE_H / 2 };
  };
  const nameOf = (id: string) => nodes.find((node) => node.id === id)?.name ?? id;

  const togglePick = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current.slice(-1), id],
    );

  const connect = () => {
    if (picked.length !== 2) return;
    const result = linkEntities(game, picked[0]!, picked[1]!, role);
    if (result.reason) {
      // 连不上也要说清为什么，不能点了没反应
      gameStore.showNotice(result.reason);
      return;
    }
    gameStore.setLocal(result.document);
    setRole('');
    setPicked([]);
    void gameStore.commit();
  };

  const removeEdge = () => {
    if (!pickedEdge) return;
    // 引用挂在实体身上，所以摘它要先找到发起方——这正是它与 world-model 的关系表不一样的地方
    const owner = game.entities.find((entity) => entity.refs.some((ref) => ref.id === pickedEdge));
    if (!owner) return;
    gameStore.setLocal(removeRef(game, owner.id, pickedEdge));
    setPickedEdge(null);
    void gameStore.commit();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-0" data-game-graph>
      {/* 工具条固定在滚动区之外：跟着画布一起横滚的话，"已保存"会在往右拖时消失 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--nexus-color-border-subtle)] bg-bg-1 px-3 py-2">
        <span className="font-mono text-12 text-fg-3" data-game-graph-count>
          {nodes.length} 个实体 · {edges.length} 条引用
        </span>
        <span className="text-11 text-fg-3" data-game-graph-selection>
          {picked.length === 2
            ? `已选 ${nameOf(picked[0]!)} → ${nameOf(picked[1]!)}`
            : '点两个实体就能连一条引用（顺序就是箭头方向）'}
        </span>
        {picked.length === 2 ? (
          <>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="关系叫什么（可留空）"
              aria-label="引用关系"
              data-game-graph-role
              className="w-[180px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3"
            />
            <button
              type="button"
              onClick={connect}
              data-game-graph-connect
              className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1"
            >
              连一条
            </button>
            <button
              type="button"
              onClick={() => setPicked([])}
              data-game-graph-clear
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
            data-game-graph-remove-ref
            className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-danger"
          >
            摘掉这条引用
          </button>
        ) : null}
        <span
          className={cn('ml-auto font-mono text-11', snapshot.saveState === 'error' ? 'text-danger' : 'text-fg-3')}
          data-game-graph-state
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
        <span
          data-game-graph-pending={snapshot.saveState === 'saving' || snapshot.saveState === 'dirty' ? 'true' : 'false'}
        />
      </div>
      {snapshot.notice ? (
        <p className="px-3 py-2 text-11 text-warn" data-game-graph-notice>
          {snapshot.notice}
        </p>
      ) : null}
      {snapshot.error ? (
        <p className="px-3 py-2 text-11 text-danger" data-game-graph-error>
          {snapshot.error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <svg width={width} height={height} className="block" data-game-graph-canvas>
          <defs>
            <marker
              id="game-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--nexus-color-border-strong)" />
            </marker>
          </defs>
          {GAME_ENTITY_KINDS.map((kind) => {
            const inKind = nodes.filter((node) => node.kind === kind);
            if (!inKind.length) return null;
            return (
              <text
                key={kind}
                x={at(inKind[0]!.id).x}
                y={PAD_Y - 22}
                className="fill-fg-3 text-[11px]"
                data-game-graph-column={kind}
              >
                {GAME_ENTITY_LABELS[kind]}（{inKind.length}）
              </text>
            );
          })}
          {edges.map((edge) => {
            const a = center(edge.from.id);
            const b = center(edge.to.id);
            const drawn = edgePath(a, b);
            const active = pickedEdge === edge.id;
            const stroke = active ? 'var(--nexus-color-accent-2)' : 'var(--nexus-color-border-strong)';
            const pickEdge = () => setPickedEdge(active ? null : edge.id);
            return (
              <g key={edge.id} data-game-graph-edge={edge.id}>
                <path d={drawn.d} fill="none" stroke={stroke} strokeWidth={active ? 2.5 : 1.5} markerEnd="url(#game-arrow)" />
                {/* 线不好点：垫一条透明的粗线当命中区，再加一个弧顶抓手 */}
                <path
                  d={drawn.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  className="cursor-pointer"
                  onClick={pickEdge}
                />
                <circle
                  cx={drawn.mid.x}
                  cy={drawn.mid.y}
                  r={6}
                  fill={active ? 'var(--nexus-color-accent-2)' : 'var(--nexus-color-bg-2)'}
                  stroke="var(--nexus-color-border-strong)"
                  className="cursor-pointer"
                  data-game-graph-handle={edge.id}
                  onClick={pickEdge}
                />
                {edge.role ? (
                  <text x={drawn.mid.x} y={drawn.mid.y - 12} textAnchor="middle" className="fill-fg-3 text-[11px]">
                    {edge.role}
                  </text>
                ) : null}
              </g>
            );
          })}
          {nodes.map((node) => {
            const p = at(node.id);
            const isPicked = picked.includes(node.id);
            return (
              <g
                key={node.id}
                transform={`translate(${p.x}, ${p.y})`}
                className="cursor-pointer"
                data-game-graph-node={node.id}
                data-game-graph-kind={node.kind}
                data-game-graph-stats={node.statCount}
                data-game-graph-picked={isPicked ? 'true' : 'false'}
                onClick={() => togglePick(node.id)}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={KIND_FILL[node.kind] ?? '#20242e'}
                  stroke={isPicked ? 'var(--nexus-color-accent-2)' : 'var(--nexus-color-border-strong)'}
                  strokeWidth={isPicked ? 2 : 1}
                  opacity={node.statCount === 0 ? 0.55 : 1}
                />
                <text x={12} y={19} className="fill-fg-1 text-[12px] font-medium">
                  {node.name.length > 16 ? `${node.name.slice(0, 15)}…` : node.name}
                </text>
                <text x={12} y={35} className="fill-fg-3 text-[10px]">
                  {GAME_ENTITY_LABELS[node.kind] ?? node.kind}
                  {node.statCount ? ` · ${node.statCount} 项数值` : ' · 还没填数值'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {!edges.length ? (
        <p className="pointer-events-none px-3 pt-2 text-11 text-fg-3" data-game-graph-hint>
          还没有引用：点两个实体（顺序就是箭头方向），再点「连一条」。
        </p>
      ) : null}
      <p className="shrink-0 px-3 py-2 text-11 leading-relaxed text-fg-3" data-game-graph-note>
        位置按 §54 的 11 类分列算出来、不存在文档里：游戏文档只记谁引用谁，不记摆在哪个像素。
        点边上的圆点（或直接点那条线）选中引用，再摘掉它。
        淡一点的是还没填过数值的实体（模板骨架里的样子）。
      </p>
    </div>
  );
}
