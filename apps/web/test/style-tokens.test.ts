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

/** 注释里的假声明不能被当成真声明（本文件就有一条注释在讲"某个 token 为什么被删"）。 */
function declarations(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 取某些选择器块里声明的颜色 token 字面值（后一个块覆盖前一个，跟浏览器的层叠一样）。 */
function colorsOf(...selectors: string[]): Map<string, string> {
  const css = declarations(readFileSync(TOKENS, 'utf8'));
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

/** tokens.css 里声明过的所有 token 名——第三道门也要用，所以放在 describe 外面。 */
const defined = new Set(
  [...declarations(readFileSync(TOKENS, 'utf8')).matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
);

describe('设计 token 引用（§12）', () => {
  it('tokens.css 里确实有定义，否则这份检查就是空的', () => {
    expect(defined.size).toBeGreaterThan(30);
    expect(defined.has('--nexus-color-accent-2')).toBe(true);
    // 这一条就是当年那个拼错的名字：它必须仍然不存在，检查才有意义
    expect(defined.has('--nexus-color-accent')).toBe(false);
    // 注释里讲"某个 token 为什么被删"时会写出它的名字与值：那不算定义。
    // 这一对断言钉的是解析器只读声明——少了它，注释就能给自己发一张通行证。
    expect(readFileSync(TOKENS, 'utf8')).toContain('--nexus-color-brand-fg:');
    expect(defined.has('--nexus-color-brand-fg')).toBe(false);
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

/**
 * 强调面（brand / accent-1 / accent-2 / danger / warn / success / info）上的文字色。
 *
 * 为什么单立一道门：§85 第四片第一次把 axe 伸到登录后的界面，首跑就在首页与发现各抓到一条
 * `color-contrast`——同一条 class 串里写着 `bg-accent-2 text-fg-1`，暗色下只有 **1.60:1**。
 * 而这不是那一处的手滑：全站 32 条串都这么写。根因是**两个 token 各自都对、拼起来必错**——
 * 三个 accent 都是亮色且不随主题翻转，fg-*／bg-* 却跟着主题翻（暗近白、浅近黑），
 * 所以"亮色实底 + 任一文本 token"必然在某个主题上过不了 AA。修法不是逐处挑颜色，
 * 是给这类底色一个**不翻转的前景 token**（`--nexus-color-accent-fg`），并让这门钉住配对结果。
 *
 * 只管**实底**（`bg-accent-2`），不管带透明度的底（`bg-danger/10`）：那类的真底色是
 * "10% 危险色 + 80% 表面"的混合，按实底算会得到 1:1 这种荒谬数。带透明度的那些交给浏览器里
 * 的 axe（`e2e/a11y-internal.spec.ts`），这里不假装算得出。
 */
describe('强调面上的文字（§90 无障碍 · 同串底色+文字 ≥4.5）', () => {
  const SATURATED = ['brand', 'accent-1', 'accent-2', 'danger', 'warn', 'success', 'info'] as const;
  const TEXT_TOKEN = /^(text-(fg-[123]|bg-[0-3]|white|brand-fg|accent-[12]|accent-fg|danger|warn|success|info))$/;
  const dark = colorsOf(':root {');
  const light = colorsOf(':root {', "[data-nexus-theme='light'] {");

  /** 把 tokens.css 的十六进制按 Tailwind 的用法映射成类名 → 值（浅色主题另算一份）。 */
  function valueOf(colors: Map<string, string>, cls: string): string | null {
    const name = cls.replace(/^text-/, '').replace(/^bg-/, '');
    return colors.get(`--nexus-color-${name}`) ?? null;
  }

  const pairs: Array<{ file: string; line: number; bg: string; fg: string }> = [];
  for (const file of tsxFiles(SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // 只看引号里的单条串：一行里 `a ? 'bg-x text-y' : 'bg-z'` 是两种状态，跨串配对是假的
      for (const m of line.matchAll(/['"`]([^'"`\n]{0,400})['"`]/g)) {
        const cls = m[1]!.split(/\s+/);
        const bgs = cls.filter((c) => /^bg-[a-z0-9-]+$/.test(c) && (SATURATED as readonly string[]).includes(c.slice(3)));
        const fgs = cls.filter((c) => TEXT_TOKEN.test(c));
        for (const bg of bgs) for (const fg of fgs) pairs.push({ file: relative(process.cwd(), file), line: i + 1, bg, fg });
      }
    });
  }

  it('扫到了配对，否则这道门是空的（token 改名或类名写法变了都会让它静默失效）', () => {
    expect(pairs.length, '一条"实底强调面 + 文本 token"的同串配对都没扫到').toBeGreaterThan(0);
    expect(pairs.some((p) => p.fg === 'text-accent-fg')).toBe(true);
  });

  it('暗色主题（产品当前唯一渲染的那一套）下每条配对都过 4.5', () => {
    const bad: string[] = [];
    for (const p of pairs) {
      const bg = valueOf(dark, p.bg);
      const fg = valueOf(dark, p.fg);
      if (!bg || !fg) continue; // 不是本文件定义的色（例如 text-inherit），交给浏览器判
      const ratio = contrast(fg, bg);
      if (ratio < 4.5) bad.push(`${p.file}:${p.line} ${p.fg} #${fg} 压在 ${p.bg} #${bg} 上 = ${ratio.toFixed(2)}`);
    }
    expect(bad, `暗色下不过 AA 的有 ${bad.length} 处：\n${bad.slice(0, 12).join('\n')}`).toEqual([]);
  });

  it('accent-fg 这个前景 token 存在的理由就是不随主题翻转：它在两个主题下对每个强调面都过 4.5', () => {
    for (const [label, colors] of [['暗色', dark], ['浅色', light]] as const) {
      const fg = colors.get('--nexus-color-accent-fg');
      expect(fg, 'tokens.css 里没有 --nexus-color-accent-fg').toBeTruthy();
      for (const name of SATURATED) {
        const bg = colors.get(`--nexus-color-${name}`);
        if (!bg) continue;
        const ratio = contrast(fg!, bg);
        expect(ratio, `${label}：accent-fg #${fg} 对 ${name} #${bg} 只有 ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('验电：改之前的写法必须不及格，否则上面那道门是摆设', () => {
    // 2026-10-28 第四片首跑红出来的那一条（暗色 fg-1 压 accent-2）
    expect(contrast(dark.get('--nexus-color-fg-1')!, dark.get('--nexus-color-accent-2')!)).toBeLessThan(4.5);
    // 而"用 bg-0 当文字色"在浅色主题下同样会坏——这正是它不该被当前景用的原因
    expect(contrast(light.get('--nexus-color-bg-0')!, light.get('--nexus-color-accent-2')!)).toBeLessThan(4.5);
    // 曾经有个 --nexus-color-brand-fg 是 #ffffff，白字压 brand 只有 4.17：
    // 曾经有个 --nexus-color-brand-fg 是 #ffffff，白字压 brand 只有 4.17：
    // 它看着像"品牌面的专用前景"却是错的，所以被 accent-fg 取代并删掉。
    expect(contrast('ffffff', dark.get('--nexus-color-brand')!)).toBeLessThan(4.5);
  });
});
