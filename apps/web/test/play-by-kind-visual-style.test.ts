import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-98 `play/PlayByKind.tsx` `.pk-` 门面化——§14 未接线 kind 的诚实空态——**静态那一寸**。
 * "还没有可玩的投影"照实说，不画假入口（§159）——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `6148c8d38cf2e46abbd26dd05f1d3ab883ab633c69770478ddfe52eef03c61d8` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/play/PlayByKind.tsx');
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

const start = findOutsideComments(globals, /\.pk-card \{/);
if (start < 0) throw new Error('.pk- 段缺失');
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

describe('§FE-98 /play/PlayByKind 未接线 kind 空态', () => {
  it('数据钩子守恒：data-game-kind-note / data-play="kind-not-wired" / data-play-kind-reason', () => {
    expect(code).toContain('data-game-kind-note={document.kind}');
    expect(code).toContain('data-play="kind-not-wired"');
    expect(code).toContain('data-play-kind-reason');
  });

  it('字面 className 只认 .pk-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(5);
    for (const cls of literals) expect(cls).toMatch(/^pk-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind（含 rounded-lg/text-1x/mt-2/font-semibold/border-[）', () => {
    for (const re of ['rounded-lg', 'border-[', 'text-1', 'mt-2', 'p-4', 'font-semibold', 'text-fg-']) {
      expect(code, `PlayByKind 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bpk-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(5);
    const defined = new Set([...globals.matchAll(/\.(pk-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.pk- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(200);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.pk- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：6148c8d38cf2e46abbd26dd05f1d3ab883ab633c69770478ddfe52eef03c61d8）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '6148c8d38cf2e46abbd26dd05f1d3ab883ab633c69770478ddfe52eef03c61d8',
    );
  });
});
