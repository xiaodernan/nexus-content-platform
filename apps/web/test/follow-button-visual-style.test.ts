import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-81 `FollowButton.tsx` `.fw-` 门面化——§60 关注按钮——**静态那一寸**。
 * 状态从服务端带进来，这里只发请求并显示真实回话——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `64a5481439cc92e74eb9e82bb3b6830b3f2abf8a5edb50aae9b2d4860c2868e9` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/u/[handle]/FollowButton.tsx');
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

const start = findOutsideComments(globals, /\.fw-wrap \{/);
if (start < 0) throw new Error('.fw- 段缺失');
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

describe('§FE-81 /u/[handle] FollowButton 关注按钮', () => {
  it("'use client' 保留 + csrfHeaders 进门；POST /api/follow 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('/api/follow');
  });

  it('数据钩子守恒：data-follow-button / data-follow-error', () => {
    expect(code).toContain('data-follow-button=');
    expect(code).toContain('data-follow-error');
  });

  it('字面 className 只认 .fw-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(3);
    for (const cls of literals) expect(cls).toMatch(/^fw-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind（含 flex/items-center/rounded/px-3/text-1x/disabled:opacity）', () => {
    for (const re of ['flex ', 'items-center', 'gap-2', 'rounded ', 'px-3', 'py-1', 'text-1', 'bg-accent-', 'text-fg-', 'disabled:opacity-']) {
      expect(code, `FollowButton 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bfw-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(3);
    const defined = new Set([...globals.matchAll(/\.(fw-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.fw- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(200);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.fw- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：64a5481439cc92e74eb9e82bb3b6830b3f2abf8a5edb50aae9b2d4860c2868e9）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '64a5481439cc92e74eb9e82bb3b6830b3f2abf8a5edb50aae9b2d4860c2868e9',
    );
  });
});
