'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ARENA,
  initialRpgState,
  playtestRpg,
  PLAYTEST_DEFAULT_SEED,
  PLAYTEST_POLICIES,
  playtestSeedNote,
  rpgStep,
  rpgSummary,
  xpToNext,
  type RpgPlan,
  type RpgPlaytestReport,
  type RpgState,
  type SimInput,
} from '@nexus/game-model';
import { KEY_MAP, drawTopdown } from './GamePlay';
import { isControlTarget, isEditableTarget } from '@/lib/keyboard';

/**
 * §51 最后一条管线的界面：RPG 原型 = 同一场战斗 + 成长读数。
 *
 * - 战斗画在同一张画布上（`drawTopdown` 直接复用，形状/兜底标记一个字不差），
 *   规则走 `rpgStep`——移动、追击、伤害与 2D 是同一套算术，这里不重写。
 * - 成长读数（等级、经验、下一级要多少）在 HUD 上；曲线来自投影这件事，
 *   `plan.notes` 里的 `RPG_RULE_NOTES` 已经说了，页面原样列出。
 * - 经验来源逐个标 provenance（design = 作者写的 xpReward / default = 投影兜底）：
 *   让人以为"每击 10 经验是设计的"就是假数据（§159）。
 */
export function RpgPlay({ plan, onComplete }: { plan: RpgPlan; onComplete?: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const stateRef = useRef<RpgState>(initialRpgState(plan));
  const lastFrame = useRef<number>(0);
  const [hud, setHud] = useState<RpgState>(() => stateRef.current);
  // §53：与 2D 同一个"跑四种走法"，但跑的是 rpgStep——经验、等级门参与判定（报告里的等级列就是它）
  const [report, setReport] = useState<RpgPlaytestReport | null>(null);
  // 随机游走那条走法的抽样起点。界面上显示的永远是 `report.seed`（这次真跑了的那个），不是这个控件里的数
  const [seed, setSeed] = useState<number>(PLAYTEST_DEFAULT_SEED);

  const restart = useCallback(() => {
    stateRef.current = initialRpgState(plan);
    setHud(stateRef.current);
  }, [plan]);

  // §168：通关的那一声**只报一次**（与 2D 同一口径：计数是"通关过多少人"）
  const completed = useRef(false);
  useEffect(() => {
    if (!onComplete || completed.current) return;
    if (hud.base.status !== 'won') return;
    completed.current = true;
    onComplete();
  }, [hud.base.status, onComplete]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      // §90 / WCAG 2.1.1：与 2D 那张同一处修复（判据在 `@/lib/keyboard`，不在这里抄第二份）。
      // 焦点在输入控件里时不接；焦点在按钮/链接上时 Space 归原生激活（`[data-playtest-run]`、
      // `[data-rpg-restart]` 都要能被键盘按下去）。WASD / 方向键照旧。
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
      stateRef.current = rpgStep(plan, stateRef.current, input, dt);
      const ctx = canvas.current?.getContext('2d') ?? null;
      if (ctx) drawTopdown(ctx, plan.base, stateRef.current.base);
      // HUD 每 100ms 同步一次：60fps 的 React 重渲染只会把主线程吃光，读数不需要那么新
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

  if (!plan.playable) {
    return (
      <div className="flex flex-col gap-2" data-rpg-blocked>
        <p className="text-13 text-danger-ink">这一份设计跑不起来：</p>
        <ul className="flex flex-col gap-1">
          {plan.blockers.map((line) => (
            <li key={line} className="text-12 text-fg-2" data-rpg-blocker>
              · {line}
            </li>
          ))}
        </ul>
        <p className="text-11 text-fg-3">blocker 来自底层关卡计划——RPG 不另立一套，补齐之后回来就会重新编译。</p>
      </div>
    );
  }

  const damageNow = plan.base.player ? plan.base.player.damage + plan.levelBonus.damage * hud.levelUps : 0;
  const questMeta = new Map(plan.quests.map((quest) => [quest.id, quest]));

  return (
    <div className="flex flex-col gap-3" data-rpg-root>
      <div className="flex flex-wrap items-center gap-3 text-12" data-rpg-hud>
        <span data-rpg-status={hud.base.status}>
          {hud.base.status === 'playing' ? '进行中' : hud.base.status === 'won' ? '通关' : '失败'}
        </span>
        <span data-rpg-level={hud.level}>等级 {hud.level}</span>
        <span data-rpg-xp={hud.xp}>
          经验 {hud.xp}/{xpToNext(plan, hud.level)}
        </span>
        <span data-rpg-health={Math.max(0, hud.base.health)}>生命 {Math.max(0, hud.base.health)}</span>
        <span data-rpg-damage={damageNow}>
          伤害 {damageNow}
          {hud.levelUps ? `（含 ${hud.levelUps} 次升级加成，曲线来自投影）` : ''}
        </span>
        <span data-rpg-enemies={hud.base.enemies.filter((e) => e.active).length}>
          敌人 {hud.base.enemies.filter((e) => e.active).length}/{hud.base.enemies.length}
        </span>
        <span data-rpg-summary>{rpgSummary(plan, hud)}</span>
        <button type="button" onClick={restart} className="rounded bg-bg-2 px-2 py-1 text-11" data-rpg-restart>
          重新开始
        </button>
      </div>

      {hud.base.outcome ? (
        <p className="text-12 text-fg-2" data-rpg-outcome>
          {hud.base.outcome}
        </p>
      ) : null}

      <p className="text-11 text-fg-3" data-rpg-controls>
        移动：WASD / 方向键 · 攻击：空格——战斗手感与 2D 关卡完全相同（同一个 step）；
        RPG 加的只有成长：打倒敌人与完成任务发经验，攒够升级涨生命与伤害。
      </p>

      <canvas
        ref={canvas}
        width={ARENA.width}
        height={ARENA.height}
        className="w-full rounded border border-[var(--nexus-color-border-subtle)]"
        data-rpg-canvas
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <h3 className="text-12 font-semibold text-fg-1">经验与任务</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {plan.enemyXp.map((enemy) => (
              <li key={enemy.id} className="text-11 text-fg-2" data-rpg-enemy-xp={enemy.from}>
                {enemy.name}：打倒 +{enemy.xp} 经验
                （{enemy.from === 'design' ? '作者写的 xpReward' : '投影兜底——作者没写 xpReward，这不是设计的数'}）
              </li>
            ))}
            {plan.base.quests.map((quest) => {
              const meta = questMeta.get(quest.id);
              const doneAt = hud.base.questDone[quest.id];
              return (
                <li key={quest.id} className="text-11 text-fg-2" data-rpg-quest={quest.id}>
                  <span data-rpg-quest-state={doneAt === undefined ? 'todo' : 'done'}>
                    {doneAt === undefined ? '○' : '●'}
                  </span>{' '}
                  {quest.name}：
                  {meta?.hasXpReward ? `完成 +${meta.xpReward} 经验` : '完成不发经验（没写 xpReward，投影不替设计补）'}
                  {meta && meta.requiredLevel > 1 ? ` · 要 ${meta.requiredLevel} 级才能交（等级门）` : ''}
                  {quest.judgeable ? ` · ${quest.goals.map((goal) => goal.label).join('、')}` : ' · 判不出完成条件'}
                </li>
              );
            })}
            {plan.enemyXp.length === 0 && plan.base.quests.length === 0 ? (
              <li className="text-11 text-fg-3">没有敌人也没有任务：经验没有来源，成长循环转不起来。</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h3 className="text-12 font-semibold text-fg-1">最近发生</h3>
          <ul className="mt-1 flex max-h-[9rem] flex-col gap-[2px] overflow-auto">
            {hud.base.events.slice(-8).reverse().map((event, index) => (
              <li key={`${event.t}-${index}`} className="text-11 text-fg-3" data-rpg-event>
                {event.t.toFixed(1)}s · {event.text}
              </li>
            ))}
            {hud.base.events.length === 0 ? <li className="text-11 text-fg-3">还没有事情发生。</li> : null}
          </ul>
        </div>
      </section>

      {/* §53：RPG 这边跑的仍是四种走法，但推进用 rpgStep——报告里的等级/经验与门是成长语义算的 */}
      <section className="rounded border border-[var(--nexus-color-border-subtle)] p-3">
        <div className="flex items-center gap-3">
          <h3 className="text-12 font-semibold text-fg-1">自动跑一遍（Playtest）</h3>
          <button
            type="button"
            onClick={() => setReport(playtestRpg(plan, PLAYTEST_POLICIES, seed))}
            className="rounded bg-bg-2 px-2 py-1 text-11"
            data-playtest-run
          >
            跑四种走法
          </button>
          <label className="flex items-center gap-[6px] text-11 text-fg-3">
            随机种子
            <input
              type="number"
              value={Number.isFinite(seed) ? seed : ''}
              // 清空 = 「没有明示种子」，不是 0：`Number('')` 是 0，而 0 是一个真的种子
              onChange={(event) => setSeed(event.target.value === '' ? Number.NaN : Number(event.target.value))}
              className="w-[92px] rounded border border-[var(--nexus-color-border-subtle)] bg-bg-2 px-1 py-[2px] text-11"
              data-playtest-seed
              title="只有「定种子随机游走」那一条用它：换种子=换一次抽样，规则与数值一个字都不动"
            />
          </label>
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
                  <th>任务</th>
                  <th>等级 / 经验</th>
                  <th>过了等级门</th>
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
                    <td>{run.questsDone}</td>
                    <td data-playtest-level={run.level}>
                      {run.level} / {run.xp}
                    </td>
                    <td data-playtest-gated={run.gatedPassed.join('、') || 'none'}>
                      {run.gatedPassed.length ? run.gatedPassed.join('、') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-11 text-fg-3" data-playtest-max-level={report.maxLevel}>
              这几种走法到达过的最高等级：{report.maxLevel}
            </p>
            <p className="mt-1 text-11 text-fg-3" data-playtest-seed-used={report.seed}>
              {playtestSeedNote(report.seed)}
            </p>
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
          <p className="mt-1 text-11 text-fg-3">还没跑。这一步不需要人操作，也不需要模型或 provider——成长语义（经验、升级、等级门）会参与判定。</p>
        )}
      </section>

      <section className="rounded bg-bg-1 p-3">
        <h3 className="text-12 font-semibold text-fg-1">这份"成长"是从哪些数算出来的</h3>
        <ul className="mt-1 flex flex-col gap-1">
          {plan.notes.map((note) => (
            <li key={note} className="text-11 text-fg-3" data-rpg-note>
              · {note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
