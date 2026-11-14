import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-57 `WorldGraphView.tsx` `.wg-` 门面化（§45 世界图视图，§44 的 SVG 投影）——**静态那一寸**。
 *
 * SVG 的 `fill-fg-*` + `text-[NNpx]` 文本标签是 attribute-over-className 的语义，换门面类不画蛇添足。
 * 零行为：SVG 派发（画台子 / 删除 / iframe 事件）一字不动；terrainMode 系列全部保留。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `436ba236b0a2d2426247810569dec8453f3cc439846749d696cae278ca31764e`。
 *
 * 判据不变式（10 门）：
 *  1. 'use client' 保留 + worldStore/drag/graph-execute 进门；2. 字面 className 全 `.wg-*`/复用族（含 cn 三元分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.wg-` 段成规模（≥ 30 条）；
 *  6. 零 hex；7. 字面量只出现在 SVG `fill-fg-*` 替代位的 `.6875rem` (11px fill)；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 transition/@media/@keyframes；11. `.wg-head`/`.wg-emptyLead`/`.wg-axis12` 定义齐全；12. SHA256 守恒 + 钩子守恒（data-world-terrain-*）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/WorldGraphView.tsx');
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

describe('§FE-57 /studio WorldGraphView 世界图视图', () => {
  it("'use client' 保留 + SVG graph 渲染进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('dragging');
    expect(code).toContain('startDrag(');
  });

  it('数据钩子守恒：data-world-terrain-* / data-world-node-id', () => {
    for (const hook of ['data-world-terrain-mode', 'data-world-terrain-height-input', 'data-world-terrain-profile=']) {
      expect(code, `WorldGraphView 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .wg-*/复用族（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(14);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:wg|gp|sb|wd|cp|mm|rp|ds|ap|hi)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（wg-/复用族之外）', () => {
    for (const re of ['fill-', 'text-[', 'max-w-[', 'w-[', 'h-full ', 'flex h-full', 'absolute ', 'pointer-events-none', 'bg-bg-', 'text-fg-', 'mt-']) {
      expect(code, `WorldGraphView 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:wg|gp|sb|wd|cp|mm|rp|ds|ap|hi)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(20);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.wg- 视觉段成规模（≥ 25 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(1500);
    expect((segment.match(/\.wg-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(25);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex（CSS 视觉段不许；JS 图顶点本色常量 KIND_FILL/#20242e 是**图层本色数据**不是样式，原样保留）；字面量只出现在 SVG fill-fg-* 替换位', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const literal of ['#3b2f63', '#2f4b63', '#26414f', '#20242e']) {
      expect(code).toContain(literal); // 世界图顶点本色常量
    }
    const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!).join(' ');
    expect(classLiterals).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const size of ['0.625rem', '0.6875rem', '0.75rem', '0.8125rem']) {
      expect(segment).toContain(size);
    }
  });

  it('.wg- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(8);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.wg-head/.wg-emptyLead/.wg-axis12/.wg-segBtn.wg-selOn 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.wg-head {', '.wg-emptyLead {', '.wg-axis12 {', '.wg-selOn {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className/cn 后全文 SHA256 守恒（零行为：436ba236b0a2d2426247810569dec8453f3cc439846749d696cae278ca31764e）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '436ba236b0a2d2426247810569dec8453f3cc439846749d696cae278ca31764e',
    );
  });
});
