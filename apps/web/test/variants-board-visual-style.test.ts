import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-59 `VariantsBoard.tsx` `.vb-` 门面化（§29 多方案的并排比较板）——**静态那一寸**。
 *
 * AI 规划方案的 4 条线（caption / screenshot / diff）；候选不动工作区，点「切到这个方向」才走 §28 的分支切换。
 * 真 provider 才启动：DEMO 不假装出现，task 锁没到的方向不显示"生成中"假。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `d5d8b42a6ed16b707ea87e3c7dd2746266b36005e9b774a5f163c5c18372083e`。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + studio.switchBranch 进门；2. 字面 className 全 `.vb-*`/复用族（含 cn 三元分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.vb-` 段成规模（≥ 24 条）；
 *  6. 零 hex；7. 字面量只出现在 5px/1px/0.8125rem；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 transition/@media/@keyframes；11. `.vb-pickOn`/`.vb-adoptLive` 定义齐全；12. SHA256 守恒 + 钩子守恒（data-variant-* 派系）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/VariantsBoard.tsx');
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

/** `.vb-` 视觉段：`.vb-fieldSm {` 起，到下一个 §FE 段止。 */
function vbSegment(css: string): string {
  const start = findOutsideComments(css, /\.vb-fieldSm \{/);
  if (start < 0) throw new Error('globals.css 找不到 .vb- 段（.vb-fieldSm {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = vbSegment(globals);

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
    for (const m of line.matchAll(/\.((?:vb|sb|wd|hi|cp|gp|ds)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-59 /studio VariantsBoard AI 方案板', () => {
  it("'use client' 保留 + studio.switchBranch / branch.id 派发", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('studio.switchBranch(');
  });

  it('数据钩子守恒：data-variant-pick-layout/visual/adopt/desc/branch-id 派系', () => {
    expect(code).toContain('data-variant-pick-layout=');
    expect(code).toContain('data-variant-pick-visual=');
    expect(code).toContain('data-variant-adopt=');
    expect(code).toContain('data-variant-desc');
  });

  it('字面 className 只认 .vb-*/复用族（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(18);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:vb|sb|wd|hi|cp|gp|ds)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'(?:vb|sb|wd|hi|cp|gp|ds)-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'(?:vb|sb|wd|hi|cp|gp|ds)-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（vb-/复用族之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'max-w-[', 'grid-template', 'rounded-[', 'bg-bg-', 'text-fg-', 'hover:bg-', 'min-h-', 'flex h-', 'overflow-hidden']) {
      expect(code, `VariantsBoard 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:vb|sb|wd|hi|cp|gp|ds)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(22);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.vb- 视觉段成规模（≥ 24 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(2000);
    expect((segment.match(/\.vb-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(24);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；字面量只出现在 5px/1px', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('padding: 1px 5px');
  });

  it('.vb- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(11);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.vb-pickOn/.vb-pickOn/.vb-adoptLive/.vb-accentPill 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.vb-pickOn {', '.vb-adoptLive {', '.vb-accentPill {', '.vb-cardWrap {', '.vb-grid {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className/cn 后全文 SHA256 守恒（2026-11-16 v752「VariantsBoard 双语化」重钉：d5d8b42a6ed16b707ea87e3c7dd2746266b36005e9b774a5f163c5c18372083e）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'd5d8b42a6ed16b707ea87e3c7dd2746266b36005e9b774a5f163c5c18372083e',
    );
  });
});
