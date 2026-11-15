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
  rpgSummaryEn,
  xpToNext,
  type RpgPlan,
  type RpgPlaytestReport,
  type RpgState,
  type SimInput,
} from '@nexus/game-model';
import { KEY_MAP, drawTopdown } from './GamePlay';
import { isControlTarget, isEditableTarget } from '@/lib/keyboard';
import type { Locale } from '@/lib/i18n';

/** 双语 COPY（2026-11-15：公开试玩面）——两语组件各自只选一套；model 产出的文本（notes/findings/runs/outcome）原文显示。 */
const COPY: Record<Locale, {
  blocked: string;
  blockersNote: string;
  status: Record<'playing' | 'won' | 'lost', string>;
  level: (n: number) => string;
  xp: (n: number, next: number) => string;
  health: (n: number) => string;
  damage: (n: number) => string;
  damageUp: (n: number) => string;
  enemies: (a: number, b: number) => string;
  restart: string;
  controlsNote: string;
  xpAndQuests: string;
  enemyXp: (xp: number, from: 'design' | 'default') => string;
  questXp: (xp: number) => string;
  questNoXp: string;
  questLevelGate: (n: number) => string;
  judgeUnknown: string;
  emptyXpLoop: string;
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
  thQuests: string;
  thLevelXp: string;
  thGated: string;
  timedOut: string;
  statusWon: string;
  statusLost: string;
  maxLevelReached: (n: number) => string;
  notRunYet: string;
  provenanceHead: string;
}> = {
  zh: {
    blocked: '这一份设计跑不起来：',
    blockersNote: 'blocker 来自底层关卡计划——RPG 不另立一套，补齐之后回来就会重新编译。',
    status: { playing: '进行中', won: '通关', lost: '失败' },
    level: (n) => `等级 ${n}`,
    xp: (n, next) => `经验 ${n}/${next}`,
    health: (n) => `生命 ${n}`,
    damage: (n) => `伤害 ${n}`,
    damageUp: (n) => `（含 ${n} 次升级加成，曲线来自投影）`,
    enemies: (a, b) => `敌人 ${a}/${b}`,
    restart: '重新开始',
    controlsNote:
      '移动：WASD / 方向键 · 攻击：空格——战斗手感与 2D 关卡完全相同（同一个 step）；RPG 加的只有成长：打倒敌人与完成任务发经验，攒够升级涨生命与伤害。',
    xpAndQuests: '经验与任务',
    enemyXp: (xp, from) => `打倒 +${xp} 经验（${from === 'design' ? '作者写的 xpReward' : '投影兜底——作者没写 xpReward，这不是设计的数'}）`,
    questXp: (xp) => `完成 +${xp} 经验`,
    questNoXp: '完成不发经验（没写 xpReward，投影不替设计补）',
    questLevelGate: (n) => `要 ${n} 级才能交（等级门）`,
    judgeUnknown: '判不出完成条件',
    emptyXpLoop: '没有敌人也没有任务：经验没有来源，成长循环转不起来。',
    recent: '最近发生',
    nothingYet: '还没有事情发生。',
    playtestRun: '自动跑一遍（Playtest）',
    playtestButton: '跑四种走法',
    seedLabel: '随机种子',
    seedTitle: '只有「定种子随机游走」那一条用它：换种子=换一次抽样，规则与数值一个字都不动',
    thPolicy: '走法',
    thResult: '结果',
    thTime: '秒数',
    thTakenDealt: '承伤 / 输出',
    thQuests: '任务',
    thLevelXp: '等级 / 经验',
    thGated: '过了等级门',
    timedOut: '跑到时间上限',
    statusWon: '通关',
    statusLost: '倒下',
    maxLevelReached: (n) => `这几种走法到达过的最高等级：${n}`,
    notRunYet: '还没跑。这一步不需要人操作，也不需要模型或 provider——成长语义（经验、升级、等级门）会参与判定。',
    provenanceHead: '这份"成长"是从哪些数算出来的',
  },
  en: {
    blocked: 'This design cannot run:',
    blockersNote: 'blockers come from the underlying arena plan — RPG does not maintain its own; fill them in and it recompiles.',
    status: { playing: 'Playing', won: 'Won', lost: 'Lost' },
    level: (n) => `Level ${n}`,
    xp: (n, next) => `XP ${n}/${next}`,
    health: (n) => `HP ${n}`,
    damage: (n) => `Damage ${n}`,
    damageUp: (n) => ` (+${n} level-up bonus, curve from projection)`,
    enemies: (a, b) => `Enemies ${a}/${b}`,
    restart: 'Restart',
    controlsNote:
      'Move: WASD / arrows · Attack: Space — fighting feels exactly like the 2D level (same step); the RPG layer only adds growth: defeats and quests grant XP, and levelling raises HP and damage.',
    xpAndQuests: 'XP & quests',
    enemyXp: (xp, from) => `defeat +${xp} XP (${from === 'design' ? 'authored xpReward' : 'projection default — no xpReward written, not a designed number'})`,
    questXp: (xp) => `complete +${xp} XP`,
    questNoXp: 'no XP for completion (no xpReward written; the projection does not patch designs)',
    questLevelGate: (n) => `requires level ${n} to be accepted (level gate)`,
    judgeUnknown: 'completion condition cannot be judged',
    emptyXpLoop: 'No enemies and no quests: XP has no source, the growth loop cannot spin.',
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
    thQuests: 'Quests',
    thLevelXp: 'Level / XP',
    thGated: 'Level gate',
    timedOut: 'Time cap reached',
    statusWon: 'Won',
    statusLost: 'Down',
    maxLevelReached: (n) => `Highest level reached by these policies: ${n}`,
    notRunYet: 'Not run yet. No human taps, no model, no provider — growth semantics (XP, levelling, level gates) take part in judging.',
    provenanceHead: 'Which numbers “growth” is computed from',
  },
};

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
export function RpgPlay({ plan, onComplete, locale = 'zh' }: { plan: RpgPlan; onComplete?: () => void; locale?: Locale }) {
  const c = COPY[locale];
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
      <div className="g2-col" data-rpg-blocked>
        <p className="g2-blockedTitle">{c.blocked}</p>
        <ul className="g2-col1">
          {plan.blockers.map((line) => (
            <li key={line} className="g2-blocker" data-rpg-blocker>
              · {line}
            </li>
          ))}
        </ul>
        <p className="g2-note">{c.blockersNote}</p>
      </div>
    );
  }

  const damageNow = plan.base.player ? plan.base.player.damage + plan.levelBonus.damage * hud.levelUps : 0;
  const questMeta = new Map(plan.quests.map((quest) => [quest.id, quest]));

  return (
    <div className="g2-col3" data-rpg-root>
      <div className="g2-hud" data-rpg-hud>
        <span data-rpg-status={hud.base.status}>
          {hud.base.status === 'playing' ? c.status.playing : hud.base.status === 'won' ? c.status.won : c.status.lost}
        </span>
        <span data-rpg-level={hud.level}>{c.level(hud.level)}</span>
        <span data-rpg-xp={hud.xp}>
          {c.xp(hud.xp, xpToNext(plan, hud.level))}
        </span>
        <span data-rpg-health={Math.max(0, hud.base.health)}>{c.health(Math.max(0, hud.base.health))}</span>
        <span data-rpg-damage={damageNow}>
          {c.damage(damageNow)}
          {hud.levelUps ? c.damageUp(hud.levelUps) : ''}
        </span>
        <span data-rpg-enemies={hud.base.enemies.filter((e) => e.active).length}>
          {c.enemies(hud.base.enemies.filter((e) => e.active).length, hud.base.enemies.length)}
        </span>
        <span data-rpg-summary>{locale === 'en' ? rpgSummaryEn(plan, hud) : rpgSummary(plan, hud)}</span>
        <button type="button" onClick={restart} className="g2-smallBtn" data-rpg-restart>
          {c.restart}
        </button>
      </div>

      {hud.base.outcome ? (
        <p className="g2-blocker" data-rpg-outcome>
          {hud.base.outcome}
        </p>
      ) : null}

      <p className="g2-note" data-rpg-controls>
        {c.controlsNote}
      </p>

      <canvas
        ref={canvas}
        width={ARENA.width}
        height={ARENA.height}
        className="g2-canvas"
        data-rpg-canvas
      />

      <section className="g2-twoCol">
        <div>
          <h3 className="g2-h3">{c.xpAndQuests}</h3>
          <ul className="g2-mt1col">
            {plan.enemyXp.map((enemy) => (
              <li key={enemy.id} className="g2-hint2" data-rpg-enemy-xp={enemy.from}>
                {enemy.name}{locale === 'zh' ? '：' : ': '}{c.enemyXp(enemy.xp, enemy.from === 'design' ? 'design' : 'default')}
              </li>
            ))}
            {plan.base.quests.map((quest) => {
              const meta = questMeta.get(quest.id);
              const doneAt = hud.base.questDone[quest.id];
              return (
                <li key={quest.id} className="g2-hint2" data-rpg-quest={quest.id}>
                  <span data-rpg-quest-state={doneAt === undefined ? 'todo' : 'done'}>
                    {doneAt === undefined ? '○' : '●'}
                  </span>{' '}
                  {quest.name}{locale === 'zh' ? '：' : ': '}
                  {meta?.hasXpReward ? c.questXp(meta.xpReward) : c.questNoXp}
                  {meta && meta.requiredLevel > 1 ? ` · ${c.questLevelGate(meta.requiredLevel)}` : ''}
                  {quest.judgeable ? ` · ${quest.goals.map((goal) => (locale === 'en' ? goal.labelEn : goal.label)).join(locale === 'zh' ? '、' : ', ')}` : ` · ${c.judgeUnknown}`}
                </li>
              );
            })}
            {plan.enemyXp.length === 0 && plan.base.quests.length === 0 ? (
              <li className="g2-note">{c.emptyXpLoop}</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h3 className="g2-h3">{c.recent}</h3>
          <ul className="g2-eventList">
            {hud.base.events.slice(-8).reverse().map((event, index) => (
              <li key={`${event.t}-${index}`} className="g2-note" data-rpg-event>
                {event.t.toFixed(1)}s · {event.text}
              </li>
            ))}
            {hud.base.events.length === 0 ? <li className="g2-note">{c.nothingYet}</li> : null}
          </ul>
        </div>
      </section>

      {/* §53：RPG 这边跑的仍是四种走法，但推进用 rpgStep——报告里的等级/经验与门是成长语义算的 */}
      <section className="g2-well">
        <div className="g2-wellRow">
          <h3 className="g2-h3">{c.playtestRun}</h3>
          <button
            type="button"
            onClick={() => setReport(playtestRpg(plan, PLAYTEST_POLICIES, seed))}
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
                  <th>{c.thQuests}</th>
                  <th>{c.thLevelXp}</th>
                  <th>{c.thGated}</th>
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
            <p className="g2-mt1Note" data-playtest-max-level={report.maxLevel}>
              {c.maxLevelReached(report.maxLevel)}
            </p>
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
        <ul className="g2-mt1col">
          {plan.notes.map((note) => (
            <li key={note} className="g2-note" data-rpg-note>
              · {note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
