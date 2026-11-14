import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-99 `play/StoryPlay.tsx` `.st-` 门面化——§54 互动叙事运行时 chrome——**静态那一寸**。
 * "这一段开不了场"照实说；blocked → 不画假分支；尾巴 note 原字回放——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `5a101e8e42d032ee331b75128f043f116a34af6450b6168804382086c68b2bb0` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/play/StoryPlay.tsx');
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

const start = findOutsideComments(globals, /\.st-card \{/);
if (start < 0) throw new Error('.st- 段缺失');
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

describe('§FE-99 /play/StoryPlay §54 互动叙事运行时 chrome', () => {
  it("'use client' 保留；关键钩子 story-* / playtest-* 守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    for (const hook of ['data-story="blocked"', 'data-story-blocker', 'data-story-play', 'data-story-restart', 'data-story-beat=', 'data-story-name', 'data-story-repeat', 'data-story-text-empty', 'data-story-text', 'data-story-choices', 'data-story-ending', 'data-story-trail', 'data-playtest-story-stats', 'data-playtest-finding', 'data-playtest-limits', 'data-story-notes']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .st-*/.pk-*/.g2-*/.pp-danger12', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(29);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^(?:st|pk|g2|pp)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 leading-6/whitespace-pre-wrap/gap-1.5/py-1.5/cursor-pointer/list-disc/pl-4）', () => {
    for (const re of ['leading-6', 'whitespace-pre-wrap', 'gap-1.5', 'py-1.5', 'cursor-pointer', 'list-disc', 'pl-4', 'text-[', 'text-1', 'text-fg-', 'text-danger-ink', 'rounded-lg', 'hover:border-', 'border-[', 'px-3', 'flex-col', 'flex-wrap', 'mt-1', 'mt-2', 'mt-3']) {
      expect(code, `StoryPlay 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:st|pk|g2|pp)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(20);
    const defined = new Set([...globals.matchAll(/\.((?:st|pk|g2|pp)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.st- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(700);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.st- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：5a101e8e42d032ee331b75128f043f116a34af6450b6168804382086c68b2bb0）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '5a101e8e42d032ee331b75128f043f116a34af6450b6168804382086c68b2bb0',
    );
  });
});
