import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §A11Y-1 公开门面**高对比度可访问性**的静态那一寸（零浏览器、零真库、零时钟）。
 *
 * 真问题（跨 UA 加固，措辞经真浏览器证伪后收紧）：FE-1~FE-8 全部门面片都用
 * `color: transparent` + `background-clip: text` 做渐变墨字标题（`.dv-title`/`.mk-title`/
 * `.hp-heroTitle`/`.se-title`/`.pf-name`/`.pb-title`/`.pp-title`/`.ss-title` 共 8 个）。
 * **诚实读数**：真 Chrome 实测（`e2e/forced-colors-probe.mjs`）在 `forced-colors: active` 下
 * 会**内建保护**——把 `color:transparent` 强制成系统前景色、把渐变 `background-image` 清成 none，
 * 所以"Chrome 高对比度下标题变空白字"**并不成立，不夸大**。真正残留的是 `background-clip:text`
 * 没有回落；Chrome 兜住了 color/bg，但其它 UA / 用户自定义高对比度主题不保证同等保护，
 * `clip:text` 残留是跨 UA 的可见性隐患。本片因此做**防御性加固**，而非声称修了一个 Chrome 已自愈的洞。
 *
 * 本片不改任何一行的常规（浅/深）视觉，只加一条 `@media (forced-colors: active)` 回退：
 * 显式把 8 个标题的 `background-clip` 回落 `border-box`、`background` 清空、`color` 设为 CSS
 * **系统色**（`CanvasText`）、并声明 `forced-color-adjust:auto`。系统色关键字零 hex、零
 * `var(--nexus-*)` token——双主题 token 不覆盖用户自定义高对比度配色，系统色才能自动适配。
 * 真浏览器那一寸（`e2e/forced-colors.spec.ts`）A/B 对照测的正是 `clip:text→border-box` 这个
 * 唯一可区分的差异，不测已被 Chrome 强制兜住的 color。
 *
 * 判据设计成**动态发现**而非硬编码 8 个类名：从 globals.css 源码里扫出所有
 * `color: transparent` + `background-clip: text` 的类，要求它们**每一个**都在 forced-colors
 * 块里有可读回退。这样将来任何人新增一个渐变墨字标题却忘了加回退，判据会自动抓到
 * ——守的是"所有透明字标题都必须有高对比度兜底"这条不变式，而非 8 个名字的快照。
 *
 * 真浏览器那一寸归 `e2e/forced-colors.spec.ts`（`emulateMedia({ forcedColors: 'active' })`）。
 */
const ROOT = process.cwd();
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const globals = readFileSync(GLOBALS, 'utf8');

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
const clean = cssNoComments(globals);

/** 把 CSS 切成 `{ selector, decls, at }` 规则块（含多行声明）。 */
function ruleBlocks(css: string): Array<{ selector: string; decls: string; at: number }> {
  const out: Array<{ selector: string; decls: string; at: number }> = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1]!.trim(), decls: m[2]!, at: m.index! });
  }
  return out;
}

/** 所有"透明字渐变墨字"类：声明里同时含 background-clip:text 与 color:transparent。 */
function gradientInkClasses(css: string): string[] {
  const out = new Set<string>();
  for (const { selector, decls } of ruleBlocks(css)) {
    if (/\bcolor:\s*transparent\b/.test(decls) && /background-clip:\s*text/.test(decls)) {
      for (const m of selector.matchAll(/\.([A-Za-z][\w-]*)/g)) out.add(m[1]!);
    }
  }
  return [...out].sort();
}

/** @media (forced-colors: active) 块体内的规则。 */
function forcedColorsRules(css: string): Array<{ selector: string; decls: string }> {
  const blocks: Array<{ selector: string; decls: string }> = [];
  // 按**括号深度**扫 media 块，不用正则：layer 内 media 的规则闭合 `    }` 与 media 自身
  // 闭合 `  }` 都带缩进，`\n\s*\}` 非贪婪会在内层规则处提前截断、body 丢掉尾部 `}`，
  // ruleBlocks 就切不出完整规则（FE-6 同类教训：块边界必须按深度配平，不能靠缩进猜）。
  let from = 0;
  for (;;) {
    const start = css.indexOf('@media (forced-colors: active)', from);
    if (start < 0) break;
    const braceStart = css.indexOf('{', start);
    if (braceStart < 0) break;
    let depth = 0;
    let end = braceStart;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    for (const { selector, decls } of ruleBlocks(css.slice(braceStart + 1, end))) {
      blocks.push({ selector, decls });
    }
    from = end + 1;
  }
  return blocks;
}

/**
 * 按**括号深度**取出第一个 `@media (forced-colors: active)` 块的完整文本（含首尾 `{` `}`）。
 * 修实（FE-19 / §CRIT-4）：本门原来的"回退块零 hex / 零 token / 常规视觉不变"三处判定用的是
 * `clean.slice(块起点)`（裸取到 EOF）与非贪婪 `\n\s*\}`（会在内层规则闭合处提前截断）——
 * 前者把后续新插的段（FE-19 `.sp-` 段的 `var(--nexus-*)`）误算进 forced-colors 块触发假红，
 * 后者删不干净整块。正确范式是按深度配平取**块本身**，段头/后续插段怎么变都不误吞
 * （承 forcedColorsRules 已在用的深度扫描、FE-16 §CRIT-1 段边界修实纪律）。
 */
function forcedColorsBlock(css: string): string {
  const start = css.search(/@media\s*\(forced-colors:\s*active\)/);
  if (start < 0) return '';
  const braceStart = css.indexOf('{', start);
  if (braceStart < 0) return '';
  let depth = 0;
  for (let end = braceStart; end < css.length; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}') {
      depth--;
      if (depth === 0) return css.slice(start, end + 1);
    }
  }
  return ''; // 括号不配平：宁可判空让"缺 forced 块"的门去红，也不把后续段误吞进来
}

const inkClasses = gradientInkClasses(clean);
const fcRules = forcedColorsRules(clean);
const forcedBlock = forcedColorsBlock(clean);

/** 某个类在 forced-colors 块里的合并声明（支持多类共用一个选择器组）。 */
function declsFor(cssClass: string): string {
  let decls = '';
  for (const rule of fcRules) {
    const names = [...rule.selector.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]!);
    if (names.includes(cssClass)) decls += `\n${rule.decls}`;
  }
  return decls;
}

describe('§A11Y-1 渐变墨字高对比度回退（静态不变式）', () => {
  it('动态发现到成规模的渐变墨字标题（≥8，FE-1~FE-8 全部门面片）', () => {
    expect(inkClasses.length, '一个渐变墨字类都没扫到，判据是空的').toBeGreaterThanOrEqual(8);
    // 逐一点名当前 8 个，防止"扫到的是别的透明字元素"这类漂移
    for (const expected of ['dv-title', 'mk-title', 'hp-heroTitle', 'se-title', 'pf-name', 'pb-title', 'pp-title', 'ss-title']) {
      expect(inkClasses, `少了渐变墨字类 .${expected}`).toContain(expected);
    }
  });

  it('每个渐变墨字类在 @media (forced-colors: active) 里都有回退（不变式：一个都不能漏）', () => {
    expect(fcRules.length, 'globals.css 没有 forced-colors 块').toBeGreaterThan(0);
    const missing = inkClasses.filter((c) => !declsFor(c));
    expect(missing, `这些透明字标题在高对比度下会消失，却没加回退：${missing.join(', ')}`).toEqual([]);
  });

  it('回退把 color 设为系统色而非 transparent（跨 UA 高对比度配色下仍可读）', () => {
    const offenders: string[] = [];
    for (const c of inkClasses) {
      const d = declsFor(c);
      if (!/\bcolor:\s*(CanvasText|Canvas|HighlightText|WindowText|currentColor)\b/i.test(d)) offenders.push(`${c}: 无系统色 color 回退`);
      else if (/\bcolor:\s*transparent\b/.test(d)) offenders.push(`${c}: 回退仍是 transparent`);
    }
    expect(offenders, `这些标题在高对比度下有透明字风险（Chrome 已兜住，但跨 UA 不保证）：\n${offenders.join('\n')}`).toEqual([]);
  });

  it('回退无效化透明字裁剪（background-clip 回落、background 清空）', () => {
    const offenders: string[] = [];
    for (const c of inkClasses) {
      const d = declsFor(c);
      if (/\b-webkit-background-clip:\s*text\b/.test(d) || /\bbackground-clip:\s*text\b(?!\s*;?[\s\S]*background-clip:\s*border-box)/.test(d)) {
        offenders.push(`${c}: forced 态 background-clip 仍残留 text（未回落 border-box）`);
      }
      if (!/\bbackground(-color)?:\s*(none|Canvas|transparent)\b/i.test(d)) {
        offenders.push(`${c}: forced 态没清空渐变背景`);
      }
    }
    expect(offenders, `forced 态透明字裁剪未回落（Chrome 已兜住 color/bg，但 clip 残留是跨 UA 隐患）：\n${offenders.join('\n')}`).toEqual([]);
  });

  it('回退块零写死 hex（CSS 系统色关键字，不是新颜色）', () => {
    // 锚按深度配平的 forcedBlock 本身（FE-19/§CRIT-4 修实）：注释里的示例 hex 不算，
    // 后续新插段（FE-19 .sp-）也不再被误算进来；块内真出现 hex 仍会抓（变异臂验过）。
    const hex = [...forcedBlock.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `forced-colors 块出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('回退块零 var(--nexus-*) token（用 CSS 系统色自动适配用户对比度偏好）', () => {
    const vars = [...forcedBlock.matchAll(/var\(--nexus-[a-z0-9-]+/g)].map((m) => m[0]);
    expect(vars, `forced-colors 块引用了 nexus token（双主题 token 不覆盖用户自定义高对比度主题）：${[...new Set(vars)].join(', ')}`).toEqual([]);
  });

  it('回退块显式声明 forced-color-adjust（表达"交给系统配色"的意图，不是漏配）', () => {
    const allDecls = fcRules.map((r) => r.decls).join('\n');
    expect(allDecls, 'forced-colors 块缺 forced-color-adjust 显式声明').toMatch(/forced-color-adjust:\s*auto/);
  });

  it('常规（非 forced）渐变墨字视觉一字未动：仍是 transparent 字 + clip（本片只加高对比度兜底）', () => {
    // 用深度配平的 forcedBlock 精确剔除整块（FE-19/§CRIT-4 修实）：原非贪婪 `\n\s*\}` 会在
    // 内层规则 `    }` 处提前截断、删不干净，且依赖缩进猜测；换成块本身做字面替换更稳。
    const prod = forcedBlock ? clean.replace(forcedBlock, '') : clean;
    const inkInProd = gradientInkClasses(prod);
    expect(inkInProd.sort(), '常规态渐变墨字被改动了（A11Y-1 只应加 forced 回退，不碰常规视觉）').toEqual(inkClasses);
  });

  it('globals.css 块注释定界符严格配对（堵注释提前闭合导致真编译挂的洞）', () => {
    const OPEN = String.fromCharCode(47, 42);
    const CLOSE = String.fromCharCode(42, 47);
    let inside = false;
    let strayOpen = 0;
    let strayClose = 0;
    for (let i = 0; i < globals.length; i++) {
      if (!inside && globals.startsWith(OPEN, i)) { inside = true; i++; }
      else if (inside && globals.startsWith(CLOSE, i)) { inside = false; i++; }
      else if (!inside && globals.startsWith(CLOSE, i)) strayClose++;
    }
    if (inside) strayOpen++;
    expect({ strayOpen, strayClose }, 'globals.css 有孤立定界符或注释未闭合').toEqual({ strayOpen: 0, strayClose: 0 });
  });
});
