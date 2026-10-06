'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARENA,
  EXPLORATION_REVEAL_RADIUS,
  EXPLORATION_VIEW_NOTES,
  ISO_VIEW_NOTES,
  PUZZLE_VIEW_NOTES,
  SIM_RULE_NOTES,
  discoverableIds,
  initialState,
  isoDepth,
  isoGroundRadius,
  isoProject,
  isoView,
  playtest,
  puzzleLinks,
  revealedNow,
  simSummary,
  step,
  type GamePlan,
  type PlayActor,
  type PlaytestReport,
  type PuzzleLink,
  type SimActor,
  type SimInput,
  type SimState,
} from '@nexus/game-model';
import { KIND_COLORS } from './palette';
import { PLAY_DEFAULTS } from '@nexus/game-model';
import { GameCanvas3D } from './GameCanvas3D';

/**
 * §50 的可玩投影：把 `compileGame` 排出来的关卡计划交给 `step` 跑，画在 2D 画布上。
 *
 * 四条边界（都同时显示在界面上，不只写在注释里）：
 * - 规则不在这里。移动、追击、伤害、任务判定全在 `@nexus/game-model/sim`，
 *   所以"浏览器里玩到的"和"单测断言的"是同一套算术；这里只负责输入、绘制与 HUD。
 * - 形状只用来区分类别（圆=玩家、方=敌人、菱=物品、三角=NPC），**不是美术**。
 *   §34 的 3D 模型与 §43 的动画在这里都没有，页面上就这么写。
 * - 作者没填的数值一律走兜底，并且把"有几个实体是兜底跑起来的"写在脸上：
 *   让人以为"敌人伤害 1 是设计的"就是假数据（§159）。
 * - `view` 只换画法（§51 的 2.5D = 等轴测投影，3D = 同一份计划的立体视角）：循环、输入、HUD、
 *   playtest 全部共用，所以"换画法玩起来不一样"这句话在这里说不出来——它就是同一个游戏。
 *   唯一的分叉点是那个 `draw`（2D 画进 canvas / 3D 交给 `GameCanvas3D` 的 three.js 场景），
 *   规则一个字都没动。
 */

const KEY_MAP: Record<string, [number, number]> = {
  arrowup: [0, -1],
  w: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1],
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
};

function shapeOf(kind: string): 'circle' | 'square' | 'diamond' | 'triangle' {
  if (kind === 'enemy') return 'square';
  if (kind === 'item') return 'diamond';
  if (kind === 'npc') return 'triangle';
  return 'circle';
}

/** 画法（§51）：`topdown` 是 2D，`isometric` 是 2.5D，`exploration` 是走近才看得见的探索画法，
 * `puzzle` 是把机关引用连线画出来的解谜画法，`3d` 是同一份计划的立体视角——
 * 五条画法共用同一个 step 与同一份 HUD，所以"换画法玩起来不一样"这句话在这里说不出来 */
export type GameView = 'topdown' | 'isometric' | 'exploration' | 'puzzle' | '3d';

/** 颜色表在 `palette.ts`：2D 与 3D 两个组件共用一份，别在这里再写第二份（§16） */
const COLORS = KIND_COLORS;

/** 一个个体的标记：类别形状 + 血条 + 名字。`ground` 是等轴测那条画法的地面投影（俯视为 null） */
function paintActor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  actor: PlayActor,
  sim: SimActor | undefined,
  ground: { rx: number; ry: number } | null,
): void {
  const r = actor.radius;
  if (ground) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = COLORS[actor.kind] ?? '#e5e7eb';
    ctx.beginPath();
    ctx.ellipse(x, y, ground.rx, ground.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = COLORS[actor.kind] ?? '#e5e7eb';
  ctx.beginPath();
  if (shapeOf(actor.kind) === 'square') ctx.rect(x - r, y - r, r * 2, r * 2);
  else if (shapeOf(actor.kind) === 'diamond') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  } else if (shapeOf(actor.kind) === 'triangle') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x - r, y + r);
    ctx.closePath();
  } else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (typeof sim?.health === 'number' && actor.kind === 'enemy') {
    const max = actor.health || 1;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - r, y - r - 9, r * 2, 4);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x - r, y - r - 9, r * 2 * Math.max(0, Math.min(1, sim.health / max)), 4);
  }
  ctx.fillStyle = 'rgba(229,231,235,0.75)';
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText(actor.name.slice(0, 14), x - r, y + r + 15);
}

/** 玩家标记：圆 + 触及范围。`ground` 是等轴测那条画法的地面投影（俯视为 null） */
function paintPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  plan: GamePlan,
  reach: { rx: number; ry: number } | null,
  ground: { rx: number; ry: number } | null = null,
): void {
  const r = plan.player?.radius ?? 16;
  if (ground) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = COLORS.player ?? '#7dd3fc';
    ctx.beginPath();
    ctx.ellipse(x, y, ground.rx, ground.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = COLORS.player ?? '#7dd3fc';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  const reachWorld = (plan.player?.radius ?? 0) + (plan.player?.reach ?? 0);
  if (reachWorld > r) {
    ctx.strokeStyle = 'rgba(125,211,252,0.35)';
    ctx.beginPath();
    if (reach) ctx.ellipse(x, y, reach.rx, reach.ry, 0, 0, Math.PI * 2);
    else ctx.arc(x, y, reachWorld, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function actorDots(plan: GamePlan, state: SimState): { actor: PlayActor; sim: SimActor | undefined }[] {
  return [
    ...plan.items.map((item) => ({ actor: item, sim: state.items.find((s) => s.id === item.id) })),
    ...plan.enemies.map((enemy) => ({ actor: enemy, sim: state.enemies.find((s) => s.id === enemy.id) })),
    ...plan.npcs.map((npc) => ({ actor: npc, sim: undefined })),
  ];
}

function clear(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
}

/** 俯视画法：位置就是计划里的世界坐标，一步映射都不加。
 * `revealed` 不为 null 时只画看见过的东西——探索画法（§51）复用这同一条路径，只是加一道过滤，
 * 不另写第二个绘制函数：两条画法的差别就必须只有这道过滤。
 * `links` 不为 null 时画机关→影响的引用连线——解谜画法同样复用这同一条路径：
 * 连线是谜题的结构信息（作者连了什么谜题就是什么），判定仍然走同一个 step */
function drawTopdown(
  ctx: CanvasRenderingContext2D,
  plan: GamePlan,
  state: SimState,
  revealed: Set<string> | null = null,
  links: PuzzleLink[] | null = null,
): void {
  clear(ctx);

  if (links) {
    // 连线画在实体下面：谜题玩家要先看清"机关连着什么"。激活过的机关连线实线、未激活虚线
    ctx.lineWidth = 2;
    for (const link of links) {
      const done = state.activated[link.triggerId] !== undefined;
      ctx.strokeStyle = done ? 'rgba(250,204,21,0.8)' : 'rgba(250,204,21,0.3)';
      ctx.setLineDash(done ? [] : [4, 10]);
      ctx.beginPath();
      ctx.moveTo(link.from.x, link.from.y);
      ctx.lineTo(link.to.x, link.to.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineWidth = 1;
  }

  for (const trigger of plan.triggers) {
    if (revealed && !revealed.has(trigger.id)) continue;
    const sim = state.triggers.find((t) => t.id === trigger.id);
    ctx.beginPath();
    ctx.arc(trigger.x, trigger.y, trigger.radius, 0, Math.PI * 2);
    // 激活过的机关画实线圈（解谜画法里"扳下了"必须看得出来）；冷却中的亮虚线仍是原语义
    const lit = state.activated[trigger.id] !== undefined || Boolean(sim && sim.readyAt > state.t);
    ctx.strokeStyle = lit ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.14)';
    ctx.setLineDash(state.activated[trigger.id] !== undefined ? [] : [6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const { actor, sim } of actorDots(plan, state)) {
    if (sim && !sim.active) continue; // 被打倒/已拾取的不画：画着就是"场上还有"的谎
    if (revealed && !revealed.has(actor.id)) continue;
    paintActor(ctx, sim?.x ?? actor.x, sim?.y ?? actor.y, actor, sim, null);
  }

  if (state.health > 0) paintPlayer(ctx, state.px, state.py, plan, null);
}

/**
 * 等轴测绘法（§51 的 2.5D）：同一份坐标过一次 `isoProject`，再按远近排序绘制。
 * 网格与地面投影都是画出来的，判定仍然走 `step` 的平面坐标（`ISO_VIEW_NOTES` 里照实说）。
 */
function drawIso(ctx: CanvasRenderingContext2D, plan: GamePlan, state: SimState): void {
  const view = isoView();
  clear(ctx);

  // 地面网格 + 场地边界：让"菱形是同一块 1200×760 的地"这件事看得见
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  const stepPx = 100;
  for (let x = 0; x <= ARENA.width; x += stepPx) {
    const a = isoProject(view, x, 0);
    const b = isoProject(view, x, ARENA.height);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = 0; y <= ARENA.height; y += stepPx) {
    const a = isoProject(view, 0, y);
    const b = isoProject(view, ARENA.width, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  const corners = [
    isoProject(view, 0, 0),
    isoProject(view, ARENA.width, 0),
    isoProject(view, ARENA.width, ARENA.height),
    isoProject(view, 0, ARENA.height),
  ];
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(corners[0]!.x, corners[0]!.y);
  for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y);
  ctx.closePath();
  ctx.stroke();

  for (const trigger of plan.triggers) {
    const sim = state.triggers.find((t) => t.id === trigger.id);
    const at = isoProject(view, trigger.x, trigger.y);
    const { rx, ry } = isoGroundRadius(view, trigger.radius);
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = sim && sim.readyAt > state.t ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)';
    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  type Entry = { depth: number; paint: () => void };
  const entries: Entry[] = [];
  for (const { actor, sim } of actorDots(plan, state)) {
    if (sim && !sim.active) continue;
    const world = { x: sim?.x ?? actor.x, y: sim?.y ?? actor.y };
    const at = isoProject(view, world.x, world.y);
    const ground = isoGroundRadius(view, actor.radius);
    entries.push({
      depth: isoDepth(world.x, world.y),
      paint: () => paintActor(ctx, at.x, at.y, actor, sim, ground),
    });
  }
  if (state.health > 0) {
    const at = isoProject(view, state.px, state.py);
    const reachWorld = (plan.player?.radius ?? 0) + (plan.player?.reach ?? 0);
    entries.push({
      depth: isoDepth(state.px, state.py),
      paint: () =>
        paintPlayer(
          ctx,
          at.x,
          at.y,
          plan,
          isoGroundRadius(view, reachWorld),
          isoGroundRadius(view, plan.player?.radius ?? 16),
        ),
    });
  }
  // 远的先画，近的后画：等轴测里没有遮挡关系，但标签与血条叠在一起时顺序必须稳定
  entries.sort((a, b) => a.depth - b.depth);
  for (const entry of entries) entry.paint();
}

/** 2D 那四条画法的分派。`3d` 不在这里：它由 `GameCanvas3D` 用自己的渲染循环画（three.js 掌握时机） */
function draw(
  ctx: CanvasRenderingContext2D,
  plan: GamePlan,
  state: SimState,
  view: 'topdown' | 'isometric' | 'exploration' | 'puzzle',
  revealed: Set<string> | null,
): void {
  if (view === 'isometric') drawIso(ctx, plan, state);
  else if (view === 'puzzle') drawTopdown(ctx, plan, state, null, puzzleLinks(plan));
  else drawTopdown(ctx, plan, state, view === 'exploration' ? revealed : null);
}

export function GamePlay({ plan, view = 'topdown' }: { plan: GamePlan; view?: GameView }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const stateRef = useRef<SimState>(initialState(plan));
  const lastFrame = useRef<number>(0);
  // 探索画法（§51）的「看见过」集合：视图层的状态，不进模型也不进库——
  // 模型里没有探索进度这个字段，刷新就重摸一遍，这条限度写在 EXPLORATION_VIEW_NOTES 里
  const revealed = useRef<Set<string>>(new Set());
  const [hud, setHud] = useState<SimState>(() => stateRef.current);
  // §53：报告是点出来的，不是每次进页面就自动跑——四种走法各 60 秒定步长，
  // 一进来就占住主线程的话，第一个画面反而出不来
  const [report, setReport] = useState<PlaytestReport | null>(null);

  const restart = useCallback(() => {
    stateRef.current = initialState(plan);
    revealed.current.clear();
    setHud(stateRef.current);
  }, [plan]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keys.current[key] = true;
      if (key in KEY_MAP || key === ' ') event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      keys.current[event.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (!plan.playable) return;
    // 3D 画法的循环由 `GameCanvas3D` 的 useFrame 驱动（three.js 要自己掌握渲染时机）。
    // 这里必须直接退出：两个循环各推一次 step，同一份状态每帧被推进两遍，
    // 规则会悄悄变快一倍而两边的单测都还是绿的（§159 的反方向：能跑 ≠ 跑对了）。
    if (view === '3d') return;
    if (view === 'exploration') revealed.current.clear(); // 新的一份计划，重新摸
    let raf = 0;
    let hudAt = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = lastFrame.current ? (now - lastFrame.current) / 1000 : 0;
      lastFrame.current = now;
      let dx = 0;
      let dy = 0;
      for (const [key, pressed] of Object.entries(keys.current)) {
        if (!pressed) continue;
        const vector = KEY_MAP[key];
        if (!vector) continue;
        dx += vector[0];
        dy += vector[1];
      }
      const input: SimInput = { dx, dy, attack: Boolean(keys.current[' ']) };
      stateRef.current = step(plan, stateRef.current, input, dt);
      if (view === 'exploration') {
        // 揭示是视图层每帧算的（欧氏距离，见 revealedNow），加进集合就一直看得见
        for (const id of revealedNow(plan, { x: stateRef.current.px, y: stateRef.current.py })) {
          revealed.current.add(id);
        }
      }
      const ctx = canvas.current?.getContext('2d') ?? null;
      if (ctx) draw(ctx, plan, stateRef.current, view, view === 'exploration' ? revealed.current : null);
      // HUD 每 100ms 同步一次：60fps 的 React 重渲染只会把主线程吃光，而读数不需要那么新
      if (now - hudAt > 100) {
        hudAt = now;
        setHud(stateRef.current);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      lastFrame.current = 0;
    };
  }, [plan, view]);

  const fallbackStats = useMemo(() => {
    const actors = [plan.player, ...plan.enemies, ...plan.items, ...plan.npcs].filter(
      (actor): actor is NonNullable<typeof actor> => actor !== null,
    );
    const keys = ['health', 'damage', 'speed', 'senseRadius'] as const;
    const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<(typeof keys)[number], number>;
    for (const actor of actors) for (const key of keys) if (actor.provenance[key] === 'default') counts[key] += 1;
    return { total: actors.length, counts };
  }, [plan]);

  if (!plan.playable) {
    return (
      <div className="flex flex-col gap-2" data-game-blocked>
        <p className="text-13 text-danger">这一份设计跑不起来：</p>
        <ul className="flex flex-col gap-1">
          {plan.blockers.map((line) => (
            <li key={line} className="text-12 text-fg-2" data-game-blocker>
              · {line}
            </li>
          ))}
        </ul>
        <p className="text-11 text-fg-3">补齐之后回到这一页就会重新编译——这里没有"先给你个演示关卡"的兜底。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-game-root data-game-view={view}>
      <div className="flex flex-wrap items-center gap-3 text-12" data-game-hud>
        <span data-game-status={hud.status}>
          {hud.status === 'playing' ? '进行中' : hud.status === 'won' ? '通关' : '失败'}
        </span>
        <span data-game-health={Math.max(0, hud.health)}>生命 {Math.max(0, hud.health)}</span>
        <span data-game-time={(Math.round(hud.t * 10) / 10).toFixed(1)}>
          {Math.round(hud.t * 10) / 10} 秒
        </span>
        <span data-game-enemies={hud.enemies.filter((e) => e.active).length}>
          敌人 {hud.enemies.filter((e) => e.active).length}/{hud.enemies.length}
        </span>
        <span data-game-items={hud.counters.pickups}>物品 {hud.counters.pickups}/{hud.items.length}</span>
        {view === 'exploration' ? (
          <span data-game-discovered={revealed.current.size}>
            发现 {revealed.current.size}/{discoverableIds(plan).length}
          </span>
        ) : null}
        {view === 'puzzle' ? (
          <span data-game-activated={Object.keys(hud.activated).length}>
            机关 {Object.keys(hud.activated).length}/{hud.triggers.length}
          </span>
        ) : null}
        <span data-game-summary>{simSummary(hud)}</span>
        <button type="button" onClick={restart} className="rounded bg-bg-2 px-2 py-1 text-11" data-game-restart>
          重新开始
        </button>
      </div>

      {hud.outcome ? (
        <p className="text-12 text-fg-2" data-game-outcome>
          {hud.outcome}
        </p>
      ) : null}

      <p className="text-11 text-fg-3" data-game-controls>
        移动：WASD / 方向键 · 攻击：空格（够得着才打得到；触及 {plan.player?.reach ?? 0}px 是
        {plan.player?.reachIsDesign ? '武器 range 里写的' : '投影按贴身算的'}）
        {view === '3d' ? ' · 按住拖动转视角（WASD 跟着视角走，和 2D 的屏幕方向同一套语义）' : ''}
        {view === 'exploration'
          ? ` · 走近才看得见：视野半径 ${EXPLORATION_REVEAL_RADIUS}px，看见过的会一直在`
          : ''}
        {view === 'puzzle' ? ' · 走进机关范围即激活（首次记账）；黄线是它引用的东西，没连线的机关踩了没有东西响应' : ''}
      </p>

      {view === '3d' ? (
        <GameCanvas3D plan={plan} keys={keys} stateRef={stateRef} onHud={setHud} />
      ) : (
        <canvas
          ref={canvas}
          width={ARENA.width}
          height={ARENA.height}
          className="w-full rounded border border-[var(--nexus-color-border-subtle)]"
          data-game-canvas
        />
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <h3 className="text-12 font-semibold text-fg-1">任务（{plan.quests.length}）</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {plan.quests.map((quest) => {
              const doneAt = hud.questDone[quest.id];
              return (
                <li key={quest.id} className="text-11 text-fg-2" data-game-quest={quest.judgeable ? 'judgeable' : 'unjudgeable'}>
                  <span data-game-quest-state={doneAt === undefined ? 'todo' : 'done'}>
                    {doneAt === undefined ? '○' : '●'}
                  </span>{' '}
                  {quest.name}：
                  {quest.judgeable
                    ? quest.goals.map((goal) => goal.label).join('、') +
                      (quest.timeLimit !== null ? ` · 限时 ${quest.timeLimit}（按秒解释）` : '')
                    : `判不出完成条件 —— ${quest.why}`}
                </li>
              );
            })}
            {plan.quests.length === 0 ? <li className="text-11 text-fg-3">这份设计里没有任务实体。</li> : null}
          </ul>
        </div>
        <div>
          <h3 className="text-12 font-semibold text-fg-1">最近发生</h3>
          <ul className="mt-1 flex max-h-[9rem] flex-col gap-[2px] overflow-auto">
            {hud.events.slice(-8).reverse().map((event, index) => (
              <li key={`${event.t}-${index}`} className="text-11 text-fg-3" data-game-event>
                {event.t.toFixed(1)}s · {event.text}
              </li>
            ))}
            {hud.events.length === 0 ? <li className="text-11 text-fg-3">还没有事情发生。</li> : null}
          </ul>
        </div>
      </section>

      {/* §53：不靠人玩也能问出"这版能不能通、按这些走法会不会一进场就死" */}
      <section className="rounded border border-[var(--nexus-color-border-subtle)] p-3">
        <div className="flex items-center gap-3">
          <h3 className="text-12 font-semibold text-fg-1">自动跑一遍（Playtest）</h3>
          <button
            type="button"
            onClick={() => setReport(playtest(plan))}
            className="rounded bg-bg-2 px-2 py-1 text-11"
            data-playtest-run
          >
            跑四种走法
          </button>
        </div>
        {report ? (
          <>
            <table className="mt-2 w-full text-11">
              <thead className="text-left text-fg-3">
                <tr>
                  <th>走法</th>
                  <th>结果</th>
                  <th>秒数</th>
                  <th>承伤 / 输出</th>
                  <th>拾取</th>
                  <th>任务</th>
                </tr>
              </thead>
              <tbody>
                {report.runs.map((run) => (
                  <tr key={run.policy} data-playtest-run-row={run.policy}>
                    <td>{run.label}</td>
                    <td data-playtest-status={run.status}>
                      {run.timedOut ? '跑到时间上限' : run.status === 'won' ? '通关' : '倒下'}
                    </td>
                    <td>{run.seconds}</td>
                    <td>
                      {run.damageTaken} / {run.damageDealt}
                    </td>
                    <td>{run.pickups}</td>
                    <td>{run.questsDone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-2 flex flex-col gap-1">
              {report.findings.map((line) => (
                <li key={line} className="text-11 text-fg-2" data-playtest-finding>
                  · {line}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-11 text-fg-3" data-playtest-limits>
              {report.limits.join(' ')}
            </p>
          </>
        ) : (
          <p className="mt-1 text-11 text-fg-3">还没跑。这一步不需要人操作，也不需要模型或 provider。</p>
        )}
      </section>

      <section className="rounded bg-bg-1 p-3">
        <h3 className="text-12 font-semibold text-fg-1">这份"可玩"是从哪些数算出来的</h3>
        <p className="mt-1 text-11 text-fg-3" data-game-provenance>
          {fallbackStats.counts.health} 个实体的生命、{fallbackStats.counts.damage} 个的伤害、
          {fallbackStats.counts.speed} 个的速度、{fallbackStats.counts.senseRadius} 个的察觉/交互半径
          是投影兜底的（作者没填，默认值 {PLAY_DEFAULTS.health} / {PLAY_DEFAULTS.damage} / {PLAY_DEFAULTS.speed} /{' '}
          {PLAY_DEFAULTS.senseRadius}）；场上共 {fallbackStats.total} 个可显示个体。
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {[
            ...plan.notes,
            ...(view === 'isometric' ? ISO_VIEW_NOTES : []),
            ...(view === 'exploration' ? EXPLORATION_VIEW_NOTES : []),
            ...(view === 'puzzle' ? PUZZLE_VIEW_NOTES : []),
            ...SIM_RULE_NOTES,
          ].map((note) => (
            <li key={note} className="text-11 text-fg-3" data-game-note>
              · {note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
