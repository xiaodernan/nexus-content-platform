import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-97 `game2d/RpgPlay.tsx` `.g2-` 复用——§51 RPG 分支 chrome——**静态那一寸**。
 * 与 §FE-96 同族同语义——零新 CSS：与 GamePlay 共享 `.g2-*` 全套。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `fd117da3187f50877875c485ff5d47b6a02736d564879cb414213a9781b83041` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/game2d/RpgPlay.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const code = strip(main);

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

describe('§FE-97 /game2d RpgPlay RPG 分支 chrome（复用 .g2-）', () => {
  it("'use client' 保留；关键钩照旧（rpg 分支）", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
  });

  it('字面 className 只认 .g2-*（复用族，零新类）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(39);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^g2-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind', () => {
    for (const re of ['max-h-[', 'sm:grid-cols-2', 'w-[', 'gap-[', 'text-1', 'text-fg-', 'text-danger-ink', 'bg-bg-', 'flex-col', 'overflow-auto', 'font-semibold', 'rounded', 'mt-1', 'mt-2']) {
      expect(code, `RpgPlay 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('复用的 .g2-* 类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bg2-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(24);
    const defined = new Set([...globals.matchAll(/\.(g2-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('复用族 token 声明过', () => {
    const start = globals.indexOf('.g2-col {');
    expect(start).toBeGreaterThan(0);
    const end = globals.indexOf('/* ── §FE-97', start);
    const segment = globals.slice(start, end > 0 ? end : start + 3000);
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：fd117da3187f50877875c485ff5d47b6a02736d564879cb414213a9781b83041）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'fd117da3187f50877875c485ff5d47b6a02736d564879cb414213a9781b83041',
    );
  });
});
