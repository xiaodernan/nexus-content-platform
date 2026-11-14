import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-78 `search/page.tsx` 原子清零——叠加于既有 `.se-*` 门面——**静态那一寸**。
 * §165：搜索范围与可见性全由 `domain/search.ts` 决定；界面不另立说法——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `d4760ec6437393e36a4cf3207ce9a152c705dd03101734f7cf5295ddf8357302` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/search/page.tsx');
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

const start = findOutsideComments(globals, /\.se-pageRoot \{/);
if (start < 0) throw new Error('.se-pageRoot 段缺失');
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

describe('§FE-78 /search 全平台搜索原子清零', () => {
  it('服务端搜索：searchPlatform/SEARCH_NOT_COVERED/SEARCH_ORDER_METHOD 进门；GET 表单语义经 SearchBox', () => {
    expect(code).toContain('searchPlatform(');
    expect(code).toContain('SEARCH_NOT_COVERED');
    expect(code).toContain('SEARCH_ORDER_METHOD');
    expect(code).toContain('<SearchBox');
  });

  it('数据钩子守恒：data-search-* 全套', () => {
    for (const hook of ['data-search-root', 'data-search-suggest-note', 'data-search-results', 'data-search-method', 'data-search-group=', 'data-search-capped', 'data-search-hit=', 'data-search-hit-title', 'data-search-scope', 'data-search-too-short', 'data-search-empty']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .se-*（无裸原子）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(20);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^se-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 mx-auto/min-h-screen/max-w-[/-mt-3/text-11/grid/gap-2）', () => {
    for (const re of ['mx-auto', 'min-h-screen', 'max-w-[', '-mt-3', 'text-11', 'gap-6', 'gap-2', 'flex-col', 'px-6', 'py-10', 'grid ']) {
      expect(code, `search page 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义（.se-root 那一坑已绕过）', () => {
    const used = new Set([...code.matchAll(/\bse-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(16);
    expect(used.has('se-root')).toBe(false);
    const defined = new Set([...globals.matchAll(/\.(se-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('§FE-78 视觉追加段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(200);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('§FE-78 视觉追加段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：d4760ec6437393e36a4cf3207ce9a152c705dd03101734f7cf5295ddf8357302）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'd4760ec6437393e36a4cf3207ce9a152c705dd03101734f7cf5295ddf8357302',
    );
  });
});
