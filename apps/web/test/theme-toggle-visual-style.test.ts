import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-85 `ThemeToggle.tsx` `.tt-` 门面化——§120 主题 FAB——**静态那一寸**。
 * `data-theme-toggle-ready`（e2e 水合屏障）一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `985713fd22f0a5761ce7a17e9f11f9e1dcabfb82f471c916e9b6fe7dc6f5e0d3` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/ThemeToggle.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const code = strip(main);

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

const start = findOutsideComments(globals, /\.tt-fab \{/);
if (start < 0) throw new Error('.tt- 段缺失');
const rest = globals.slice(start);
const segEnd = rest.search(/\/\* ── §/);
const segment = segEnd > 0 ? rest.slice(0, segEnd) : rest;

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

describe('§FE-85 /components ThemeToggle 主题 FAB', () => {
  it("'use client' 保留 + THEME_STORAGE_KEY/isTheme 进门；ready 屏障守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('THEME_STORAGE_KEY');
    expect(code).toContain('isTheme(');
    expect(code).toContain('data-theme-toggle-ready={');
    expect(code).toContain('data-theme-toggle={theme}');
  });

  it('字面 className 只认 .tt-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals).toEqual(['tt-fab']);
  });

  it('零裸 Tailwind（含 fixed/bottom-3/right-3/z-40/h-9/w-9/rounded-full/backdrop-blur/hover:text-fg-1）', () => {
    for (const re of ['fixed', 'bottom-3', 'right-3', 'z-40', 'h-9', 'w-9', 'rounded-full', 'inline-flex', 'items-center', 'justify-center', 'backdrop-blur', 'border-border-subtle', 'bg-bg-2/90', 'text-fg-', 'hover:text-', 'focus-visible:', 'shadow-sm']) {
      expect(code, `ThemeToggle 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\btt-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(1);
    const defined = new Set([...globals.matchAll(/\.(tt-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.tt- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(300);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.tt- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：985713fd22f0a5761ce7a17e9f11f9e1dcabfb82f471c916e9b6fe7dc6f5e0d3）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '985713fd22f0a5761ce7a17e9f11f9e1dcabfb82f471c916e9b6fe7dc6f5e0d3',
    );
  });
});
