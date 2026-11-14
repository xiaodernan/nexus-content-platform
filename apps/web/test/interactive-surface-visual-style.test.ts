import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-72 `InteractiveSurface.tsx` `.is-` 门面化——§167/§168 互动运行时——**静态那一寸**。
 * 几何一字不动（style 上的绝对坐标照发快照），csrfHeaders / visitorKey / sessionStorage 逻辑一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `bc99e41107e15a8352bc183612ee922d8a8a81e436d7a9f12afae83322c13bcb` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/n/[handle]/[slug]/InteractiveSurface.tsx');
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

const start = findOutsideComments(globals, /\.is-hotspot \{/);
if (start < 0) throw new Error('.is- 段缺失');
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

describe('§FE-72 /n/[handle]/[slug] InteractiveSurface 互动运行时', () => {
  it("'use client' 保留 + csrfHeaders/visitorKey 进门；sessionStorage 去重", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('visitorKey()');
    expect(code).toContain('sessionStorage');
    expect(code).toContain('/api/published/work-complete');
  });

  it('数据钩子守恒：data-interactive-hotspot/target/end/record', () => {
    for (const hook of ['data-interactive-hotspot=', 'data-interactive-target=', 'data-interactive-end', 'data-interactive-record=']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .is-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(3);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^is-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 focus-visible:ring/ring-inset/text-12/text-fg-*）', () => {
    for (const re of ['focus-visible:ring', 'hover:ring', 'focus:outline-none', 'rounded-sm', 'text-12', 'text-fg-', 'px-[', 'pt-[']) {
      expect(code, `InteractiveSurface 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bis-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(3);
    const defined = new Set([...globals.matchAll(/\.(is-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.is- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(300);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.is- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：bc99e41107e15a8352bc183612ee922d8a8a81e436d7a9f12afae83322c13bcb）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'bc99e41107e15a8352bc183612ee922d8a8a81e436d7a9f12afae83322c13bcb',
    );
  });
});
