import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-58 `GameGraphView.tsx` `.wg-` 复用——§52 Game 设计系统图视图（SVG）——**静态那一寸**。
 *
 * 与 §FE-57 同一 SVG 系列（GAME_KIND_FILL 本色常量、cursor-grab/grabbing 派发、LAYER 派发）；
 * 本片**零新增 CSS 定义**——只映射同奏的 `.wg-*` 门面族。红线：emptyState/wg-block/wgrootCol 全量复用。
 * 唯一代码变更：`ml-auto font-mono text-11` cn 三元 → `.wd-monoFaintEnd` + `wd-dangerText`（cx/gp-segOn→selOn 的同口径映射扩展）。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `75c1fd00a82746799bdcee944fdb31652ddc10b7f9081b19ef679bc510acd4d7`。
 *
 * 判据不变式（9 门）：
 *  1. 'use client' 保留 + updateDragState/graph 派发；2. 字面 className 全 `.wg-*`/复用族；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义（`.wg-`/复用族）；
 *  5. 零 hex（CSS：JS KIND_FILL 11 个 kind 本色数据原样保留）；6. 零 @media / transition / @keyframes；
 *  7. 段所有 var(--nexus-*) 已在 tokens.css 声明；8. 零新增颜色 token；
 *  9. SHA256 守恒（唯一代码变更 = cn 三元 share 切换为 `.wd-monoFaintEnd` + `wd-dangerText`）；10. 钩子守恒（data-game-graph-*）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/GameGraphView.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(main);

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.wg-` 视觉段：`.wg-ghostDanger {` 起，到下一个 §FE 段止。 */
function wgSegment(css: string): string {
  const start = findOutsideComments(css, /\.wg-ghostDanger \{/);
  if (start < 0) throw new Error('globals.css 找不到 .wg- 段（.wg-ghostDanger {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = wgSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@`。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\bcn\([^)]*\)/gs, 'cn()')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:wg|gp|sb|wd|cp|mm|rp|ds|ap|hi)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-58 /studio GameGraphView 游戏设计系统图视图', () => {
  it("'use client' 保留 + svg 渲染路径进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('<svg');
    expect(code).toContain('onClick={');
  });

  it('数据钩子守恒：data-game-graph-*', () => {
    expect(code).toContain('data-game-graph-selection');
  });

  it('字面 className 只认 .wg-*/复用族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(14);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:wg|gp|sb|wd|cp|mm|rp|ds|ap|hi)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（wg-/复用族之外）；KIND_FILL 是用户本色数据', () => {
    for (const re of ['fill-', 'text-[', 'max-w-[', 'w-[', 'absolute ', 'pointer-events-none', 'bg-bg-', 'text-fg-', 'mt-', 'interact ']) {
      expect(code, `GameGraphView 仍出现 ${re}`).not.toContain(re);
    }
    for (const literal of ['#2f4b63', '#4d2b34', '#2f5038', '#20242e']) {
      expect(code).toContain(literal); // GAME_KIND_FILL 本色数据
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:wg|gp|sb|wd|cp|mm|rp|ds|ap|hi)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.wg- 段已完整（GameGraphView 零新增定义）且零 @media / transition / @keyframes', () => {
    expect(segment.length).toBeGreaterThan(1500);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('.wg- 所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('剥 className/cn 后全文 SHA256 守恒（零行为：75c1fd00a82746799bdcee944fdb31652ddc10b7f9081b19ef679bc510acd4d7）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '75c1fd00a82746799bdcee944fdb31652ddc10b7f9081b19ef679bc510acd4d7',
    );
  });
});
