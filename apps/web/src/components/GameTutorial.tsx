'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * §G2-TUT 游戏内教学卡「怎么玩」——双语、可折，往游戏里塞。
 *
 * 用户要求：「游戏要有充分游玩教程，告诉用户怎么玩」——这不是写在文档里的那种，而是
 * 玩家进到游戏画布上**直接点开就能看见**的那一种。
 *
 * - 面板只讲「这一局是怎么回事」：移动/攻击/经验/成长/输赢都是什么；
 * - 不承诺任何百分比、不替任何一步结局担保结局（§159）——这一局怎么走，走了才知道；
 * - 折叠态就是一枚小按钮，常驻不抢位置，点了才展开；语言 follow 页面 cookie（locale prop 从 RSC 下传）；
 * - 纯静态账本：不发请求、不接模型、不报指标——与 Studio 帮助抽屉同政策。
 */
const COPY: Record<Locale, { toggle: string; title: string; steps: string[]; note: string; collapse: string }> = {
  zh: {
    toggle: '怎么玩 · 说明',
    title: '怎么玩 —— 这一局是怎么回事',
    steps: [
      '移动：WASD 或方向键；攻击：空格（或攻击键）。打倒敌人 +经验。',
      'RPG 成长线：经验攒够 → 升级（等级）→ 生命与伤害提高；任务可交也能发经验。',
      '目标：先把所有敌人解决掉才能通关；你的生命归零（失败）不丢东西——回 Studio 改完再来，总是新局。',
      '游戏里的一切数值（敌人血量、伤害、经验、升级阈值、场地大小）都来自你的游戏设计文档——改完再回到这里，玩到的就是新的一局。',
      '输了不掉经验、赢了不记跨周目档案：每一局结算都是独立的（§159：不发虚荣、不编云存档）。',
    ],
    note: '先按「跑四种走法」看一眼这份设计的数值（会打印每种策略的结果），再按「重新开始」开局——不废解锁条、不肝。',
    collapse: '收起',
  },
  en: {
    toggle: 'How to play',
    title: 'How to play — what this run actually is',
    steps: [
      'Move: WASD or arrow keys; attack: Space (or your attack key). Defeating an enemy yields XP.',
      'The RPG growth loop: XP adds up → level up → health and damage rise; quests also grant XP when turned in.',
      'Goal: beat every enemy to win. If your health reaches zero, nothing is lost — go tweak the design and come back; it is always a new run.',
      'Every number in the game (enemy HP, damage, XP, level thresholds, arena size) comes from your own design document — change it, reload, and this run reflects it.',
      'No failed run costs XP, and winning keeps no cross-run save: every run is settled independently (§159 — no vanity, no fake cloud save).',
    ],
    note: 'Peek at “Run all four policies” first to see how this design scores on each strategy, then press “Restart” to open a fresh run — no unlock bar, no grind.',
    collapse: 'Collapse',
  },
};

export function GameTutorial({ locale = 'zh' }: { locale?: Locale }) {
  const [open, setOpen] = useState(false);
  const c = COPY[locale];
  return (
    <div className="g2-tutBox" data-game-tutorial data-game-tutorial-box>
      <button
        type="button"
        className="g2-tutToggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="game-tutorial-panel"
        data-game-tutorial-toggle
      >
        {open ? `${c.collapse} ↑` : `${c.toggle} ↓`}
      </button>
      {open ? (
        <div className="g2-tutPanel" role="dialog" aria-label={c.title} id="game-tutorial-panel" data-game-tutorial-panel>
          <h3 className="g2-tutTitle" data-game-tutorial-title>{c.title}</h3>
          <ol className="g2-tutSteps" data-game-tutorial-steps>
            {c.steps.map((step, index) => (
              <li key={index} className="g2-tutStep" data-game-tutorial-step={index}>
                {step}
              </li>
            ))}
          </ol>
          <p className="g2-tutNote" data-game-tutorial-note>{c.note}</p>
        </div>
      ) : null}
    </div>
  );
}
