import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-79 `SearchBox.tsx` 原子清零——叠加于既有 `.se-*` 门面——**静态那一寸**。
 * §165：建议来自真的命中（同一份可见性判定）；历史只在这台设备；无 JS 时仍是原生 GET 表单——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `dffdb64e95d503da137510dfe8bb28d0653c1b4dc71029e9455266626fee63ea` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/search/SearchBox.tsx');
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

const start = findOutsideComments(globals, /\.se-boxRoot \{/);
if (start < 0) throw new Error('.se-boxRoot 段缺失');
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

describe('§FE-79 /search SearchBox 搜索框原子清零', () => {
  it("'use client' 保留 + 建议/历史/暂停三套机制进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('/api/search/suggest');
    expect(code).toContain('readSearchHistory');
    expect(code).toContain('pauseMsFromResponse');
    expect(code).toContain('role="combobox"');
  });

  it('数据钩子守恒：data-search-* 全套', () => {
    for (const hook of ['data-search-form', 'data-search-input', 'data-search-submit', 'data-search-suggest-pause', 'data-search-suggest', 'data-search-suggestion=', 'data-search-history', 'data-search-history-item=', 'data-search-history-remove=', 'data-search-history-clear']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .se-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(12);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^se-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 truncate/text-13/text-12/text-11/hover:text-fg-1/underline）', () => {
    for (const re of ['truncate', 'text-13', 'text-12', 'text-11', 'text-fg-', 'hover:text-fg-1', 'flex-wrap', 'items-center', 'gap-2', 'flex-col']) {
      expect(code, `SearchBox 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bse-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(10);
    const defined = new Set([...globals.matchAll(/\.(se-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('§FE-79 视觉追加段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(250);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('§FE-79 视觉追加段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：dffdb64e95d503da137510dfe8bb28d0653c1b4dc71029e9455266626fee63ea）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'dffdb64e95d503da137510dfe8bb28d0653c1b4dc71029e9455266626fee63ea',
    );
  });
});
