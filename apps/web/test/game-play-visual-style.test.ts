import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-96 `game2d/GamePlay.tsx` `.g2-` 门面化——§51 HUD/Quest/事件流/Playtest chrome——**静态那一寸**。
 * "补齐之后回到这一页会重新编译"——不画假关卡兜底（§159）——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `a286820a0859da1f5e0f720fc229617cbe84ecdaef93ce742168ae14e0c6c9d1` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/game2d/GamePlay.tsx');
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

const start = findOutsideComments(globals, /\.g2-col \{/);
if (start < 0) throw new Error('.g2- 段缺失');
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

describe('§FE-96 /game2d GamePlay HUD/Playtest chrome', () => {
  it("'use client' 保留 + 数据钩子 data-game-* 关键钩守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    for (const hook of ['data-game-blocked', 'data-game-blocker', 'data-game-root', 'data-game-view={view}', 'data-game-hud', 'data-game-restart', 'data-game-outcome', 'data-game-controls', 'data-game-quest={', 'data-game-event', 'data-playtest-seed-used={report.seed}', 'data-playtest-finding', 'data-playtest-limits', 'data-game-provenance', 'data-game-note']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .g2-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(38);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^g2-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 max-h-[/sm:grid-cols-2/w-[/gap-[/overflow-auto/font-semibold）', () => {
    for (const re of ['max-h-[', 'sm:grid-cols-2', 'grid-cols-1', 'w-[92px]', 'gap-[', 'justify-center', 'rounded', 'overflow-auto', 'font-semibold', 'text-1', 'text-fg-', 'text-danger-ink', 'bg-bg-', 'mt-1', 'mt-2', 'flex-col', 'flex-wrap']) {
      expect(code, `GamePlay 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bg2-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(24);
    const defined = new Set([...globals.matchAll(/\.(g2-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.g2- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(800);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.g2- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：a286820a0859da1f5e0f720fc229617cbe84ecdaef93ce742168ae14e0c6c9d1）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'a286820a0859da1f5e0f720fc229617cbe84ecdaef93ce742168ae14e0c6c9d1',
    );
  });
});
