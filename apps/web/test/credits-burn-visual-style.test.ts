import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-BN `/credits` 燃烬速度卡（CreditsBurnCard）—— **并轨 v700 的门面判据**。
 *
 * 并轨产物本身是全裸 arbitrary atoms + JSX 里写死 hex（#5b6cff / #22d3ee / #a5b4ff），
 * 按 §FE 判据不可带入主线：先门面化（.bn-* 族 + SVG fill/stroke 走 var(--nexus-*），
 * 钩子守恒（data-burn-*）。
 *
 * 判据不变式：
 *  1. 'use client'；hooks；BurnProjection prop 类型；
 *  2. 字面 className 只认 .bn-* 族（含 bn-copy b 元素…b 不是 className，不涉及）；
 *  3. 零裸 Tailwind 原子类；4. 用到的类都在 globals.css 有定义；5. .bn-* 新段在 bn 段里；
 *  6. 零写死 hex（JSX hex 与 CSS hex 都查）；零新增颜色 token；var() 全在 tokens.css 声明；
 *  7. SVG 的 stopColor/stroke/fill 走 var(--nexus-color-*)，零 #hex；
 *  8. forced-colors 段有 bn-* 收口；data 钩子守恒（card/days/balance/date/svg/chips/chip）；
 *  9. SHA256 钉死。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/CreditsBurnCard.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

const BN_START = findOutsideComments(globals, /\.bn-root \{/);
if (BN_START < 0) throw new Error('globals.css 里没有 .bn-root 段');
const rest = globals.slice(BN_START);
const BN_END = rest.search(/\/\* ─{5,}/);
const bnSegment = cssNoComments(BN_END > 0 ? rest.slice(0, BN_END) : rest);

const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-BN /credits 燃烬速度卡（CreditsBurnCard）', () => {
  it('use client + BurnProjection 入参 + 双钩子形态', () => {
    expect(code).toContain("'use client'");
    expect(code).toContain('BurnProjection');
    expect(code).toContain('useCountUp(');
    expect(code).toContain('useState(');
  });

  it('字面 className 只认 .bn-* 族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(14);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `CreditsBurnCard 出现域外类：${tok}`).toMatch(/^bn-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('零裸 Tailwind 原子类（含并轨产物的 text-gradient-brand 残留）', () => {
    for (const re of ['text-gradient-brand', 'rounded-2xl', 'rounded-full', 'tracking-[', 'text-10', 'text-11', 'text-12', 'text-44', 'text-40', 'min-h-6', 'px-2.5', 'max-w-[', 'shadow-[0_0', 'from-bg-1', 'mt-2', '#5b6cff', '#22d3ee', '#a5b4ff']) {
      expect(code, `CreditsBurnCard 仍出现裸原子/hex ${re}`).not.toContain(re);
    }
  });

  it('用到的每个类都在 globals.css 有定义', () => {
    const used = new Set([...code.matchAll(/\bbn-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(12);
    const defined = new Set([...globals.matchAll(/\.(bn-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    expect(bnSegment).toContain('.bn-root {');
    for (const cls of ['.bn-daysBig {', '.bn-chip {', '.bn-svg {']) {
      expect(bnSegment, `bn 段没有定义 ${cls}`).toContain(cls);
    }
  });

  it('零写死 hex、零新增颜色 token；var(--nexus-*) 全在 tokens.css 声明；SVG 取色走 var()', () => {
    expect(bnSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(bnSegment).not.toMatch(/--nexus-color-bn-/);
    const usedTokens = [...new Set([...bnSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(10);
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    // JSX 里的 SVG：stroke/stopColor/fill 也不能写死 hex
    const svgHex = [...code.matchAll(/(?:stopColor|stroke|fill)="(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]!);
    expect(svgHex, `SVG 里写死 hex：${svgHex.join(' ')}`).toHaveLength(0);
    expect(code).toContain('stopColor="var(--nexus-color-brand)"');
    expect(code).toContain('stroke="var(--nexus-color-brand)"');
    expect(code).toContain('stroke="var(--nexus-color-accent-2)"');
    expect(code).toContain('fill="var(--nexus-color-accent-mix)"');
  });

  it('forced-colors 段有 bn-* 收口', () => {
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.bn-root');
    expect(forced).toContain('.bn-daysBig');
    expect(forced).toContain('.bn-chip');
    expect(forced).toContain('.bn-svg polyline');
  });

  it('data 钩子守恒（card/days/balance/date/svg/chips/chip）', () => {
    for (const hook of ['data-burn-card', 'data-burn-days', 'data-burn-balance', 'data-burn-date', 'data-burn-svg', 'data-burn-chips', 'data-burn-chip={']) {
      expect(code, `CreditsBurnCard 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('SHA256 钉死（并轨 + v700.1 零态水印后的本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '73d81b9f1934df498a5686815c3681a3452458b384c29cb78255893d935e8bfc',
    );
  });
});
