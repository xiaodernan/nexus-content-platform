import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-9 根 404 门面 `/not-found.tsx` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端）。
 *
 * 缺口（改前）：项目 9 个 page.tsx 里十余处页面级 `notFound()`（来自 next/navigation）加上
 * 所有 unmatched URL，全部落到 Next.js **内建裸 404**——一色字、零品牌、零去处、零主题门面。
 * 它是访客走岔路时的落点，却是全站唯一没有任何 chrome 的公开门面。根 `app/not-found.tsx`
 * 同时覆盖 `notFound()` 与 unmatched URL，并继承 root layout 的 data-nexus-theme 双主题。
 *
 * FE-9 只动视觉（`.nf-` 语义类）+ 补一个诚实 404 门面文案，**零行为**：不读数据、不碰后端、
 * 不接 server action、不改任何路由/状态（§159 / ADR-0123 六红线 / ADR-0148 完成度口径诚实）。
 * 404 文案必须说清"这个地址没有内容"、列出可能原因，且**不臆断**是哪一种（不替访客猜）。
 *
 * 复用 FE-4~FE-8 沉淀的静态判据骨架（先红→绿→变异臂有牙），把"不依赖渲染也能确定"的
 * 部分钉死——恰是本机多 agent 抢资源下真浏览器 e2e 会被 SIGTERM 吃掉时仍能守住的那一寸：
 *
 *  1. 类名闭环：page 每个 `nf-*` 类在 globals.css 有 `.nf-*` **基础定义**（只认基础选择器、
 *     整段剔 reduced-motion，堵 FE-5 变异臂 A 的"出现过≠定义过"洞）；
 *  2. 成规模视觉段；3. 零写死 hex；4. token 真存在且**零新增颜色 token**；
 *  5. 404 结构/判据钩子一个不丢；6. 诚实 404 文案（不臆断）+ 干净去处链接；
 *  7. **纯展示零行为**（无 'use client' / hook / fetch / server action / params）；
 *  8. 动效被 prefers-reduced-motion 真正关掉；9. 交互链接有 :focus-visible；
 *  10. 渐变墨字层优先级 + transparent/color:transparent 本体；
 *  11. **forced-colors 联动**：所有 nf 渐变墨字类在 forced-colors 块有系统色回退；
 *  12. 注释定界符严格配对（FE-6 真编译挂的洞）。
 *
 * 浏览器那一寸归 `e2e/not-found-visual.spec.ts`（死 URL 触发，不依赖后端数据）；
 * 无障碍/互动归既有 `a11y-*` / `interactive-work.spec.ts`。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/not-found.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 去掉 JSDoc 后的**真实代码**——文案门 / 零行为门 / 结构钩子门一律锚它，不锚整份文件。
 * 变异臂 A 验出的洞：注释里写了"不替访客猜"，删掉正文诚实旁注后正则仍命中注释而假绿。
 * 判据守的是"渲染出来的文案与代码"，不是"文件里含某个词"——注释不得喂绿任何一道门。
 */
const code = cssNoComments(page);

function nfRules(css: string): string[] {
  return cssNoComments(css)
    .split('\n')
    .filter((line) => /\.nf-[A-Za-z]/.test(line));
}

function pageNfClasses(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/["'`]([^"'`\n]*\bnf-[A-Za-z0-9-]+[^"'`\n]*)["'`]/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (/\bnf-[A-Za-z0-9-]+/.test(cls)) found.add(cls.replace(/[^\w-].*$/, ''));
    }
  }
  return [...found].sort();
}

/** 按括号深度剥掉某个 @media 整块（FE-6 教训：块边界不能靠缩进猜）。 */
function stripMedia(css: string, query: string): string {
  let s = css;
  for (;;) {
    const start = s.indexOf(query);
    if (start < 0) break;
    const braceStart = s.indexOf('{', start);
    if (braceStart < 0) break;
    let depth = 0;
    let end = braceStart;
    for (; end < s.length; end++) {
      if (s[end] === '{') depth++;
      else if (s[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    s = s.slice(0, start) + s.slice(end + 1);
  }
  return s;
}

/** globals.css 里有基础规则体的 `.nf-` 主类名（剔 reduced-motion、只认基础选择器）。 */
function definedNfClasses(css: string): Set<string> {
  const clean = stripMedia(cssNoComments(css), '@media (prefers-reduced-motion: reduce)');
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(nf-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
      const tail = line.slice(m.index! + m[0]!.length).trimStart();
      if (/^[{,]/.test(tail)) out.add(m[1]!);
    }
  }
  return out;
}

function definedTokens(css: string): Set<string> {
  return new Set([...cssNoComments(css).matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

/** CSS 切成 `{ selector, decls }` 规则块（含多行声明）。 */
function ruleBlocks(css: string): Array<{ selector: string; decls: string }> {
  const out: Array<{ selector: string; decls: string }> = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1]!, decls: m[2]! });
  return out;
}

/** `.nf-` 视觉段完整文本：从第一个 `.nf-` 到 forced-colors 块之前（含 reduced-motion，不含 forced 回退）。 */
const nfSegment = (() => {
  // 注释允许出现 ".nf-"——只需要找**不是被注释包裹**的首个 `.nf-`；raw 用作边界切点、clean 用作测试内容。
  const bannerStart = ((): number => {
    for (let m = /\.nf-/g.exec(globals) as RegExpExecArray | null; m; m = /\.nf-/g.exec(globals)) {
      const comments = [...globals.matchAll(/\/\*[\s\S]*?\*\//g)];
      if (!comments.some((c) => m.index! >= (c.index ?? 0) && m.index! < (c.index ?? 0) + c[0].length)) return m.index!;
    }
    return -1;
  })();
  if (bannerStart < 0) return '';
  const nextBanner = globals.indexOf('/* ── §', bannerStart + 1);
  const raw = nextBanner > bannerStart ? globals.slice(bannerStart, nextBanner) : globals.slice(bannerStart);
  return cssNoComments(raw).replace(/\n\}\s*$/, '\n');
})();

const nfRuleLines = nfRules(globals).join('\n');
const nfReducedMotionBody = (() => {
  const clean = cssNoComments(globals);
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = clean.indexOf('@media (prefers-reduced-motion: reduce)', from);
    if (start < 0) break;
    const braceStart = clean.indexOf('{', start);
    if (braceStart < 0) break;
    let depth = 0;
    let end = braceStart;
    for (; end < clean.length; end++) {
      if (clean[end] === '{') depth++;
      else if (clean[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = clean.slice(braceStart + 1, end);
    if (/\.nf-/.test(body)) out.push(body);
    from = end + 1;
  }
  return out.join('\n');
})();

/** 所有"透明字渐变墨字"类（动态发现，守不变式而非名字快照）。 */
function gradientInkClasses(css: string): string[] {
  const out = new Set<string>();
  for (const { selector, decls } of ruleBlocks(css)) {
    if (/\bcolor:\s*transparent\b/.test(decls) && /background-clip:\s*text/.test(decls)) {
      for (const m of selector.matchAll(/\.(nf-[A-Za-z][\w-]*)/g)) out.add(m[1]!);
    }
  }
  return [...out].sort();
}

/** @media (forced-colors: active) 块内的规则（按深度，复用 A11Y-1 范式）。 */
function forcedColorsRules(css: string): Array<{ selector: string; decls: string }> {
  const blocks: Array<{ selector: string; decls: string }> = [];
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
    for (const { selector, decls } of ruleBlocks(css.slice(braceStart + 1, end))) blocks.push({ selector, decls });
    from = end + 1;
  }
  return blocks;
}

const nfInkClasses = gradientInkClasses(cssNoComments(globals));
const fcRules = forcedColorsRules(cssNoComments(globals));

function nfForcedDecls(cssClass: string): string {
  let decls = '';
  for (const rule of fcRules) {
    const names = [...rule.selector.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]!);
    if (names.includes(cssClass)) decls += `\n${rule.decls}`;
  }
  return decls;
}

describe('§FE-9 根 404 门面（静态不变式）', () => {
  it('not-found.tsx 用了 .nf- 语义类，且全部在 globals.css 有基础定义（拼错不静默失效）', () => {
    const used = pageNfClasses(code);
    expect(used.length, 'not-found.tsx 一个 nf- 类都没有，门面没接上').toBeGreaterThan(8);
    const defined = definedNfClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 nf- 类在 page 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .nf- 视觉段（不是空壳）', () => {
    expect(definedNfClasses(globals).size, '.nf- 定义太少，FE-9 门面升级没落地').toBeGreaterThanOrEqual(12);
  });

  it('.nf- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界，扫整段含续行）', () => {
    const hex = [...nfSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.nf- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.nf- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（扫整段含续行）', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of nfSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.nf- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('.nf- 段零新增颜色 token（只引用既有双主题 token，不另立 --nexus-color-*）', () => {
    const newlyDefined = [...nfSegment.matchAll(/(--nexus-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect([...new Set(newlyDefined)], `.nf- 段定义了新颜色 token（ADR-0123 零新增红线）：${[...new Set(newlyDefined)].join(', ')}`).toEqual([]);
  });

  it('404 结构/判据钩子一个不丢（e2e 与 a11y 靠它们定位，丢了就是纯裸 404）', () => {
    const expected = [
      'data-not-found',
      'data-not-found-code',
      'data-not-found-title',
      'data-not-found-detail',
      'data-not-found-actions',
      'data-not-found-honesty',
    ];
    const missing = expected.filter((h) => !code.includes(h));
    expect(missing, `结构/判据钩子丢了：${missing.join(', ')}`).toEqual([]);
  });

  it('守住 404 诚实边界：说清"没有内容"、列出可能原因、且不臆断是哪一种', () => {
    expect(code, '没说清这个地址没有内容').toMatch(/没有内容|找不到|不存在/);
    expect(code, '没列出可能原因（失效/撤下/拼错）').toMatch(/失效|撤下|拼错|拼写/);
    expect(code, '缺"不替访客猜"的诚实旁注（ADR-0148 完成度口径诚实）').toMatch(/不会替|不替|不猜|无法确认|不确定是哪/);
  });

  it('给访客干净去处：回首页与去发现页两个链接（不指向会 502 的后端路径）', () => {
    expect(code, '缺回首页链接').toMatch(/href=["']\/["']/);
    expect(code, '缺去发现页链接（/discover 恒 200 的干净落点）').toMatch(/href=["']\/discover["']/);
    const homeTags = [...code.matchAll(/className="([^"]*\bnf-home\b[^"]*)"/g)].map((m) => m[1]!);
    const discoverTags = [...code.matchAll(/className="([^"]*\bnf-discover\b[^"]*)"/g)].map((m) => m[1]!);
    expect(homeTags.length, '找不到 nf-home 链接').toBeGreaterThan(0);
    expect(discoverTags.length, '找不到 nf-discover 链接').toBeGreaterThan(0);
  });

  it('纯展示零行为：不是 client 组件、无 hook / fetch / server action / params（Next 根 not-found 约定）', () => {
    expect(code, "根 404 不该是 'use client'（零行为）").not.toMatch(/['"]use client['"]/);
    expect(code, '混进了 React hook（零行为）').not.toMatch(/\buse(State|Effect|Reducer|Memo|Callback|Ref|Transition)\s*\(/);
    expect(code, '混进了 fetch / server action（零行为，不碰后端）').not.toMatch(/\bfetch\s*\(|['"]use server['"]|from\s+['"]@\/server\//);
    expect(code, '混进了路由读路径（零行为）').not.toMatch(/\bnotFound\s*\(|getPublishedPage|cookies\s*\(|headers\s*\(/);
    expect(code, '缺 default export（Next 根 not-found 必须是默认导出）').toMatch(/export default function NotFound\s*\(\s*\)/);
  });

  it('用了动效的 .nf- 类都被 prefers-reduced-motion 在同一批规则里真正关掉', () => {
    expect(nfReducedMotionBody, 'nf- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    const base = (s: string) => s.replace(/:(hover|focus-visible|active|before|after).*$/, '');
    const nfNames = (sel: string) => [...sel.matchAll(/\.(nf-[A-Za-z0-9-]+)/g)].map((m) => base(m[1]!));

    const prodCss = stripMedia(nfSegment, '@media (prefers-reduced-motion: reduce)');
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    const hasTransform = (d: string) => /(?<![-\w])transform\s*:/.test(d);
    const transformNone = (d: string) => /(?<![-\w])transform\s*:\s*none/.test(d);
    for (const { selector, decls } of blocks) {
      const names = nfNames(selector);
      if (/animation:/.test(decls)) { for (const n of names) { transitioned.add(n); transformed.add(n); } }
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (hasTransform(decls) && !transformNone(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size, '没扫到任何 nf- transition 动效源，这道门是空的').toBeGreaterThan(0);

    const rmBlocks = ruleBlocks(nfReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of nfNames(selector)) {
        if (/transition:\s*none/.test(decls)) transitionShut.add(n);
        if (transformNone(decls)) transformShut.add(n);
      }
    }
    const transNotShut = [...transitioned].filter((c) => !transitionShut.has(c));
    expect(transNotShut, `这些类的 transition 没被 transition:none 真正关掉：${transNotShut.join(', ')}`).toEqual([]);
    const tfNotShut = [...transformed].filter((c) => !transformShut.has(c));
    expect(tfNotShut, `这些类的 transform 没被 transform:none 真正关掉：${tfNotShut.join(', ')}`).toEqual([]);
  });

  it('交互控件（回首页 / 去发现页链接）都有 :focus-visible 键盘描边', () => {
    expect(nfRuleLines, 'nf-home 缺 :focus-visible').toMatch(/\.nf-home:focus-visible/);
    expect(nfRuleLines, 'nf-discover 缺 :focus-visible').toMatch(/\.nf-discover:focus-visible/);
  });

  it('渐变墨字 .nf-code / .nf-title 是 transparent 字 + clip，且不被更高层 Tailwind 颜色 utility 覆盖（FE-6 真 bug 固化）', () => {
    expect(nfInkClasses, '没扫到 nf- 渐变墨字类，本门是空的').toEqual(expect.arrayContaining(['nf-code', 'nf-title']));
    const inkTags = [...code.matchAll(/className="([^"]*\bnf-(?:code|title)\b[^"]*)"/g)].map((m) => m[1]!);
    expect(inkTags.length, 'page 找不到 nf-code / nf-title').toBeGreaterThan(0);
    const colorUtility = /\btext-(fg|accent|brand|warn|bg)-\d/;
    const offenders = inkTags.filter((cls) => colorUtility.test(cls));
    expect(offenders, `渐变墨字挂了会覆盖它的颜色 utility：${offenders.join(' | ')}`).toEqual([]);
    for (const name of ['nf-code', 'nf-title']) {
      const block = nfSegment.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(block, `.${name} 基础规则找不到`).toBeTruthy();
      expect(block, `.${name} 未用 transparent 字实现渐变墨字`).toMatch(/color:\s*transparent/);
      expect(block, `.${name} 缺 background-clip:text`).toMatch(/background-clip:\s*text/);
    }
  });

  it('forced-colors 联动：每个 nf 渐变墨字类在 forced-colors 块都有系统色回退（A11Y-1 动态不变式）', () => {
    expect(fcRules.length, 'globals.css 没有 forced-colors 块').toBeGreaterThan(0);
    const missing = nfInkClasses.filter((c) => !nfForcedDecls(c));
    expect(missing, `这些 nf 透明字标题在高对比度下会消失，却没加回退：${missing.join(', ')}`).toEqual([]);
    for (const c of nfInkClasses) {
      const d = nfForcedDecls(c);
      if (!/\bcolor:\s*(CanvasText|Canvas|HighlightText|WindowText|currentColor)\b/i.test(d)) {
        throw new Error(`.${c} forced 态无系统色 color 回退`);
      }
      if (/\b(background-clip|-webkit-background-clip):\s*text\b/.test(d) && !/background-clip:\s*border-box/.test(d)) {
        throw new Error(`.${c} forced 态 background-clip 未回落 border-box`);
      }
      if (!/\bforced-color-adjust:\s*auto/.test(d)) throw new Error(`.${c} forced 态缺 forced-color-adjust:auto`);
    }
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
