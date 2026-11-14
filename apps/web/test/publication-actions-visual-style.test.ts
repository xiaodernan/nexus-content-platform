import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-73 `PublicationActions.tsx` `.pu-` 门面化——§59 作品页互动——**静态那一寸**。
 * 评论过机检的回话、Remix 分叉语义、Save 收藏冻结一字不动；notice 的真话语义保留。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `23a9bb100afeb26e6bd8c43f7fabbef2655d3257ea69facefe10b2cead9b66cf` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/n/[handle]/[slug]/PublicationActions.tsx');
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

const start = findOutsideComments(globals, /\.pu-root \{/);
if (start < 0) throw new Error('.pu- 段缺失');
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

describe('§FE-73 /n/[handle]/[slug] PublicationActions 作品页互动', () => {
  it("'use client' 保留 + csrfHeaders/router 进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('useRouter()');
    expect(code).toContain('/api/published/interact');
    expect(code).toContain('/api/follow');
  });

  it('数据钩子守恒：actions-root/action-*/comment-*/hidden-comments', () => {
    for (const hook of [
      'data-actions-root',
      'data-action-like=',
      'data-action-follow=',
      'data-action-remix',
      'data-action-save=',
      'data-action-share',
      'data-action-notice',
      'data-comment-input',
      'data-comment-submit',
      'data-comment-list',
      'data-comment=',
      'data-hidden-comments=',
      'data-comment-count',
    ]) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .pu-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(15);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^pu-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 disabled:opacity-50/hover:bg-bg-2/min-w-[/text-11/border-t）', () => {
    for (const re of ['disabled:opacity-', 'hover:bg-', 'min-w-[', 'text-11', 'text-fg-', 'bg-bg-', 'bg-accent-', 'flex-wrap', 'items-center', 'border-t', 'underline']) {
      expect(code, `PublicationActions 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bpu-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(12);
    const defined = new Set([...globals.matchAll(/\.(pu-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.pu- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(800);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.pu- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：23a9bb100afeb26e6bd8c43f7fabbef2655d3257ea69facefe10b2cead9b66cf）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '23a9bb100afeb26e6bd8c43f7fabbef2655d3257ea69facefe10b2cead9b66cf',
    );
  });
});
