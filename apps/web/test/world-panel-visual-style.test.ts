import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-48 `WorldPanel.tsx` `.wd-` 门面化（§44 World Builder）——**静态那一寸**。
 *
 * 世界文档九类摊开成可编辑表单（lore/history/geography/factions/characters/creatures/items/quests/story）；
 * 图视图（§45，WorldGraphView）读同一 store，两处不会各存一份世界。
 * AI 生成世界内容要真 provider——只做模板骨架，不塞预设世界观（§159）。
 * 本片只换皮：AI/store/ensure-project/edit 全部不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `29e46e0b125757468478062282f2f08e3cdae092b630a901e0d810635cb7fd73` 与 HEAD 字节一致。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + worldStore/ensure/edit 依赖链进门；2. 字面 className 全 `.wd-*`（含 cn 三元分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.wd-` 段成规模（≥ 45 条）；
 *  6. 零 hex；7. 字面量只在 text-13（0.8125rem）/ border-radius 3px 出现；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 transition/@media/@keyframes；11. .wd-numInput:disabled/.wd-dangerText/.wd-monoFaintEnd 守恒；
 * 12. SHA256 守恒 + 钩子守恒（data-world-panel/data-world-state/data-world-pending）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/WorldPanel.tsx');
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

/** `.wd-` 视觉段：`.wd-rootCol {` 起，到下一个 §FE 段止。 */
function wdSegment(css: string): string {
  const start = findOutsideComments(css, /\.wd-rootCol \{/);
  if (start < 0) throw new Error('globals.css 找不到 .wd- 段（.wd-rootCol {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = wdSegment(globals);

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

function wdClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.(wd-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-48 /studio WorldPanel 世界构筑面板', () => {
  it("'use client' 保留 + worldStore.ensure/edit 依赖链进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('worldStore.ensure(');
    expect(code).toContain('useWorld()');
    expect(code).toContain('edit(');
  });

  it('数据钩子守恒：data-world-panel/data-world-state/data-world-pending', () => {
    for (const hook of ['data-world-panel', 'data-world-state', 'data-world-pending']) {
      expect(code, `WorldPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .wd-*（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(28);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^wd-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'wd-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'wd-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（wd- 之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'gap-[', 'tracking-', 'w-[', 'h-[', 'text-fg-', 'bg-bg-', 'border-[', 'rounded-[']) {
      expect(code, `WorldPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bwd-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(30);
    const defined = wdClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.wd- 视觉段成规模（≥ 45 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(5200);
    expect((segment.match(/\.wd-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(50);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；字面量只出现在 text-13（0.8125rem）与 border-radius 3px', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('font-size: 0.8125rem');
    expect(segment).toContain('border-radius: 3px');
  });

  it('.wd- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(11);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.wd-numInput:disabled/.wd-dis50/.wd-dangerText 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.wd-numInput:disabled');
    expect(segment).toContain('.wd-dis50:disabled');
    expect(segment).toContain('.wd-dangerText {');
  });

  it('剥 className/cn 后全文 SHA256 守恒（2026-11-14 v721「潮汐扰模」编辑器落地时按惯例重钉：29e46e0b…）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '29e46e0b125757468478062282f2f08e3cdae092b630a901e0d810635cb7fd73',
    );
  });
});
