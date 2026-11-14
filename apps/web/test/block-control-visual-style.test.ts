import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-82 `BlockControl.tsx` `.bc-` 门面化——§132 自助治理——**静态那一寸**。
 * 两个动作摆明面（屏蔽≠禁言；拉黑=互关闭+解除关注）——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `3825924d5d5949b2c0eb952e4fb0dd5ea1b55a5cb77a4775ea14fa12a47adfb3` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/u/[handle]/BlockControl.tsx');
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

const start = findOutsideComments(globals, /\.bc-root \{/);
if (start < 0) throw new Error('.bc- 段缺失');
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

describe('§FE-82 /u/[handle] BlockControl 自助治理', () => {
  it("'use client' 保留 + csrfHeaders/router 进门；POST/DELETE /api/blocks 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('useRouter()');
    expect(code).toContain('/api/blocks');
    expect(code).toContain("router.refresh()");
  });

  it('数据钩子守恒：data-block-control/state/set/clear/note/notice', () => {
    for (const hook of ['data-block-control', 'data-block-state=', 'data-block-set=', 'data-block-clear', 'data-block-note', 'data-block-notice']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .bc-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(8);
    for (const cls of literals) expect(cls).toMatch(/^bc-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind（含 flex-col/items-end/rounded/max-w-[/text-1x/disabled:opacity/text-right）', () => {
    for (const re of ['flex-col', 'items-end', 'items-center', 'rounded ', 'max-w-[', 'text-1', 'bg-bg-', 'text-fg-', 'text-danger-ink', 'disabled:opacity-', 'text-right']) {
      expect(code, `BlockControl 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bbc-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(6);
    const defined = new Set([...globals.matchAll(/\.(bc-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.bc- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(300);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.bc- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：3825924d5d5949b2c0eb952e4fb0dd5ea1b55a5cb77a4775ea14fa12a47adfb3）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '3825924d5d5949b2c0eb952e4fb0dd5ea1b55a5cb77a4775ea14fa12a47adfb3',
    );
  });
});
