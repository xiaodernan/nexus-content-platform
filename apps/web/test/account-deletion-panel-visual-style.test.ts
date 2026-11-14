import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-87 `AccountDeletionPanel.tsx` `.adp-` 门面化——§144/ADR-0025 注销入口——**静态那一寸**。
 * 清单在点开时从 `GET /api/account` 现取；注销 ≠ 删除（收据）；不强制先导出——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `c9eb10c380f18243a4ba4cdecd134037ca2547ec425cc7aa6b2c26b1aca9e714` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/AccountDeletionPanel.tsx');
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

const start = findOutsideComments(globals, /\.adp-card \{/);
if (start < 0) throw new Error('.adp- 段缺失');
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

describe('§FE-87 /components AccountDeletionPanel 注销账号', () => {
  it("'use client' 保留 + csrfHeaders/router 进门；GET/DELETE /api/account 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('useRouter()');
    expect(code).toContain("method: 'DELETE'");
    expect(code).toContain('/api/account');
  });

  it('数据钩子守恒：data-account-delete-* / data-account-deleted-*', () => {
    for (const hook of ['data-account-deleted-receipt', 'data-account-deleted-done', 'data-account-delete-open', 'data-account-delete-card', 'data-account-delete-loading', 'data-account-delete-load-error', 'data-account-delete-counts', 'data-account-private', 'data-account-published', 'data-account-sessions', 'data-account-tokens', 'data-account-export-offer', 'data-account-export-draft=', 'data-account-export-truncated', 'data-account-delete-expected', 'data-account-delete-input', 'data-account-delete-confirm', 'data-account-delete-cancel', 'data-account-delete-notice']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .adp-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(22);
    for (const cls of literals) expect(cls).toMatch(/^adp-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind（含 rounded-[/w-[/placeholder:/hover:/disabled:opacity-40/self-start）', () => {
    for (const re of ['rounded-[', 'w-[', 'placeholder:', 'hover:bg-', 'hover:text-', 'disabled:opacity-', 'self-start', 'text-1', 'text-fg-', 'text-danger-ink', 'text-accent-2-ink', 'flex-col', 'flex-wrap', 'gap-[']) {
      expect(code, `AccountDeletionPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\badp-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(15);
    const defined = new Set([...globals.matchAll(/\.(adp-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.adp- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(800);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.adp- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：c9eb10c380f18243a4ba4cdecd134037ca2547ec425cc7aa6b2c26b1aca9e714）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'c9eb10c380f18243a4ba4cdecd134037ca2547ec425cc7aa6b2c26b1aca9e714',
    );
  });
});
