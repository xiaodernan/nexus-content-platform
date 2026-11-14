import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-CRN 「世界编年」（`/world/<project>/chronicle`）—— v705 并轨的门面判据。
 *
 * 并轨产物是深空画板 + era 横向走廊，类名全裸 arbitrary atom（bg-[#070a14]/text-[#e8eaed]/
 * px-2/gap-4/text-11…）。按 §FE 判据不可带入主线，先门面化（.crn-* 族，零 hex、零裸 atom），
 * 再由本门钉死。
 *
 * 判据不变式：
 *  1. 'use client' + data-chronicle-* 钩子守恒（root/kicker/counts/era/entry/kind/seq/footnote/empty/scroll）；
 *  2. 字面 className 只认 .crn-* 族；
 *  3. 零裸 Tailwind 原子；4. .crn-* 全部在 globals.css 有定义；
 *  5. 零写死 hex（含 SVG 属性）；6. var(--nexus-*) 全在 tokens.css 声明；
 *  7. forced-colors 有回退；8. SHA256 钉死。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/ChronicleView.tsx');
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

const CRN_START = findOutsideComments(globals, /\.crn-empty \{/);
if (CRN_START < 0) throw new Error('globals.css 里没有 .crn-* 段');
const rest = globals.slice(CRN_START);
const restNoComments = cssNoComments(rest);
const TO_END = restNoComments.search(/\/\* ─{5,}/);
const crnSegment = TO_END > 0 ? restNoComments.slice(0, TO_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-CRN /world/<project>/chronicle 世界编年', () => {
  it("use client + data-chronicle-* 钩子守恒", () => {
    expect(code).toContain("'use client'");
    for (const hook of [
      'data-chronicle-root',
      'data-chronicle-empty',
      'data-chronicle-kicker',
      'data-chronicle-counts',
      'data-chronicle-scroll',
      'data-chronicle-era=',
      'data-chronicle-entry=',
      'data-chronicle-kind',
      'data-chronicle-seq',
      'data-chronicle-footnote',
      'data-chronicle-ties',
      'data-chronicle-tie=',
      'data-chronicle-ties-empty',
    ]) {
      expect(code, `ChronicleView 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .crn-* 族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(12);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `ChronicleView 出现域外类：${tok}`).toMatch(/^crn-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('零裸 Tailwind 原子（并轨 origin 全数断开）', () => {
    for (const re of ['bg-[', 'text-[', 'flex min-h', 'rounded-full', 'text-11', 'text-13', 'gap-4', 'px-2', 'py-1', 'min-h-dvh', 'grid-cols', 'grid-rows']) {
      expect(code, `ChronicleView 仍出现裸 atom ${re}`).not.toContain(re);
    }
  });

  it('.crn-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const used = new Set([...code.matchAll(/\bcrn-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(20);
    const defined = new Set([...globals.matchAll(/\.(crn-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.crn-root');
    expect(forced).toContain('.crn-era');
    expect(forced).toContain('.crn-kindTag');
  });

  it('零写死 hex（含 SVG 属性）；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(crnSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...crnSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    const svgHex = [...code.matchAll(/(?:stopColor|stroke|fill)="?#[0-9a-fA-F]{3,8}"?/g)].map((m) => m[0]);
    expect(svgHex, `SVG 里写死 hex：${svgHex.join(' ')}`).toHaveLength(0);
  });

  it('era 横向走廊保留 scroll-snap（零行为契约的可滚动性）', () => {
    expect(crnSegment).toContain('.crn-scroll');
    expect(crnSegment).toContain('scroll-snap-type');
    expect(code).toContain('role="region"');
    expect(code).toContain('tabIndex={0}');
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '27b60ee39a949f9c6552b5528dbd11301b79d4bc4e14aa03f480da63daeab254',
    );
  });
});
