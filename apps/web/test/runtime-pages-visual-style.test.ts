import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-24 `/game/[projectId]` 与 `/world/[projectId]` ——**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 两个非发布链、只有作者本人可进的运行时载体，共享同一种三态门：
 *   none（文档还没建）→ 说明缺什么 + 回 Studio 的链接
 *   broken（文档读不出来）→ danger-ink 一句话 + Studio 不可用承诺（§168：不给演示关卡/空场景代替）
 *   ok → 载荷投影（/game → PlayByKind；/world 全屏 3D）
 * 本片只换 className；鉴权（requireUser + projectVisibleTo + notFound）、判 kind、编译、
 * 文案、data 钩子一字不改。
 *
 * **剥 className 后全文 SHA256 守恒**：两文件均逐字节恒等于改前（git HEAD）。
 * redact 三步序与钉死常量那一次一致：game=`4dc0a0b5…`，world=`819282fa…`。
 *
 * 判据不变式（12 门）：
 *  1. 两个 page 都是 server 组件 + force-dynamic + requireUser + projectVisibleTo + notFound 守卫；
 *  2. 字面 className 全 `.rt-*`；3. 零裸 Tailwind 原子类；
 *  4. .rt-* 每个都在 globals.css 有基础定义；5. `.rt-` 视觉段 ≥ 10 条视觉类；
 *  6. 零写死 hex；7. 视觉段 var(--nexus-*) 全在 tokens.css 声明；8. 零新增颜色 token；
 *  9. 零 transition / animation / @keyframes / @media；10. focus-visible 覆盖两档 link 类；
 * 11. SHA256 双文件守恒；12. 数据钩子守恒（game 7 个 + world 4 个）。
 */
const ROOT = process.cwd();
const GAME = join(ROOT, 'apps/web/src/app/game/[projectId]/page.tsx');
const WORLD = join(ROOT, 'apps/web/src/app/world/[projectId]/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const game = readFileSync(GAME, 'utf8');
const world = readFileSync(WORLD, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const gameCode = game.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const worldCode = world.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.rt-` 视觉段：`.rt-shell {` 起，到下一个 §FE 段头止。 */
function rtSegment(css: string): string {
  const start = findOutsideComments(css, /\.rt-shell \{/);
  if (start < 0) throw new Error('globals.css 找不到 .rt- 段（.rt-shell {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = rtSegment(globals);

/** redact：所有 className 字面值/模板值 → @（顺序三步与钉死常量的那次一致）。 */
function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}');
}

function rtClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(rt-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-24 /game 与 /world 运行时壳', () => {
  it('两个 page 都是 server 组件：force-dynamic + requireUser + projectVisibleTo + notFound', () => {
    for (const src of [gameCode, worldCode]) {
      expect(src).not.toContain('use client');
      expect(src).toContain("export const dynamic = 'force-dynamic'");
      expect(src).toContain('requireUser()');
      expect(src).toContain('projectVisibleTo(');
      expect(src).toContain('notFound()');
      expect(src).not.toContain('onClick=');
    }
  });

  it('数据钩子守恒：game 7 个（runtime×2/error/page/title/subtitle/back）+ world 4 个（world3d×2/error/stage）', () => {
    for (const hook of [
      'data-game-runtime="none"',
      'data-game-runtime="broken"',
      'data-game-error',
      'data-game-page',
      'data-game-title',
      'data-game-subtitle',
      'data-game-back',
    ]) {
      expect(gameCode, `game 丢了钩子 ${hook}`).toContain(hook);
    }
    for (const hook of ['data-world3d="none"', 'data-world3d="broken"', 'data-world-error']) {
      expect(worldCode, `world 丢了钩子 ${hook}`).toContain(hook);
    }
    expect(worldCode).toContain('rt-stage');
  });

  it('字面 className 只认 .rt-*', () => {
    let total = 0;
    for (const src of [gameCode, worldCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^rt-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThan(12);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [gameCode, worldCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|px-|my-|text-\d|text-\[|text-fg-|text-danger-|text-warn-|bg-|flex\b|grid\b|gap-|items-|min-w-|h-dvh|w-full|w-\[|md:|sm:|hover:|disabled:|font-)\b/,
        );
      }
    }
  });

  it('className 用到的每个 rt-* 都在 globals.css 里有 .rt- 基础定义', () => {
    const used = new Set([...(gameCode + '\n' + worldCode).matchAll(/\brt-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThan(8);
    const defined = rtClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.rt- 视觉段成规模（≥ 10 条视觉类）', () => {
    expect(rtClassesDefined(globals).size).toBeGreaterThanOrEqual(10);
    expect(segment.length).toBeGreaterThan(400);
  });

  it('零写死 hex（视觉段 + 两个文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(gameCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(worldCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.rt- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('零 transition / animation / @keyframes / @media', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('animation');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('@media');
  });

  it('focus-visible 覆盖 rt-link / rt-linkSub', () => {
    expect(segment).toContain('.rt-link:focus-visible');
    expect(segment).toContain('.rt-linkSub:focus-visible');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：game=4dc0a0b5… · world=819282fa…）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 外一字节未动。
    expect(createHash('sha256').update(redactClasses(game)).digest('hex')).toBe(
      '4dc0a0b57860800784c9bc1b761175179cc9e6e7b83cff5a2563886d4322ff98',
    );
    expect(createHash('sha256').update(redactClasses(world)).digest('hex')).toBe(
      '819282fa1c32c11c94aabffc5e0f1ea46c7a95b7ca5f1d2d7b0c8663014f703e',
    );
  });
});
