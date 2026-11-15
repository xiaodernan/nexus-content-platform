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
  PLAYTEST_DEFAULT_SEED,
  PLAYTEST_POLICIES,
  playtestSeedNote,
  puzzleLinks,
  revealedNow,
  simSummary,
  simSummaryEn,
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
import { PLAY_PROVENANCE_FALLBACK_TEXT, PLAY_PROVENANCE_FALLBACK_TEXT_EN, PLAY_PROVENANCE_LABELS, PLAY_PROVENANCE_LABELS_EN, PLAY_PROVENANCE_SLOTS, type PlayProvenanceSlot } from '@nexus/game-model';
import type { Locale } from '@/lib/i18n';

/** 双语 COPY（2026-11-15：公开试玩面）——两语组件各自只选一套；model 产出的 HUD/events/notes 原文显示。 */
const COPY: Record<Locale, {
  blocked: string;
  blockedNote: string;
  status: Record<'playing' | 'won' | 'lost', string>;
  health: (n: number) => string;
  seconds: (n: number) => string;
  enemies: (a: number, b: number) => string;
  items: (a: number, b: number) => string;
  discovered: (a: number, b: number) => string;
  machines: (a: number, b: number) => string;
  restart: string;
  controlsReach: (n: number, design: boolean) => string;
  view3d: string;
  explorerRadius: (n: number) => string;
  puzzleNote: string;
  questsHead: (n: number) => string;
  questLimit: (n: number) => string;
  judgeUnknown: (why: string) => string;
  emptyQuests: string;
  recent: string;
  nothingYet: string;
  playtestRun: string;
  playtestButton: string;
  seedLabel: string;
  seedTitle: string;
  thPolicy: string;
  thResult: string;
  thTime: string;
  thTakenDealt: string;
  thPickups: string;
  thQuests: string;
  timedOut: string;
  statusWon: string;
  statusLost: string;
  notRunYet: string;
  provenanceHead: string;
  provenanceLine: (total: number) => string;
}> = {
  zh: {
    blocked: '这一份设计跑不起来：',
    blockedNote: '补齐之后回到这一页就会重新编译——这里没有"先给你个演示关卡"的兜底。',
    status: { playing: '进行中', won: '通关', lost: '失败' },
    health: (n) => `生命 ${n}`,
    seconds: (n) => `${n} 秒`,
    enemies: (a, b) => `敌人 ${a}/${b}`,
    items: (a, b) => `物品 ${a}/${b}`,
    discovered: (a, b) => `发现 ${a}/${b}`,
    machines: (a, b) => `机关 ${a}/${b}`,
    restart: '重新开始',
    controlsReach: (n: number, design: boolean) => `移动：WASD / 方向键 · 攻击：空格（够得着才打得到；触及 ${n}px 是${design ? '武器 range 里写的' : '投影按贴身算的'}）`,
    view3d: ' · 按住拖动转视角（WASD 跟着视角走，和 2D 的屏幕方向同一套语义）',
    explorerRadius: (n) => ` · 走近才看得见：视野半径 ${n}px，看见过的会一直在`,
    puzzleNote: ' · 走进机关范围即激活（首次记账）；黄线是它引用的东西，没连线的机关踩了没有东西响应',
    questsHead: (n) => `任务（${n}）`,
    questLimit: (n) => ` · 限时 ${n}（按秒解释）`,
    judgeUnknown: (why) => `判不出完成条件 —— ${why}`,
    emptyQuests: '{c.emptyQuests}',
    recent: '最近发生',
    nothingYet: '{c.nothingYet}',
    playtestRun: '自动跑一遍（Playtest）',
    playtestButton: '跑四种走法',
    seedLabel: '随机种子',
    seedTitle: '只有「定种子随机游走」那一条用它：换种子=换一次抽样，规则与数值一个字都不动',
    thPolicy: '走法',
    thResult: '结果',
    thTime: '秒数',
    thTakenDealt: '承伤 / 输出',
    thPickups: '拾取',
    thQuests: '任务',
    timedOut: '跑到时间上限',
    statusWon: '通关',
    statusLost: '倒下',
    notRunYet: '还没跑。这一步不需要人操作，也不需要模型或 provider。',
    provenanceHead: '这份"可玩"是从哪些数算出来的',
    provenanceLine: (total) => `场上共 ${total} 个可显示个体，其中`,
  },
  en: {
    blocked: 'This design cannot run:',
    blockedNote: 'Fill these in and come back — it recompiles; there is no “let me give you a demo level first” fallback.',
    status: { playing: 'Playing', won: 'Won', lost: 'Lost' },
    health: (n) => `HP ${n}`,
    seconds: (n) => `${n}s`,
    enemies: (a, b) => `Enemies ${a}/${b}`,
    items: (a, b) => `Items ${a}/${b}`,
    discovered: (a, b) => `Discovered ${a}/${b}`,
    machines: (a, b) => `Triggers ${a}/${b}`,
    restart: 'Restart',
    controlsReach: (n: number, design: boolean) => `Move: WASD / arrows · Attack: Space (hits only in reach; reach ${n}px, from ${design ? 'the authored weapon range' : 'the projection’s point-blank'})`,
    view3d: ' · hold and drag to fly the camera (WASD follows the camera, same semantics as screen-space 2D)',
    explorerRadius: (n) => ` · seeing is only up close: radius ${n}px, once seen stays seen`,
    puzzleNote: ' · triggers arm on entry (first touch only); yellow lines are what they reference; a trigger with no links does nothing',
    questsHead: (n) => `Quests (${n})`,
    questLimit: (n) => ` · time limit ${n} (seconds)`,
    judgeUnknown: (why) => `cannot judge completion —— ${why}`,
    emptyQuests: 'No quest entities in this design.',
    recent: 'What just happened',
    nothingYet: 'Nothing has happened yet.',
    playtestRun: 'Run a check (Playtest)',
    playtestButton: 'Run four policies',
    seedLabel: 'Random seed',
    seedTitle: 'Only the seeded random-walk policy uses it: a new seed re-draws the sampling; rules and numbers do not move a byte.',
    thPolicy: 'Policy',
    thResult: 'Result',
    thTime: 'Time',
    thTakenDealt: 'Taken / Dealt',
    thPickups: 'Pickups',
    thQuests: 'Quests',
    timedOut: 'Time cap reached',
    statusWon: 'Won',
    statusLost: 'Down',
    notRunYet: 'Not run yet. No human taps, no model, no provider.',
    provenanceHead: 'Which numbers “playable” is computed from',
    provenanceLine: (total) => `Field total: ${total} displayable entities, of which`,
  },
};
import { GameCanvas3D } from './GameCanvas3D';
import { isControlTarget, isEditableTarget } from '@/lib/keyboard';

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

export const KEY_MAP: Record<string, [number, number]> = {
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

/** 俯视画法导出给 RpgPlay（§51 最后一条管线）：战斗与这里同一个 step、同一张画法，
 * RPG 只在 HUD 上多出等级与经验——绘制函数不抄第二份（§16） */
export { drawTopdown };

export function GamePlay({
  plan,
  view = 'topdown',
  onComplete,
  locale = 'zh',
}: {
  plan: GamePlan;
  view?: GameView;
  /** §168：通关的那一声（公开可玩页用它上报"玩到了结局"；作者自己的工作稿不传） */
  onComplete?: () => void;
  locale?: Locale;
}) {
  const c = COPY[locale];
  const PROV_LABELS = locale === 'en' ? PLAY_PROVENANCE_LABELS_EN : PLAY_PROVENANCE_LABELS;
  const PROV_FALLBACK = locale === 'en' ? PLAY_PROVENANCE_FALLBACK_TEXT_EN : PLAY_PROVENANCE_FALLBACK_TEXT;
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
  // 随机游走那条走法的抽样起点。界面上显示的永远是 `report.seed`（这次真跑了的那个），不是这个控件里的数
  const [seed, setSeed] = useState<number>(PLAYTEST_DEFAULT_SEED);

  const restart = useCallback(() => {
    stateRef.current = initialState(plan);
    revealed.current.clear();
    setHud(stateRef.current);
  }, [plan]);

  // §168：通关的那一声**只报一次**。重开一局又通关了也不报第二次——
  // 计数是"通关过多少人"（服务端按 key 去重），客户端重复报只是白跑一趟。
  const completed = useRef(false);
  useEffect(() => {
    if (!onComplete || completed.current) return;
    if (hud.status !== 'won') return;
    completed.current = true;
    onComplete();
  }, [hud.status, onComplete]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      // §90 / WCAG 2.1.1：这里只是"玩法输入"，不许把浏览器本来就有的键吞掉。
      // 焦点在输入控件（随机种子那个 number input）里时一个字都不接——那里 ↑ 是数字 +1、`w` 是字符；
      // 焦点在按钮/链接上时 Space 是**原生激活键**：`[data-playtest-run]` 按 Space 必须能跑出报告，
      // `[data-game-restart]` 按 Space 必须能重开。判据只有一份（`@/lib/keyboard`）。
      // 其余玩法键照旧：点完按钮接着用 WASD / 方向键走路，这条没变。
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === ' ' && isControlTarget(event.target)) return;
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
    // 槽位清单来自投影自己（PLAY_PROVENANCE_SLOTS）：那边加一个兜底旋钮，这里不加代码就编译不过，
    // 而不是像以前那样写死四键——写死的那四键会让新旋钮静默地不被披露。
    const counts = Object.fromEntries(PLAY_PROVENANCE_SLOTS.map((slot) => [slot, 0])) as Record<PlayProvenanceSlot, number>;
    for (const actor of actors) for (const slot of PLAY_PROVENANCE_SLOTS) if (actor.provenance[slot] === 'default') counts[slot] += 1;
    return { total: actors.length, counts };
  }, [plan]);

  if (!plan.playable) {
    return (
      <div className="g2-col" data-game-blocked>
        <p className="g2-blockedTitle">{c.blocked}</p>
        <ul className="g2-col1">
          {plan.blockers.map((line) => (
            <li key={line} className="g2-blocker" data-game-blocker>
              · {line}
            </li>
          ))}
        </ul>
        <p className="g2-note">{c.blockedNote}</p>
      </div>
    );
  }

  return (
    <div className="g2-col3" data-game-root data-game-view={view}>
      <div className="g2-hud" data-game-hud>
        <span data-game-status={hud.status}>
          {hud.status === 'playing' ? c.status.playing : hud.status === 'won' ? c.status.won : c.status.lost}
        </span>
        <span data-game-health={Math.max(0, hud.health)}>{c.health(Math.max(0, hud.health))}</span>
        <span data-game-time={(Math.round(hud.t * 10) / 10).toFixed(1)}>
          {c.seconds(Math.round(hud.t * 10) / 10)}
        </span>
        <span data-game-enemies={hud.enemies.filter((e) => e.active).length}>
          {c.enemies(hud.enemies.filter((e) => e.active).length, hud.enemies.length)}
        </span>
        <span data-game-items={hud.counters.pickups}>{c.items(hud.counters.pickups, hud.items.length)}</span>
        {view === 'exploration' ? (
          <span data-game-discovered={revealed.current.size}>
            {c.discovered(revealed.current.size, discoverableIds(plan).length)}
          </span>
        ) : null}
        {view === 'puzzle' ? (
          <span data-game-activated={Object.keys(hud.activated).length}>
            {c.machines(Object.keys(hud.activated).length, hud.triggers.length)}
          </span>
        ) : null}
        <span data-game-summary>{locale === 'en' ? simSummaryEn(hud) : simSummary(hud)}</span>
        <button type="button" onClick={restart} className="g2-smallBtn" data-game-restart>
          {c.restart}
        </button>
      </div>

      {hud.outcome ? (
        <p className="g2-blocker" data-game-outcome>
          {hud.outcome}
        </p>
      ) : null}

      <p className="g2-note" data-game-controls>
        {c.controlsReach(plan.player?.reach ?? 0, plan.player?.reachIsDesign === true)}
        {view === '3d' ? c.view3d : ''}
        {view === 'exploration'
          ? c.explorerRadius(EXPLORATION_REVEAL_RADIUS)
          : ''}
        {view === 'puzzle' ? c.puzzleNote : ''}
      </p>

      {view === '3d' ? (
        <GameCanvas3D plan={plan} keys={keys} stateRef={stateRef} onHud={setHud} />
      ) : (
        <canvas
          ref={canvas}
          width={ARENA.width}
          height={ARENA.height}
          className="g2-canvas"
          data-game-canvas
        />
      )}

      <section className="g2-twoCol">
        <div>
          <h3 className="g2-h3">{c.questsHead(plan.quests.length)}</h3>
          <ul className="g2-mt1col">
            {plan.quests.map((quest) => {
              const doneAt = hud.questDone[quest.id];
              return (
                <li key={quest.id} className="g2-hint2" data-game-quest={quest.judgeable ? 'judgeable' : 'unjudgeable'}>
                  <span data-game-quest-state={doneAt === undefined ? 'todo' : 'done'}>
                    {doneAt === undefined ? '○' : '●'}
                  </span>{' '}
                  {quest.name}{locale === 'zh' ? '：' : ': '}
                  {quest.judgeable
                    ? quest.goals.map((goal) => (locale === 'en' ? goal.labelEn : goal.label)).join(locale === 'zh' ? '、' : ', ') +
                      (quest.timeLimit !== null ? c.questLimit(quest.timeLimit) : '')
                    : c.judgeUnknown(locale === 'en' ? quest.whyEn : quest.why)}
                </li>
              );
            })}
            {plan.quests.length === 0 ? <li className="g2-note">{c.emptyQuests}</li> : null}
          </ul>
        </div>
        <div>
          <h3 className="g2-h3">{c.recent}</h3>
          <ul className="g2-eventList">
            {hud.events.slice(-8).reverse().map((event, index) => (
              <li key={`${event.t}-${index}`} className="g2-note" data-game-event>
                {event.t.toFixed(1)}s · {event.text}
              </li>
            ))}
            {hud.events.length === 0 ? <li className="g2-note">{c.nothingYet}</li> : null}
          </ul>
        </div>
      </section>

      {/* §53：不靠人玩也能问出"这版能不能通、按这些走法会不会一进场就死" */}
      <section className="g2-well">
        <div className="g2-wellRow">
          <h3 className="g2-h3">{c.playtestRun}</h3>
          <button
            type="button"
            onClick={() => setReport(playtest(plan, PLAYTEST_POLICIES, seed))}
            className="g2-smallBtn"
            data-playtest-run
          >
            {c.playtestButton}
          </button>
          <label className="g2-seedLabel">
            {c.seedLabel}
            <input
              type="number"
              value={Number.isFinite(seed) ? seed : ''}
              // 清空 = 「没有明示种子」，不是 0：`Number('')` 是 0，而 0 是一个真的种子
              onChange={(event) => setSeed(event.target.value === '' ? Number.NaN : Number(event.target.value))}
              className="g2-seedInput"
              data-playtest-seed
              title={c.seedTitle}
            />
          </label>
        </div>
        {report ? (
          <>
            <table className="g2-tableWrap">
              <thead className="g2-theadRow">
                <tr>
                  <th>{c.thPolicy}</th>
                  <th>{c.thResult}</th>
                  <th>{c.thTime}</th>
                  <th>{c.thTakenDealt}</th>
                  <th>{c.thPickups}</th>
                  <th>{c.thQuests}</th>
                </tr>
              </thead>
              <tbody>
                {report.runs.map((run) => (
                  <tr key={run.policy} data-playtest-run-row={run.policy}>
                    <td>{run.label}</td>
                    <td data-playtest-status={run.status}>
                      {run.timedOut ? c.timedOut : run.status === 'won' ? c.statusWon : c.statusLost}
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
            <p className="g2-mt1Note" data-playtest-seed-used={report.seed}>
              {playtestSeedNote(report.seed)}
            </p>
            <ul className="g2-mt2col">
              {report.findings.map((line) => (
                <li key={line} className="g2-hint2" data-playtest-finding>
                  · {line}
                </li>
              ))}
            </ul>
            <p className="g2-mt2Note" data-playtest-limits>
              {report.limits.join(' ')}
            </p>
          </>
        ) : (
          <p className="g2-mt1Note">{c.notRunYet}</p>
        )}
      </section>

      <section className="g2-provenanceBlock">
        <h3 className="g2-h3">{c.provenanceHead}</h3>
        <p className="g2-mt1Note" data-game-provenance>
          {c.provenanceLine(fallbackStats.total)}
          {PLAY_PROVENANCE_SLOTS.map((slot) =>
            locale === 'zh'
              ? ` ${fallbackStats.counts[slot]} 个的${PROV_LABELS[slot]}（兜底 ${PROV_FALLBACK[slot]}）`
              : ` ${fallbackStats.counts[slot]} default ${PROV_LABELS[slot]} (${PROV_FALLBACK[slot]})`,
          ).join(locale === 'zh' ? '、' : ', ')}
          {locale === 'zh' ? ' 用的是投影兜底值（作者没填），不是设计的数。' : ' run on projection defaults (unfilled by the author), not designed values.'}
        </p>
        <ul className="g2-mt2col">
          {[
            ...plan.notes,
            ...(view === 'isometric' ? ISO_VIEW_NOTES : []),
            ...(view === 'exploration' ? EXPLORATION_VIEW_NOTES : []),
            ...(view === 'puzzle' ? PUZZLE_VIEW_NOTES : []),
            ...SIM_RULE_NOTES,
          ].map((note) => (
            <li key={note} className="g2-note" data-game-note>
              · {note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
