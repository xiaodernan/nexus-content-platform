import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-100 `world3d/WorldWalk.tsx` `.ww-` 门面化——§15 3D 行走 chrome——**静态那一寸**。
 * 判定在 Sim/Worker；WebGL 给不出就明说，不降级冒充 3D（§159）——不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `20c50d9fb367e9ef4029d0ef493afb54b9993dbc0665c7f2c1b58aa76cf4ee8d` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/world3d/WorldWalk.tsx');
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

const start = findOutsideComments(globals, /\.ww-probing \{/);
if (start < 0) throw new Error('.ww- 段缺失');
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

describe('§FE-100 /world3d WorldWalk 3D 行走 chrome', () => {
  it("'use client' 保留；WebGL 三态 + 数据钩子守恒", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    for (const hook of ['data-world3d="probing"', 'data-world3d="unavailable"', 'data-world-labels', 'data-label-capped', 'data-world-hud', 'data-hud-world', 'data-world-talk', 'data-world-talk-empty', 'data-world-legend', 'data-nearby-panel', 'data-nearby-focus={focused.id}', 'data-nearby-empty', 'data-scene-limits']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .ww-*/.g3-*/.g2-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(33);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^(?:ww|g3|g2)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 -translate/inset-x-0/max-h-[/px-1.5/opacity-mixer/absolute）', () => {
    for (const re of ['-translate-x-1/2', '-translate-y-full', 'translate-x', 'inset-x-0', 'max-h-[', 'px-1.5', 'py-[1px]', "bg-bg-1/85",
      "bg-bg-1/90", "bg-bg-1/95", 'pointer-events', 'whitespace-nowrap', 'absolute', 'bottom-2', 'right-3', 'flex-col', 'text-1', 'text-fg-', 'flex-wrap']) {
      expect(code, `WorldWalk 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:ww|g3|g2)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(24);
    const defined = new Set([...globals.matchAll(/\.((?:ww|g3|g2)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('.ww- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(1200);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.ww- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(6);
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（v759 i18n 重钉：7464a5d90f1c44e6bc4d97606c9b5dbb4289dd43b9af74f9e50eb236d62f7a76）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '7464a5d90f1c44e6bc4d97606c9b5dbb4289dd43b9af74f9e50eb236d62f7a76',
    );
  });
});
