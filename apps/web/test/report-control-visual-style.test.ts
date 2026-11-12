import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-74 `ReportControl.tsx` `.rc-` 门面化——§132 举报入口——**静态那一寸**。
 * 两句事实写在界面上（举报不会立刻撤下内容；访客不登录也能举报）——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `590a2c657d2e2e43e968ef9b17c2825551274d4030340e094f5cb0e346173f92` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/n/[handle]/[slug]/ReportControl.tsx');
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

const start = findOutsideComments(globals, /\.rc-root \{/);
if (start < 0) throw new Error('.rc- 段缺失');
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

describe('§FE-74 /n/[handle]/[slug] ReportControl 举报入口', () => {
  it("'use client' 保留 + csrfHeaders 进门；POST report 端点守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('/api/published/report');
  });

  it('数据钩子守恒：report-root/open/form/reason/detail/submit/error/notice', () => {
    for (const hook of ['data-report-root', 'data-report-open', 'data-report-form', 'data-report-reason', 'data-report-detail', 'data-report-submit', 'data-report-error', 'data-report-notice']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .rc-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(9);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^rc-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 hover:bg-bg-2/min-w-[/text-danger-ink/rounded-[）', () => {
    for (const re of ['hover:bg-', 'min-w-[', 'text-11', 'text-fg-', 'text-danger-ink', 'rounded-[', 'bg-bg-', 'bg-accent-', 'flex-wrap', 'border-[']) {
      expect(code, `ReportControl 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\brc-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(9);
    const defined = new Set([...globals.matchAll(/\.(rc-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.rc- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(500);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.rc- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：590a2c657d2e2e43e968ef9b17c2825551274d4030340e094f5cb0e346173f92）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '590a2c657d2e2e43e968ef9b17c2825551274d4030340e094f5cb0e346173f92',
    );
  });
});
