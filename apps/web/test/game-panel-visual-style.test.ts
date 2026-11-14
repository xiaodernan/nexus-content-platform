import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-49 `GamePanel.tsx` `.gp-`（+ 复用 `.wd-*`）门面化（§54 Game Design System）——**静态那一寸**。
 *
 * 11 类实体 + 每类的开放数值 + 实体之间的有向引用。
 * §52 Game Agent 今天给的是**确定性配方草稿**（`@/lib/agent-game-draft`，DEMO 规划不是模型）——本面板只提供模板骨架。
 * 本片只换皮：gameStore.ensure / edit / updateEntity / addEntity / removeEntity / linkEntities 路径一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `e7e390a6ac5dc9931d4a2481a2e1c7bfd26f9d4c45cb65f5dfb6b7632104aa73` 与 HEAD 字节一致。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + gameStore.ensure/edit 依赖链进门；2. 字面 className 全 `.wd-*`/`.gp-*`（含 cn 三元分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. 共享 `.wd-` 段 + 新增 `.gp-` 段成规模；
 *  6. 零 hex；7. 字面量只出现在 border-radius 3px（wd-ghostBtnSm 等）与 basis-28→7rem 量化；
 *  8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. 零 transition/@media/@keyframes；11. `data-game-panel/state/pending` 钩子守恒；
 * 12. SHA256 守恒。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/GamePanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(main);

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.gp-` 视觉段：`.gp-mt1 {` 起，到下一个 §FE 段止。 */
function gpSegment(css: string): string {
  const start = findOutsideComments(css, /\.gp-mt1 \{/);
  if (start < 0) throw new Error('globals.css 找不到 .gp- 段（.gp-mt1 {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = gpSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@`。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\bcn\([^)]*\)/gs, 'cn()')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:wd|gp)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-49 /studio GamePanel 游戏设计系统面板', () => {
  it("'use client' 保留 + gameStore.ensure/edit / updateEntity 依赖链进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('gameStore.ensure(');
    expect(code).toContain('useGame()');
    expect(code).toContain('edit(');
  });

  it('数据钩子守恒：data-game-panel/data-game-state/data-game-pending', () => {
    for (const hook of ['data-game-panel', 'data-game-state', 'data-game-pending']) {
      expect(code, `GamePanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .wd-* / .gp-*（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(28);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:wd|gp)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'(?:wd|gp)-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'(?:wd|gp)-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（wd-/gp- 之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'gap-[', 'tracking-', 'w-[', 'h-[', 'basis-', 'text-fg-', 'bg-bg-', 'border-[', 'rounded-[']) {
      expect(code, `GamePanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:wd|gp)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(35);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.gp- 视觉段成规模（≥ 12 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(1800);
    expect((segment.match(/\.gp-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；字面量只出现在 border-radius 3px', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('border-radius: 3px');
  });

  it('.wd-/.gp- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const wdStart = globals.indexOf('.wd-rootCol {');
    const wdEnd = globals.indexOf('/* ── §', wdStart);
    const wdSeg = wdStart >= 0 ? globals.slice(wdStart, wdEnd > wdStart ? wdEnd : globals.length) : '';
    const allSeg = wdSeg + segment;
    const used = [...new Set([...allSeg.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(11);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；共享 wd-/gp- 段无 transition/@media/@keyframes；.gp-tag/.gp-hrMt 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.gp-tag {');
    expect(segment).toContain('.gp-hrMt {');
    expect(segment).toContain('.gp-w80Input:focus {');
    expect(segment).toContain('.gp-mode72:focus {');
  });

  it("save-state 徽标 cn 三元统一映射：.wd-monoFaintEnd + error→wd-dangerText", () => {
    expect(code).toContain('data-game-panel');
    expect(code).toContain("'wd-monoFaintEnd', snapshot.saveState === 'error' && 'wd-dangerText'");
  });

  it('剥 className/cn 后全文 SHA256 守恒（2026-11-14 v735「GamePanel 双语化」重钉：e7e390a6ac5dc9931d4a2481a2e1c7bfd26f9d4c45cb65f5dfb6b7632104aa73）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'e7e390a6ac5dc9931d4a2481a2e1c7bfd26f9d4c45cb65f5dfb6b7632104aa73',
    );
  });
});
