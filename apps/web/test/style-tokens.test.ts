import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 界面上写的每一个 `var(--nexus-*)` 都必须真的存在。
 *
 * 为什么单独盯着这件事：一个拼错的 token 不会报错，只会**静默失效**。
 * §45 的世界图就踩到了——选中节点时写的是 `var(--nexus-color-accent)`，
 * 而设计系统里只有 `accent-1` / `accent-2`。结果"选中"这个状态在屏幕上等于把描边去掉，
 * 用户点了半天看不出自己选了谁，测试也照样绿（断言的是文字，不是颜色）。
 * 所以这里不测某个具体颜色，而是把整类错误挡在门禁里。
 */

const SRC = join(process.cwd(), 'apps/web/src');
const TOKENS = join(SRC, 'styles/tokens.css');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
  });
}

/**
 * fg-3 是 11/12px 小字与占位符用的颜色，必须在四级表面上都过 WCAG AA 的 4.5:1。
 *
 * 为什么要单钉这一条：§85 的 axe e2e 只扫得到公开作品页那一个面，而全站 639 处 text-fg-3
 * 里有些落在 bg-3 上（市场的「已举报」徽标、Agent 面板的 busy 态）——那些面没有浏览器门。
 * token 本身可以被任何人一行改回去，所以这里按 tokens.css 的字面值算对比度。
 * 对比度自己算而不是引库：这门要钉的就是这份文件里的十六进制。
 */
function relLum(hex: string): number {
  const ch = hex
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

/** 取某些选择器块里声明的颜色 token 字面值（后一个块覆盖前一个，跟浏览器的层叠一样）。 */
function colorsOf(...selectors: string[]): Map<string, string> {
  const css = readFileSync(TOKENS, 'utf8');
  const out = new Map<string, string>();
  for (const sel of selectors) {
    const start = css.indexOf(sel);
    if (start < 0) throw new Error(`tokens.css 里找不到选择器 ${sel}——这段检查就没人读了`);
    const block = css.slice(start, css.indexOf('}', start));
    for (const m of block.matchAll(/--nexus-color-([a-z0-9-]+)\s*:\s*#([0-9a-fA-F]{6})\s*;/g)) {
      out.set(`--nexus-color-${m[1]}`, m[2]!.toLowerCase());
    }
  }
  expect(out.size, `${selectors.join(' + ')} 里一个颜色声明都没读到`).toBeGreaterThan(0);
  return out;
}

describe('设计 token 引用（§12）', () => {
  const defined = new Set(
    [...readFileSync(TOKENS, 'utf8').matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
  );

  it('tokens.css 里确实有定义，否则这份检查就是空的', () => {
    expect(defined.size).toBeGreaterThan(30);
    expect(defined.has('--nexus-color-accent-2')).toBe(true);
    // 这一条就是当年那个拼错的名字：它必须仍然不存在，检查才有意义
    expect(defined.has('--nexus-color-accent')).toBe(false);
  });

  it('界面里没有出现指向不存在 token 的 var()', () => {
    const unknown: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
          if (!defined.has(m[1]!)) unknown.push(`${relative(process.cwd(), file)}:${i + 1} ${m[1]}`);
        }
      });
    }
    expect(unknown).toEqual([]);
  });
});

describe('fg-3 的对比度（§90 无障碍 · WCAG AA 4.5:1）', () => {
  const themes: Array<readonly [string, Map<string, string>]> = [
    ['暗色', colorsOf(':root {')],
    ['浅色', colorsOf(':root {', "[data-nexus-theme='light'] {")],
  ];

  for (const [label, colors] of themes) {
    it(`${label}主题下 fg-3 对 bg-0..bg-3 四级表面都过 4.5`, () => {
      const fg3 = colors.get('--nexus-color-fg-3');
      expect(fg3, 'tokens.css 里没有 --nexus-color-fg-3 的颜色声明').toBeTruthy();
      for (const level of ['0', '1', '2', '3']) {
        const bg = colors.get(`--nexus-color-bg-${level}`);
        expect(bg, `读不到 --nexus-color-bg-${level}`).toBeTruthy();
        const ratio = contrast(fg3!, bg!);
        expect(
          ratio,
          `fg-3 #${fg3} 对 bg-${level} #${bg} 只有 ${ratio.toFixed(2)}，低于 AA 的 4.5`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('对比度函数与阈值都得名实相符：黑白 21，改色前的旧值确实不及格', () => {
    // 这几条是给上面两道门「验电」的：阈值若形同虚设，旧值就不会红。
    expect(contrast('ffffff', '000000')).toBeCloseTo(21, 0);
    expect(contrast('6b7488', '101219')).toBeLessThan(4.5); // 2026-10-28 之前的暗色 fg-3
    expect(contrast('8a92a6', 'f7f8fb')).toBeLessThan(4.5); // 2026-10-28 之前的浅色 fg-3
  });
});
