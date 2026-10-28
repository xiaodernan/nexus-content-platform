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

  /**
   * 把 tokens.css 的十六进制按 Tailwind 的用法映射成类名 → 值（主题由调用方给）。
   *
   * 返回 null 只有一种诚实的情况：这个名字压根不是 `--nexus-color-*`，例如 `text-white`
   * 是 Tailwind 的内建色，不归这份文件管——那种交给浏览器里的 axe 判。
   * 名字在 tokens.css 里却查不到值，就是这道门在骗人，所以那种情况直接红。
   */
  function valueOf(colors: Map<string, string>, cls: string): string | null {
    const name = cls.startsWith('text-') ? cls.slice(5) : cls.startsWith('bg-') ? cls.slice(3) : null;
    if (name === null) return null;
    const key = `--nexus-color-${name}`;
    if (!defined.has(key)) return null;
    const value = colors.get(key);
    expect(value, `${key} 在 tokens.css 里有声明，colorsOf 却没读到——门在假装看过它`).toBeTruthy();
    return value ?? null;
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

  for (const [label, colors] of [['暗色', dark], ['浅色', light]] as const) {
    it(`${label}主题（浅色那套还没浏览器门覆盖，见 §90 技术债）下每条配对都过 4.5`, () => {
      const bad: string[] = [];
      for (const p of pairs) {
        const bg = valueOf(colors, p.bg);
        const fg = valueOf(colors, p.fg);
        if (!bg || !fg) continue; // 不是 tokens.css 管的色（例如 text-white），交给浏览器判
        const ratio = contrast(fg, bg);
        if (ratio < 4.5) bad.push(`${p.file}:${p.line} ${p.fg} #${fg} 压在 ${p.bg} #${bg} 上 = ${ratio.toFixed(2)}`);
      }
      expect(bad, `${label}下不过 AA 的有 ${bad.length} 处：\n${bad.slice(0, 12).join('\n')}`).toEqual([]);
    });
  }

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
    // 它看着像"品牌面的专用前景"却是错的，所以被 accent-fg 取代并删掉。
    expect(contrast('ffffff', dark.get('--nexus-color-brand')!)).toBeLessThan(4.5);
    // 2026-10-28 的第二次验电：这道门曾经**绿着漏掉 22 处**。valueOf 用两次 replace 剥前缀，
    // text-bg-0 被剥成 "0"，查不到值就走了那条"不是本文件的色"的 continue——跳过得无声无息。
    // 所以名字在 tokens.css 里就必须解析得出值（上面 valueOf 里那条 expect），
    // 而下面这两条钉住解析器的边界：token 名要解析，Tailwind 内建色才允许返回 null。
    expect(valueOf(light, 'text-bg-0')).toBe('f7f8fb');
    expect(valueOf(dark, 'bg-brand')).toBe('5b6cff');
    expect(valueOf(light, 'text-white')).toBeNull();
    // 浅色下那 22 处的实际读数：改之前最低 1.91，改之后 accent-fg 对同一批底色全过
    expect(contrast(light.get('--nexus-color-bg-0')!, light.get('--nexus-color-warn')!)).toBeLessThan(4.5);
    expect(contrast(light.get('--nexus-color-bg-0')!, light.get('--nexus-color-brand')!)).toBeLessThan(4.5);
  });
});

/**
 * 把强调色**当文字**用（`text-accent-2` 这类）是同一枚硬币的另一面。
 *
 * 上一道门管的是"强调色当底"，这一道管"强调色当字"。根因还是那个：三个强调色不随主题翻，
 * 而它们脚下的表面翻。暗色下 cyan #22d3ee 压近黑有 8.66，浅色下同一个 cyan 压近白只剩 **1.46**
 * ——不是差一点，是完全读不出来。全站这个写法有 194 处（accent-2 85 / danger 73 / warn 36）。
 *
 * 这一条今天**不判红**，理由要写清楚：产品里没有任何地方把 `data-nexus-theme` 设成 `dark`
 * 以外的值（`apps/web/src/app/layout.tsx` 钉死），浅色是一套**跑不到**的主题。
 * 但"跑不到"是今天的状态，不是门禁可以永久豁免的理由——所以这道门自己去源码里查那个前提，
 * **入口一出现，它当场变成硬门**。这样这笔账不会靠一行注释躺在文档里等人想起。
 */
describe('强调色当文字（§90 无障碍 · 浅色主题的钱先记着，入口一出现就收）', () => {
  const AS_TEXT = ['accent-2', 'danger', 'warn'] as const;
  const dark = colorsOf(':root {');
  const light = colorsOf(':root {', "[data-nexus-theme='light'] {");

  /** 能把主题写到 dark 以外的地方——一处都没有，就说明浅色没有入口。 */
  function lightThemeWriters(): string[] {
    const writers: string[] = [];
    for (const file of tsxFiles(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!line.includes('data-nexus-theme')) return;
          if (!/data-nexus-theme\s*=\s*["']dark["']/.test(line)) {
            writers.push(`${relative(process.cwd(), file)}:${i + 1} ${line.trim().slice(0, 80)}`);
          }
        });
    }
    return writers;
  }

  /** 某个强调色当文字时，在四级表面上最差的那一档。 */
  function worstOn(colors: Map<string, string>, name: string): { level: string; ratio: number } {
    const rows = ['0', '1', '2', '3'].map((level) => ({
      level,
      ratio: contrast(colors.get(`--nexus-color-${name}`)!, colors.get(`--nexus-color-bg-${level}`)!),
    }));
    return rows.sort((a, b) => a.ratio - b.ratio)[0]!;
  }

  it('暗色（当前唯一跑得到的那套）下这三个色当文字，在四级表面上全过 4.5', () => {
    for (const name of AS_TEXT) {
      const w = worstOn(dark, name);
      expect(w.ratio, `暗色：text-${name} 压在 bg-${w.level} 上只有 ${w.ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('浅色的读数仍然不及格，且这道门自己盯着前提：入口一出现就变硬门', () => {
    const bad = AS_TEXT.map((name) => ({ name, ...worstOn(light, name) })).filter((r) => r.ratio < 4.5);
    const writers = lightThemeWriters();
    if (writers.length > 0) {
      expect(
        bad,
        `浅色主题有了入口（${writers.join(' ; ')}），这笔账当场变成硬缺陷：\n` +
          bad.map((r) => `text-${r.name} 压在 bg-${r.level} 上 = ${r.ratio.toFixed(2)}`).join('\n') +
          '\n修法是照 accent-fg 的样子给每个色一个会随主题翻的 -ink 前景 token。',
      ).toEqual([]);
      return;
    }
    // 前提还没变：浅色跑不到。这条断言钉的是"门还在看着这笔账"——
    // 若有人已经把它修好了，bad 会空掉而这里会红，那就该回头把上面那条硬门打开。
    expect(
      bad.length,
      '浅色下这三个色当文字**理应**仍不及格；若全过了，说明 -ink token 已落地，请把这道自查门改成硬门',
    ).toBeGreaterThan(0);
    expect(AS_TEXT.length).toBe(3); // 名单只有三个：多一个色被当文字用，就要在这里登记它的读数
  });
});
