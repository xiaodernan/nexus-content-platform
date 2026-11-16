import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §G2-TUT `GameTutorial.tsx`「怎么玩 / How to play」游戏内教学卡——静态不变式。
 *
 * 判据：
 * 1. 'use client'；零 fetch / provider / API 调用字面；
 * 2. 双语账本 zh/en 齐且同步构（五步 + note + toggle/collapse + title）；
 * 3. data-game-tutorial-* 钩子守恒（toggle/panel/title/steps/step/note/box）；
 * 4. 字面 className 只认 .g2-tut*；§G2-TUT 段定义齐；零 hex；forced-colors 收口；
 * 5. var(--nexus-*) 全在 tokens.css；
 * 6. 不引 provider、不画「假」完成率/胜率——全只写真实规则；
 * 7. 每个落点被 §FE-96/97 的刷新SHA 守门。
 */
const ROOT = process.cwd();
const COMPONENT = join(ROOT, 'apps/web/src/components/GameTutorial.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const component = readFileSync(COMPONENT, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const TUT_START = globals.indexOf('§G2-TUT');
if (TUT_START < 0) throw new Error('globals.css 里没有 §G2-TUT 段');
const tutSegment = globals.slice(TUT_START);

describe('§G2-TUT 游戏内「怎么玩」教学卡', () => {
  it('use client；零 fetch / provider 字面', () => {
    expect(component.slice(0, 40)).toContain('use client');
    expect(component).not.toContain('fetch(');
    expect(component).not.toContain('/api/');
    expect(component).not.toContain('provider');
  });

  it('双语账本齐（zh + en，五步同步）', () => {
    expect(component).toContain('zh: {');
    expect(component).toContain('en: {');
    for (const n of ['移动', '攻击', '经验', '升级', 'Move', 'attack', 'XP', 'level']) {
      expect(component, `双语字典缺 ${n}`).toContain(n);
    }
    expect((component.match(/'/g) ?? []).length).toBeGreaterThan(40);
  });

  it('data-game-tutorial-* 钩子守恒', () => {
    for (const hook of [
      'data-game-tutorial',
      'data-game-tutorial-toggle',
      'data-game-tutorial-panel',
      'data-game-tutorial-title',
      'data-game-tutorial-step=',
      'data-game-tutorial-steps',
      'data-game-tutorial-note',
    ]) {
      expect(component, `GameTutorial 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .g2-tut*；无裸 Tailwind 原子类', () => {
    const literals = [...component.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(7);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `GameTutorial 出现域外类：${tok}`).toMatch(/^g2-tut[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
    }
  });

  it('.g2-tut* 全部在 §G2-TUT 段定义；段内零 hex；forced-colors 收口', () => {
    expect(tutSegment.length).toBeGreaterThan(800);
    expect(tutSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const cls of ['.g2-tutBox', '.g2-tutToggle', '.g2-tutPanel', '.g2-tutTitle', '.g2-tutSteps', '.g2-tutStep', '.g2-tutNote']) {
      expect(tutSegment, `§G2-TUT 段没有定义 ${cls}`).toContain(cls + ' {');
    }
    expect(tutSegment).toContain('@media (forced-colors: active)');
  });

  it('§G2-TUT 段 var(--nexus-*) 全在 tokens.css 声明（零写死 hex）', () => {
    const used = [...new Set([...tutSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('账本内不承诺数值（无「100%」「最高」「完成率」之类承诺）', () => {
    expect(component).not.toMatch(/完成率|胜率|100%|全盘|无所不能/);
    expect(component).not.toMatch(/win every|unbeatable|100% clear/i);
  });
});
