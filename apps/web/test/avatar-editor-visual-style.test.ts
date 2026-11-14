import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-86 `AvatarEditor.tsx` `.ae-` 门面化——§60 头像上传——**静态那一寸**。
 * "剥掉了哪些元数据段"必须显示（EXIF GPS/机型不裸奔）；摘掉回到 null 首字母，不造默认图——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `beeff3852c6d590c115c5eed71c08bf85f9a3879f743de23ff01f1a06818ae13` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/AvatarEditor.tsx');
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

const start = findOutsideComments(globals, /\.ae-root \{/);
if (start < 0) throw new Error('.ae- 段缺失');
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

describe('§FE-86 /components AvatarEditor 头像上传', () => {
  it("'use client' 保留 + csrfHeaders/router 进门；POST/DELETE /api/account/avatar 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('csrfHeaders()');
    expect(code).toContain('useRouter()');
    expect(code).toContain('/api/account/avatar');
    expect(code).toContain('FormData(');
  });

  it('数据钩子守恒：data-avatar-* 全套', () => {
    for (const hook of ['data-avatar-editor', 'data-avatar-url=', 'data-avatar-none', 'data-avatar-file', 'data-avatar-remove', 'data-avatar-hint', 'data-avatar-meta=', 'data-avatar-notice']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .ae-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(10);
    for (const cls of literals) expect(cls).toMatch(/^ae-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind（含 file:/(hover|disabled):opacity-40/h-12/rounded-[）', () => {
    for (const re of ['file:mr-', 'file:rounded', 'file:border', 'file:bg-bg-2', 'file:px-', 'file:py-', 'file:text-12', 'h-12', 'w-12', 'rounded-[', 'rounded-full', 'object-cover', 'hover:bg-', 'disabled:opacity-', 'text-1', 'text-fg-', 'flex-col', 'gap-[']) {
      expect(code, `AvatarEditor 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bae-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(9);
    const defined = new Set([...globals.matchAll(/\.(ae-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.ae- 视觉段存在且零 @media / transition / @keyframes；零 hex；::file-selector-button 合法', () => {
    expect(segment.length).toBeGreaterThan(400);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('::file-selector-button');
  });

  it('.ae- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：beeff3852c6d590c115c5eed71c08bf85f9a3879f743de23ff01f1a06818ae13）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'beeff3852c6d590c115c5eed71c08bf85f9a3879f743de23ff01f1a06818ae13',
    );
  });
});
