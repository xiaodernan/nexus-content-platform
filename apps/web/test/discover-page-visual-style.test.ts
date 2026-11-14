import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-77 `discover/page.tsx` 原子清零——叠加于既有 `.dv-*` 门面——**静态那一寸**。
 * §61：Trending 按天互动序列真的能排，但算法参数与候选集上限必须连同 `result.method` 显示——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `92d8e28ecb311ddc4a7ecff7a7014f3215f2832273ac776ead3c0b43ea7530ae` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/discover/page.tsx');
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

const start = findOutsideComments(globals, /\.dv-root \{/);
if (start < 0) throw new Error('.dv-root 段缺失');
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

describe('§FE-77 /discover 发现页原子清零', () => {
  it('读真实作品：discoverCached / currentUserOrNull 进门；method/unavailable 如实显示', () => {
    expect(code).toContain('discoverCached(');
    expect(code).toContain('currentUserOrNull(');
    expect(code).toContain('data-discover-method');
    expect(code).toContain('data-discover-unavailable');
  });

  it('数据钩子守恒：data-discover-* 全套', () => {
    for (const hook of ['data-discover-root', 'data-discover-title', 'data-discover-tabs', 'data-discover-tab=', 'data-search-link', 'data-discover-empty', 'data-discover-grid', 'data-discover-card=', 'data-discover-name', 'data-discover-counts', 'data-discover-score=', 'data-discover-hidden=', 'data-discover-gap=']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .dv-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(27);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^dv-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 mx-auto/max-w-[/px-6/text-11/ml-1/space-y-1）', () => {
    for (const re of ['mx-auto', 'max-w-[', 'max-w-md', 'px-6', 'py-10', 'gap-[', 'text-11', 'text-12', 'text-fg-', 'text-accent-2-ink', 'ml-1', 'mt-2', 'space-y-1', 'flex-col', 'w-full']) {
      expect(code, `discover 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bdv-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(16);
    const defined = new Set([...globals.matchAll(/\.(dv-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.dv-root 追加段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(300);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.dv-root 追加段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：92d8e28ecb311ddc4a7ecff7a7014f3215f2832273ac776ead3c0b43ea7530ae）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '92d8e28ecb311ddc4a7ecff7a7014f3215f2832273ac776ead3c0b43ea7530ae',
    );
  });
});
