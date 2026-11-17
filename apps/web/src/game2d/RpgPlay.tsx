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
import { gameEventText, gameOutcomeText } from './eventText';
import { fmt } from './format';
import { isControlTarget, isEditableTarget } from '@/lib/keyboard';
import { GameTutorial } from '@/components/GameTutorial';
import type { Locale } from '@/lib/i18n';

/** 双语：HUD / 控件 / 报告的每行文案按 locale 选一份（中文模式全中文，英文模式全英文，不夹杂） */
const RPG_TXT = {
  zh: {
    blockedTitle: '这一份设计跑不起来：',
    blockedBody: 'blocker 来自底层关卡计划——RPG 不另立一套，补齐之后回来就会重新编译。',
    statusPlaying: '进行中',
    statusWon: '通关',
    statusLost: '失败',
    levelLabel: '等级 ',
    xpLabel: '经验 ',
    healthLabel: '生命 ',
    damageLabel: '伤害 ',
    levelBonusEcho: '（含 {n} 次升级加成，曲线来自投影）',
    enemiesLabel: '敌人 ',
    restart: '重新开始',
    controlsNote: '移动：WASD / 方向键 · 攻击：空格——战斗手感与 2D 关卡完全相同（同一个 step）；RPG 加的只有成长：打倒敌人与完成任务发经验，攒够升级涨生命与伤害。',
    xpAndQuestsTitle: '经验与任务',
    enemyDefeatXp: '{name}：打倒 +{xp} 经验',
    xpFromDesign: '作者写的 xpReward',
    xpFallback: '投影兜底——作者没写 xpReward，这不是设计的数',
    questDoneXp: '完成 +{xp} 经验',
    questNoXp: '完成不发经验（没写 xpReward，投影不替设计补）',
    levelGate: ' · 要 {n} 级才能交（等级门）',
    unjudgeableTail: ' · 判不出完成条件',
    noContent: '没有敌人也没有任务：经验没有来源，成长循环转不起来。',
    recentTitle: '最近发生',
    noEvents: '还没有事情发生。',
    playtestTitle: '自动跑一遍（Playtest）',
    playtestRun: '跑四种走法',
    seedLabel: '随机种子',
    seedTitle: '只有「定种子随机游走」那一条用它：换种子=换一次抽样，规则与数值一个字都不动',
    thPolicy: '走法',
    thResult: '结果',
    thSeconds: '秒数',
    thDamage: '承伤 / 输出',
    thQuests: '任务',
    thLevelXp: '等级 / 经验',
    thGate: '过了等级门',
    timedOut: '跑到时间上限',
    runFell: '倒下',
    maxLevelEcho: '这几种走法到达过的最高等级：{n}',
    notRunYet: '还没跑。这一步不需要人操作，也不需要模型或 provider——成长语义（经验、升级、等级门）会参与判定。',
    provenanceTitle: '这份"成长"是从哪些数算出来的',
    gatedJoin: '、',
    goalsJoin: '、',
    goalDefeat: '打倒',
    goalCollect: '拾取',
    goalActivate: '激活',
  },
  en: {
    blockedTitle: 'This design cannot run:',
    blockedBody: 'Blockers come from the underlying arena plan — the RPG keeps no separate one; fill it in and return to recompile.',
    statusPlaying: 'Playing',
    statusWon: 'Cleared',
    statusLost: 'Fell',
    levelLabel: 'Level ',
    xpLabel: 'XP ',
    healthLabel: 'HP ',
    damageLabel: 'Damage ',
    levelBonusEcho: '(includes {n} level-ups worth of projected curve)',
    enemiesLabel: 'Enemies ',
    restart: 'Restart',
    controlsNote: 'Move: WASD / arrow keys · Attack: Space — combat feel is identical to the 2D arena (the same step); the RPG only adds growth: defeating enemies and completing quests awards XP, and XP levels raise health and damage.',
    xpAndQuestsTitle: 'XP & quests',
    enemyDefeatXp: '{name}: defeat +{xp} XP',
    xpFromDesign: 'written by the author (xpReward)',
    xpFallback: 'projection default — the author never wrote xpReward; this is not a designed number',
    questDoneXp: 'Completion +{xp} XP',
    questNoXp: 'Completion awards nothing (no xpReward written; the projection will not invent one)',
    levelGate: ' · needs level {n} to turn in (level gate)',
    unjudgeableTail: ' · no judgeable completion condition',
    noContent: 'No enemies and no quests: XP has no source; the growth loop cannot turn.',
    recentTitle: 'Recent events',
    noEvents: 'Nothing has happened yet.',
    playtestTitle: 'Auto-run (Playtest)',
    playtestRun: 'Run all four walks',
    seedLabel: 'Random seed',
    seedTitle: 'Only the seeded random-walk run uses it: a new seed is a new sample; the rules and numbers do not move a character',
    thPolicy: 'Walk',
    thResult: 'Result',
    thSeconds: 'Seconds',
    thDamage: 'Dmg taken / dealt',
    thQuests: 'Quests',
    thLevelXp: 'Level / XP',
    thGate: 'Cleared the level gate',
    timedOut: 'Reached the time limit',
    runFell: 'Fell',
    maxLevelEcho: 'Highest level reached across these walks: {n}',
    notRunYet: 'Not run yet. This step needs no person, no model, no provider — the growth semantics (XP, level-ups, level gates) participate in the verdict.',
    provenanceTitle: 'Where the numbers in this "growth" come from',
    gatedJoin: ', ',
    goalsJoin: ', ',
    goalDefeat: 'Defeat',
    goalCollect: 'Collect',
    goalActivate: 'Activate',
  },
} as const satisfies Record<Locale, Record<string, string>>;

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
  const T = RPG_TXT[locale];
  const en = locale === 'en';
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
        <p className="g2-blockedTitle">{T.blockedTitle}</p>
        <ul className="g2-col1">
          {plan.blockers.map((line) => (
            <li key={line} className="g2-blocker" data-rpg-blocker>
              · {line}
            </li>
          ))}
        </ul>
        <p className="g2-note">{T.blockedBody}</p>
      </div>
    );
  }

  const damageNow = plan.base.player ? plan.base.player.damage + plan.levelBonus.damage * hud.levelUps : 0;
  const questMeta = new Map(plan.quests.map((quest) => [quest.id, quest]));

  return (
    <div className="g2-col3" data-rpg-root>
      <div className="g2-hud" data-rpg-hud>
        <span data-rpg-status={hud.base.status}>
          {hud.base.status === 'playing' ? T.statusPlaying : hud.base.status === 'won' ? T.statusWon : T.statusLost}
        </span>
        <span data-rpg-level={hud.level}>{T.levelLabel}{hud.level}</span>
        <span data-rpg-xp={hud.xp}>
          {T.xpLabel}{hud.xp}/{xpToNext(plan, hud.level)}
        </span>
        <span data-rpg-health={Math.max(0, hud.base.health)}>{T.healthLabel}{Math.max(0, hud.base.health)}</span>
        <span data-rpg-damage={damageNow}>
          {T.damageLabel}{damageNow}
          {hud.levelUps ? ` ${fmt(T.levelBonusEcho, { n: hud.levelUps })}` : ''}
        </span>
        <span data-rpg-enemies={hud.base.enemies.filter((e) => e.active).length}>
          {T.enemiesLabel}{hud.base.enemies.filter((e) => e.active).length}/{hud.base.enemies.length}
        </span>
        <span data-rpg-summary>{rpgSummary(plan, hud, locale)}</span>
        <button type="button" onClick={restart} className="g2-smallBtn" data-rpg-restart>
          {T.restart}
        </button>
      </div>

      <GameTutorial locale={locale} />

      {gameOutcomeText(hud.base, locale) ? (
        <p className="g2-blocker" data-rpg-outcome>
          {gameOutcomeText(hud.base, locale)}
        </p>
      ) : null}

      <p className="g2-note" data-rpg-controls>
        {T.controlsNote}
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
          <h3 className="g2-h3">{T.xpAndQuestsTitle}</h3>
          <ul className="g2-mt1col">
            {plan.enemyXp.map((enemy) => (
              <li key={enemy.id} className="g2-hint2" data-rpg-enemy-xp={enemy.from}>
                {fmt(T.enemyDefeatXp, { name: enemy.name, xp: enemy.xp })}
                {en ? ` (${enemy.from === 'design' ? T.xpFromDesign : T.xpFallback})` : `（${enemy.from === 'design' ? T.xpFromDesign : T.xpFallback}）`}
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
                  {quest.name}{en ? ': ' : '：'}
                  {meta?.hasXpReward ? fmt(T.questDoneXp, { xp: meta.xpReward }) : T.questNoXp}
                  {meta && meta.requiredLevel > 1 ? fmt(T.levelGate, { n: meta.requiredLevel }) : ''}
                  {quest.judgeable
                    ? ` · ${quest.goals
                        .map((goal) => {
                          const verb =
                            goal.kind === 'defeat' ? T.goalDefeat : goal.kind === 'collect' ? T.goalCollect : T.goalActivate;
                          return `${verb} ${goal.targetName}`;
                        })
                        .join(T.goalsJoin)}`
                    : T.unjudgeableTail}
                </li>
              );
            })}
            {plan.enemyXp.length === 0 && plan.base.quests.length === 0 ? (
              <li className="g2-note">{T.noContent}</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h3 className="g2-h3">{T.recentTitle}</h3>
          <ul className="g2-eventList">
            {hud.base.events.slice(-8).reverse().map((event, index) => (
              <li key={`${event.t}-${index}`} className="g2-note" data-rpg-event>
                {event.t.toFixed(1)}s · {gameEventText(event, locale)}
              </li>
            ))}
            {hud.base.events.length === 0 ? <li className="g2-note">{T.noEvents}</li> : null}
          </ul>
        </div>
      </section>

      {/* §53：RPG 这边跑的仍是四种走法，但推进用 rpgStep——报告里的等级/经验与门是成长语义算的 */}
      <section className="g2-well">
        <div className="g2-wellRow">
          <h3 className="g2-h3">{T.playtestTitle}</h3>
          <button
            type="button"
            onClick={() => setReport(playtestRpg(plan, PLAYTEST_POLICIES, seed, locale))}
            className="g2-smallBtn"
            data-playtest-run
          >
            {T.playtestRun}
          </button>
          <label className="g2-seedLabel">
            {T.seedLabel}
            <input
              type="number"
              value={Number.isFinite(seed) ? seed : ''}
              // 清空 = 「没有明示种子」，不是 0：`Number('')` 是 0，而 0 是一个真的种子
              onChange={(event) => setSeed(event.target.value === '' ? Number.NaN : Number(event.target.value))}
              className="g2-seedInput"
              data-playtest-seed
              title={T.seedTitle}
            />
          </label>
        </div>
        {report ? (
          <>
            <table className="g2-tableWrap">
              <thead className="g2-theadRow">
                <tr>
                  <th>{T.thPolicy}</th>
                  <th>{T.thResult}</th>
                  <th>{T.thSeconds}</th>
                  <th>{T.thDamage}</th>
                  <th>{T.thQuests}</th>
                  <th>{T.thLevelXp}</th>
                  <th>{T.thGate}</th>
                </tr>
              </thead>
              <tbody>
                {report.runs.map((run) => (
                  <tr key={run.policy} data-playtest-run-row={run.policy}>
                    <td>{run.label}</td>
                    <td data-playtest-status={run.status}>
                      {run.timedOut ? T.timedOut : run.status === 'won' ? T.statusWon : T.runFell}
                    </td>
                    <td>{run.seconds}</td>
                    <td>
                      {run.damageTaken} / {run.damageDealt}
                    </td>
                    <td>{run.questsDone}</td>
                    <td data-playtest-level={run.level}>
                      {run.level} / {run.xp}
                    </td>
                    <td data-playtest-gated={run.gatedPassed.join(T.gatedJoin) || 'none'}>
                      {run.gatedPassed.length ? run.gatedPassed.join(T.gatedJoin) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="g2-mt1Note" data-playtest-max-level={report.maxLevel}>
              {fmt(T.maxLevelEcho, { n: report.maxLevel })}
            </p>
            <p className="g2-mt1Note" data-playtest-seed-used={report.seed}>
              {playtestSeedNote(report.seed, locale)}
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
          <p className="g2-mt1Note">{T.notRunYet}</p>
        )}
      </section>

      <section className="g2-provenanceBlock">
        <h3 className="g2-h3">{T.provenanceTitle}</h3>
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
