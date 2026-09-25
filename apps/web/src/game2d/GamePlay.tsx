'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARENA,
  PLAY_DEFAULTS,
  SIM_RULE_NOTES,
  initialState,
  simSummary,
  step,
  type GamePlan,
  type PlayActor,
  type SimActor,
  type SimInput,
  type SimState,
} from '@nexus/game-model';

/**
 * §50 的可玩投影：把 `compileGame` 排出来的关卡计划交给 `step` 跑，画在 2D 画布上。
 *
 * 三条边界（都同时显示在界面上，不只写在注释里）：
 * - 规则不在这里。移动、追击、伤害、任务判定全在 `@nexus/game-model/sim`，
 *   所以"浏览器里玩到的"和"单测断言的"是同一套算术；这里只负责输入、绘制与 HUD。
 * - 形状只用来区分类别（圆=玩家、方=敌人、菱=物品、三角=NPC），**不是美术**。
 *   §34 的 3D 模型与 §43 的动画在这里都没有，页面上就这么写。
 * - 作者没填的数值一律走兜底，并且把"有几个实体是兜底跑起来的"写在脸上：
 *   让人以为"敌人伤害 1 是设计的"就是假数据（§159）。
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

const COLORS: Record<string, string> = {
  player: '#7dd3fc',
  enemy: '#f59e0b',
  item: '#a3e635',
  npc: '#c4b5fd',
};

function draw(ctx: CanvasRenderingContext2D, plan: GamePlan, state: SimState): void {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);

  for (const trigger of plan.triggers) {
    const sim = state.triggers.find((t) => t.id === trigger.id);
    ctx.beginPath();
    ctx.arc(trigger.x, trigger.y, trigger.radius, 0, Math.PI * 2);
    ctx.strokeStyle = sim && sim.readyAt > state.t ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)';
    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const dots: { actor: PlayActor; sim: SimActor | undefined }[] = [
    ...plan.items.map((item) => ({ actor: item, sim: state.items.find((s) => s.id === item.id) })),
    ...plan.enemies.map((enemy) => ({ actor: enemy, sim: state.enemies.find((s) => s.id === enemy.id) })),
    ...plan.npcs.map((npc) => ({ actor: npc, sim: undefined })),
  ];
  for (const { actor, sim } of dots) {
    if (sim && !sim.active) continue; // 被打倒/已拾取的不画：画着就是"场上还有"的谎
    const x = sim?.x ?? actor.x;
    const y = sim?.y ?? actor.y;
    ctx.fillStyle = COLORS[actor.kind] ?? '#e5e7eb';
    ctx.beginPath();
    const r = actor.radius;
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

  if (state.health > 0) {
    const r = plan.player?.radius ?? 16;
    ctx.fillStyle = COLORS.player ?? '#7dd3fc';
    ctx.beginPath();
    ctx.arc(state.px, state.py, r, 0, Math.PI * 2);
    ctx.fill();
    const reach = (plan.player?.radius ?? 0) + (plan.player?.reach ?? 0);
    if (reach > r) {
      ctx.strokeStyle = 'rgba(125,211,252,0.35)';
      ctx.beginPath();
      ctx.arc(state.px, state.py, reach, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

export function GamePlay({ plan }: { plan: GamePlan }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const stateRef = useRef<SimState>(initialState(plan));
  const lastFrame = useRef<number>(0);
  const [hud, setHud] = useState<SimState>(() => stateRef.current);

  const restart = useCallback(() => {
    stateRef.current = initialState(plan);
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
      const ctx = canvas.current?.getContext('2d') ?? null;
      if (ctx) draw(ctx, plan, stateRef.current);
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
  }, [plan]);

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
    <div className="flex flex-col gap-3" data-game-root>
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
      </p>

      <canvas
        ref={canvas}
        width={ARENA.width}
        height={ARENA.height}
        className="w-full rounded border border-[var(--nexus-color-border-subtle)]"
        data-game-canvas
      />

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

      <section className="rounded bg-bg-1 p-3">
        <h3 className="text-12 font-semibold text-fg-1">这份"可玩"是从哪些数算出来的</h3>
        <p className="mt-1 text-11 text-fg-3" data-game-provenance>
          {fallbackStats.counts.health} 个实体的生命、{fallbackStats.counts.damage} 个的伤害、
          {fallbackStats.counts.speed} 个的速度、{fallbackStats.counts.senseRadius} 个的察觉/交互半径
          是投影兜底的（作者没填，默认值 {PLAY_DEFAULTS.health} / {PLAY_DEFAULTS.damage} / {PLAY_DEFAULTS.speed} /{' '}
          {PLAY_DEFAULTS.senseRadius}）；场上共 {fallbackStats.total} 个可显示个体。
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {[...plan.notes, ...SIM_RULE_NOTES].map((note) => (
            <li key={note} className="text-11 text-fg-3" data-game-note>
              · {note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
