import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-90 `NewProjectForm.tsx` `.npf-` 门面化——§2 新建项目——**静态那一寸**。
 * 只有名称与类型；不生成任何"看起来像 AI 结果"的内容（§159）——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `1c2c07cd09fa38b3abd03d6b60d6d7d4e1f8c3460e3a50fe3a15902c2674cdfd` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/NewProjectForm.tsx');
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

const start = findOutsideComments(globals, /\.npf-root \{/);
if (start < 0) throw new Error('.npf- 段缺失');
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

describe('§FE-90 /components NewProjectForm 新建项目', () => {
  it("'use client' 保留 + csrfHeaders/router 进门；POST /api/projects 守恒；无可疑 AI 生成端点", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('/api/projects');
    expect(code).not.toContain('generate');
  });

  it('数据钩子守恒：data-project-name-input / data-project-kind-select / data-create-project', () => {
    for (const hook of ['data-project-name-input', 'data-project-kind-select', 'data-create-project']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .npf-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(5);
    for (const cls of literals) expect(cls).toMatch(/^npf-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind（含 min-w-[/flex-1/bg-bg-2/bg-brand/w-full/text-1x/disabled:opacity）', () => {
    for (const re of ['min-w-[', 'flex-1', 'bg-bg-2', 'bg-brand', 'text-fg-', 'text-[', 'text-1', 'w-full', 'disabled:opacity-', 'placeholder:', 'font-medium', 'flex-wrap']) {
      expect(code, `NewProjectForm 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bnpf-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(5);
    const defined = new Set([...globals.matchAll(/\.(npf-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.npf- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(300);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.npf- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：1c2c07cd09fa38b3abd03d6b60d6d7d4e1f8c3460e3a50fe3a15902c2674cdfd）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '1c2c07cd09fa38b3abd03d6b60d6d7d4e1f8c3460e3a50fe3a15902c2674cdfd',
    );
  });
});
