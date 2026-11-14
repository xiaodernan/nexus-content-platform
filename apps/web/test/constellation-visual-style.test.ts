import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-CNS 「人物关系星图」（`/world/<project>/constellation`）—— v704 并轨的门面判据。
 *
 * 并轨产物是深空画板 + 玻璃质感暗网，类名全裸 arbitrary atom（bg-[#070a14]/text-[#e8eaed]/
 * px-6/gap-4/text-13…）。按 §FE 判据不可带入主线：先门面化（.cns-* 族，零 hex，零裸 atom），
 * SVG 取色全部走 var(--nexus-color-*)。
 *
 * 判据不变式：
 *  1. 'use client'（画布交互）+ roles/aria 守恒（role="button" / aria-pressed / aria-label）+
 *     data-cns- 节点/锚点/关系/role/… 钩子守恒；
 *  2. 字面 className 只认 .cns-* 族（含 cns-nodeDegreeText）；
 *  3. 零裸 Tailwind 原子；4. .cns-* 全部在 globals.css 有定义；
 *  5. 零写死 hex；6. var() 全在 tokens.css；7. forced-colors 有回退；
 *  8. SHA256 钉死。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/ConstellationPanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

const CNS_START = findOutsideComments(globals, /\.cns-shell \{/);
if (CNS_START < 0) throw new Error('globals.css 里没有 .cns-shell 段');
const rest = globals.slice(CNS_START);
const restNoComments = cssNoComments(rest);
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const cnsSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-CNS /world/<project>/constellation 人物关系星图', () => {
  it('use client + 全部数据钩子 + role/aria 守恒', () => {
    expect(code).toContain("'use client'");
    expect(code).toContain('ConstellationGraph');
    expect(code).toContain('selectedId');
    expect(code).toContain('role="button"');
    expect(code).toContain('aria-pressed={active}');
    expect(code).toContain('aria-label={`${node.name}');
    expect(code).toContain('role="img"');
    expect(code).toContain('tabIndex={0}');
    expect(code).toContain('onKeyDown');
    expect(code).toContain('setSelectedId');
  });

  it('字面 className 只认 .cns-* 族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(12);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `ConstellationPanel 出现域外类：${tok}`).toMatch(/^cns-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('已收官 v704 gate 不复活：Tailwind prefix 任意值断开（bg-[#…] 等并轨 origin 全数消失）', () => {
    for (const re of ['bg-\\[', 'text-\\[', 'px-2', 'py-2', 'text-13', 'text-10', 'text-11', 'rounded-full', 'overflow-hidden', 'grid-cols', 'gap-4', 'outline-none']) {
      expect(code, `ConstellationPanel 仍出现裸 atom \${re}`).not.toContain(re);
    }
  });

  it('.cns-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const used = new Set([...code.matchAll(/\bcns-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(25);
    const defined = new Set([...globals.matchAll(/\.(cns-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.cns-shell');
    expect(forced).toContain('.cns-svg path');
    expect(forced).toContain('.cns-panel');
  });

  it('零写死 hex；零新增颜色 token；var(--nexus-*) 全在 tokens.css 声明（含 SVG）', () => {
    expect(cnsSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...cnsSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    const svgHex = [...code.matchAll(/(?:stopColor|stroke|fill|filter|gradient)="?#[0-9a-fA-F]{3,8}"?/g)].map((m) => m[0]);
    expect(svgHex, `SVG 里写死 hex：${svgHex.join(' ')}`).toHaveLength(0);
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '3bffd7445859a5ec0a6c8f705fdd30c0843d7e7bd6762cefbb7fbb9bdf55e613',
    );
  });
});
