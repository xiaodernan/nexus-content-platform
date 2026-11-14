import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-95 `game2d/GameCanvas3D.tsx` `.g3-` 门面化——§51 3D 视角的 chrome——**静态那一寸**。
 * 判定仍在地平面；几何体是类别标记；不退回 2D 冒充 3D；HUD/sim/输入一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `e9876d4c6398e4a7ac3486acd337335a3eed58aa1d26ec81df8ea24a3565e5b7` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/game2d/GameCanvas3D.tsx');
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

const start = findOutsideComments(globals, /\.g3-probing \{/);
if (start < 0) throw new Error('.g3- 段缺失');
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

describe('§FE-95 /game2d GameCanvas3D 3D 视角 chrome', () => {
  it("'use client' 保留 + three 栈进门；WebGL 探测守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('@react-three/fiber');
    expect(code).toContain('useWebglAvailable');
    expect(code).toContain('preserveDrawingBuffer: true');
    expect(code).toContain('data-game-3d="probing"');
    expect(code).toContain('data-game-3d="unavailable"');
    expect(code).toContain('data-game-3d="live"');
  });

  it('数据钩子守恒：data-game-3d* / data-game-3d-reason / data-game-canvas-3d / data-game-3d-painted', () => {
    for (const hook of ['data-game-3d="probing"', 'data-game-3d="unavailable"', 'data-game-3d-reason', 'data-game-3d="live"', 'data-game-canvas-3d', 'data-game-3d-painted']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .g3-*（渲染栈的 hex 常量不归 className 门辖）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(5);
    for (const cls of literals) expect(cls).toMatch(/^g3-[A-Za-z0-9-]+$/);
  });

  it('零裸 Tailwind（含 flex-col/items-center/text-1x/rounded/px-6/w-full）', () => {
    for (const re of ['flex-col', 'items-center', 'justify-center', 'items-center', 'text-1', 'text-fg-', 'px-6', 'gap-2', 'w-full', 'overflow-hidden', 'rounded ', 'font-mono']) {
      expect(code, `GameCanvas3D 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bg3-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(5);
    const defined = new Set([...globals.matchAll(/\.(g3-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.g3- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(400);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.g3- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(3);
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：e9876d4c6398e4a7ac3486acd337335a3eed58aa1d26ec81df8ea24a3565e5b7）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'e9876d4c6398e4a7ac3486acd337335a3eed58aa1d26ec81df8ea24a3565e5b7',
    );
  });
});
