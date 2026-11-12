import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-80 `u/[handle]/page.tsx` 原子清零——叠加于既有 `.pf-*` 门面——**静态那一寸**。
 * §60：每栏只放真公开的东西（注销 banner、首字母头像、@注销语义）——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `c2b4aaa3126029bb741835a8143351e8aa2d03b4fadba279c1741b7f1234a6ef` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/u/[handle]/page.tsx');
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

const start = findOutsideComments(globals, /\.pf-pageRoot \{/);
if (start < 0) throw new Error('.pf-pageRoot 段缺失');
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

describe('§FE-80 /u/[handle] 创作者主页原子清零', () => {
  it('profileOf / currentUserOrNull 进门；注销 banner 语义渲染守恒', () => {
    expect(code).toContain('profileOf(');
    expect(code).toContain('currentUserOrNull(');
    expect(code).toContain('data-profile-deleted-banner');
    expect(code).toContain('accountDeleted');
  });

  it('数据钩子守恒：data-profile-* 全套', () => {
    for (const hook of ['data-profile-root', 'data-profile-header', 'data-profile-avatar=', 'data-profile-name', 'data-profile-bio', 'data-profile-counts', 'data-profile-empty=', 'data-profile-works', 'data-profile-work-card', 'data-profile-work-counts', 'data-profile-worlds', 'data-profile-characters']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .pf-*（含新 pf-pageRoot）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(20);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^pf-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 mx-auto/max-w-[/px-6/py-10/gap-[）', () => {
    for (const re of ['mx-auto', 'max-w-[', 'px-6', 'py-10', 'gap-[', 'text-fg-', 'flex-col']) {
      expect(code, `profile page 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bpf-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(22);
    const defined = new Set([...globals.matchAll(/\.(pf-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('§FE-80 视觉追加段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment).toContain('.pf-pageRoot {');
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('§FE-80 视觉追加段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：c2b4aaa3126029bb741835a8143351e8aa2d03b4fadba279c1741b7f1234a6ef）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'c2b4aaa3126029bb741835a8143351e8aa2d03b4fadba279c1741b7f1234a6ef',
    );
  });
});
