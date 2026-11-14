import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-75 `play/page.tsx` 原子清零——叠加 `.pp-*`（§FE-7 已门面化本文件 chrome）**静态那一寸**。
 * §50：读的是**发布那一刻钉在 publication 行上的那份游戏设计**（ADR-0009），不是作者的工作稿——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `75276d27a3f07a30959e42e50e35d20409e51200787ae8e9edc90a2d4feda3c1` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/n/[handle]/[slug]/play/page.tsx');
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

const start = findOutsideComments(globals, /\.pp-h1xi \{/);
if (start < 0) throw new Error('.pp-h1xi 段缺失');
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

describe('§FE-75 /n/[handle]/[slug]/play 公开可玩页原子清零', () => {
  it('读钉住的游戏设计：GameDocumentSchema / compileForKind / VisitMeter 进门', () => {
    expect(code).toContain('GameDocumentSchema');
    expect(code).toContain('compileForKind(');
    expect(code).toContain('<PublicPlay');
    expect(code).toContain('<VisitMeter');
    expect(code).toContain('validateGame(');
  });

  it('数据钩子守恒：data-play / data-play-back / data-play-issue / data-play-issues / data-play-title / data-play-subtitle / data-play-pinned', () => {
    for (const hook of ['data-play="none"', 'data-play="broken"', 'data-play="live"', 'data-play-back', 'data-play-issue', 'data-play-issues', 'data-play-title', 'data-play-subtitle', 'data-play-pinned']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .pp-*（无裸数字原子）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(16);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^pp-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 text-[ / max-w-[ / px-6 / py-16 / gap-1 / font-semibold）', () => {
    for (const re of ['text-[', 'max-w-[', 'px-6', 'py-16', 'py-8', 'gap-1', 'gap-3', 'gap-4', 'font-semibold', 'mx-auto', 'flex-col', 'text-12', 'text-11', 'text-13', 'text-fg-', 'text-danger-ink', 'text-accent-2-ink', 'items-baseline', 'justify-between']) {
      expect(code, `play page 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bpp-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(10);
    const defined = new Set([...globals.matchAll(/\.(pp-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('§FE-75 视觉追加段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(400);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('§FE-75 视觉追加段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(4);
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：75276d27a3f07a30959e42e50e35d20409e51200787ae8e9edc90a2d4feda3c1）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '75276d27a3f07a30959e42e50e35d20409e51200787ae8e9edc90a2d4feda3c1',
    );
  });
});
