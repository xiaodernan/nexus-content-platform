import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-71 `app/layout.tsx` `.rx-` 门面化——根布局——**静态那一寸**。
 * ThemeScript（同步内联、先于首屏读取 theme）、metadata、viewport 全部一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `368e57a553c733f940737e533b66a353c50ae58a4deb6fb7b31c3108ff633205` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/layout.tsx');
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

const start = findOutsideComments(globals, /\.rx-body \{/);
if (start < 0) throw new Error('.rx- 段缺失');
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

describe('§FE-71 /app/layout 根布局', () => {
  it('ThemeScript 同步内联进 body；metadata/viewport 进门', () => {
    expect(code).toContain('<ThemeScript />');
    expect(code).toContain('data-nexus-theme="dark"');
    expect(code).toContain('<ThemeToggle />');
    expect(main).toContain('export const viewport');
  });

  it('字面 className 只认 .rx-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals).toEqual(['rx-body']);
  });

  it('零裸 Tailwind（含 antialiased/min-h-screen/bg-bg-0/text-fg-1）', () => {
    for (const re of ['min-h-screen', 'bg-bg-', 'text-fg-', 'antialiased', 'flex', 'grid']) {
      expect(code, `layout 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('.rx- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment).toContain('.rx-body {');
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.rx- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：368e57a553c733f940737e533b66a353c50ae58a4deb6fb7b31c3108ff633205）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '368e57a553c733f940737e533b66a353c50ae58a4deb6fb7b31c3108ff633205',
    );
  });
});
