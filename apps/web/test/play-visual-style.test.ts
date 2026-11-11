import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-7 公开试玩页 `/n/[handle]/[slug]/play` 视觉升级的**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 公开门面矩阵已升 discover / marketplace / home / search / profile(`/u/…`) / published(`/n/…`)；
 * 唯独缺**公开试玩页**——访客从作品页点"试玩"进来的第一张脸、游戏作品的核心体验落点。
 * 改前三个状态（无内容 / 读不出来 / 可玩）都是零语义前缀的裸 Tailwind：header 一条素边、
 * 标题纯色、pinned 说明贴边、空态/错误态一色字。FE-7 只动视觉（`.pp-` 类），
 * 结构/文案/`data-play-*` 钩子/读路径/三态分支/交互组件一字不改（§159 / ADR-0123 六红线）。
 *
 * 复用 FE-4/5/6 沉淀的静态判据骨架（先红→绿→变异臂有牙），把"不依赖渲染也能确定"的
 * 部分钉死——恰是本机多 agent 抢资源下真浏览器 e2e 会被 SIGTERM 吃掉时仍能守住的那一寸：
 *
 *  1. 类名闭环：page.tsx 每个 `pp-*` 类在 globals.css 有 `.pp-*` **基础定义**（只认后跟
 *     `{`/`,` 的基础选择器、整段剔 reduced-motion，堵 FE-5 变异臂 A 的"出现过≠定义过"洞）；
 *  2. 零写死 hex；3. token 真存在；4. 三态结构钩子一个不丢；
 *  5. 动效被 prefers-reduced-motion 按规则块真正关掉；6. 交互控件有 :focus-visible；
 *  7. 层优先级：渐变墨字 `.pp-title` 不被更高层 Tailwind 颜色 utility 覆盖（FE-6 真 bug 固化）；
 *  8. 注释定界符严格配对（FE-6 真编译挂的洞，用字符码构造定界符避自指）；
 *  9. **守住读路径与诚实三态**（FE-7 特有）：force-dynamic、getPublishedPage 复用、schema 校验、
 *     三态文案与钩子、PublicPlay/VisitMeter 交互组件、钉住版本说明——一个都不能被动。
 *
 * 浏览器那一寸归 `e2e/play-visual.spec.ts`；无障碍/互动归既有 `a11y-*` / `interactive-work.spec.ts`。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/n/[handle]/[slug]/play/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 去掉 JSDoc 后的**真实代码**——所有语义门（类名提取/结构钩子/读路径/诚实文案/层优先级）
 * 一律锚它，不锚含注释的 page 全文。纪律来源见 ADR-0154 / FE-9：变异臂证伪过一次假绿——
 * 删掉正文 `getPublishedPage(path)` 调用、只在 JSDoc 补同形字样，旧门锚 page 全文仍绿。
 * 判据守的是"真实代码里的调用与文案"，不是"文件里含某个词"。
 */
const code = cssNoComments(page);

function ppRules(css: string): string[] {
  return cssNoComments(css)
    .split('\n')
    .filter((line) => /\.pp-[A-Za-z]/.test(line));
}

function pagePpClasses(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/["'`]([^"'`\n]*\bpp-[A-Za-z0-9-]+[^"'`\n]*)["'`]/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (/\bpp-[A-Za-z0-9-]+/.test(cls)) found.add(cls.replace(/[^\w-].*$/, ''));
    }
  }
  return [...found].sort();
}

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

/** globals.css 里有基础规则体的 `.pp-` 主类名（剔 reduced-motion、只认基础选择器）。 */
function definedPpClasses(css: string): Set<string> {
  const clean = stripMedia(cssNoComments(css), '@media (prefers-reduced-motion: reduce)');
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(pp-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
      const tail = line.slice(m.index! + m[0]!.length).trimStart();
      if (/^[{,]/.test(tail)) out.add(m[1]!);
    }
  }
  return out;
}

function definedTokens(css: string): Set<string> {
  return new Set([...cssNoComments(css).matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

function mediaBlocks(css: string, query: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(query, from);
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
    out.push(css.slice(braceStart + 1, end));
    from = end + 1;
  }
  return out;
}

/** `.pp-` 段完整文本（含多行声明续行），到 layer 顶格闭合 `}` 为止。 */
const ppSegment = (() => {
  const clean = cssNoComments(globals);
  const start = clean.search(/\.pp-[A-Za-z]/);
  if (start < 0) return '';
  const out: string[] = [];
  for (const line of clean.slice(start).split('\n')) {
    if (/^}/.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
})();

/** 把 CSS 切成 `{ selector, decls }` 规则块（含多行声明）。 */
function ruleBlocks(css: string): Array<{ selector: string; decls: string }> {
  const out: Array<{ selector: string; decls: string }> = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1]!, decls: m[2]! });
  return out;
}

const ppRuleLines = ppRules(globals).join('\n');
const ppReducedMotionBody = mediaBlocks(
  cssNoComments(globals),
  '@media (prefers-reduced-motion: reduce)',
).find((body) => body.includes('.pp-'));

describe('§FE-7 公开试玩页视觉段（静态不变式）', () => {
  it('page.tsx 用了 .pp- 语义类，且全部在 globals.css 有基础定义（拼错不静默失效）', () => {
    const used = pagePpClasses(code);
    expect(used.length, 'page.tsx 一个 pp- 类都没有，视觉段没接上').toBeGreaterThan(8);
    const defined = definedPpClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 pp- 类在 page.tsx 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .pp- 视觉段（不是空壳）', () => {
    expect(definedPpClasses(globals).size, '.pp- 定义太少，FE-7 视觉升级没落地').toBeGreaterThanOrEqual(12);
  });

  it('.pp- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界，扫整段含续行）', () => {
    const hex = [...ppSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.pp- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.pp- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（扫整段含续行）', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of ppSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.pp- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('FE-7 只动视觉：公开试玩页 8 个 data-play-* 结构/判据钩子一个都不能丢', () => {
    const expected = [
      'data-play="none"',
      'data-play="broken"',
      'data-play="live"',
      'data-play-back',
      'data-play-title',
      'data-play-subtitle',
      'data-play-pinned',
      'data-play-issue',
      'data-play-issues',
    ];
    const missing = expected.filter((h) => !code.includes(h));
    expect(missing, `结构/判据钩子丢了（不是纯视觉片）：${missing.join(', ')}`).toEqual([]);
  });

  it('用了动效的 .pp- 类都被 prefers-reduced-motion 在同一条规则里真正关掉', () => {
    expect(ppReducedMotionBody, '.pp- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    const base = (s: string) => s.replace(/:(hover|focus-visible|active|before|after).*$/, '');
    const ppNames = (sel: string) => [...sel.matchAll(/\.(pp-[A-Za-z0-9-]+)/g)].map((m) => base(m[1]!));

    const prodCss = stripMedia(ppSegment, '@media (prefers-reduced-motion: reduce)');
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    const hasTransform = (d: string) => /(?<![-\w])transform\s*:/.test(d);
    const transformNone = (d: string) => /(?<![-\w])transform\s*:\s*none/.test(d);
    for (const { selector, decls } of blocks) {
      const names = ppNames(selector);
      if (/animation:/.test(decls)) { for (const n of names) { transitioned.add(n); transformed.add(n); } }
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (hasTransform(decls) && !transformNone(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size, '没扫到任何 .pp- transition 动效源，这道门是空的').toBeGreaterThan(0);

    const rmBlocks = ruleBlocks(ppReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of ppNames(selector)) {
        if (/transition:\s*none/.test(decls)) transitionShut.add(n);
        if (transformNone(decls)) transformShut.add(n);
      }
    }
    const transNotShut = [...transitioned].filter((c) => !transitionShut.has(c));
    expect(transNotShut, `这些类的 transition 没被 transition:none 真正关掉：${transNotShut.join(', ')}`).toEqual([]);
    const tfNotShut = [...transformed].filter((c) => !transformShut.has(c));
    expect(tfNotShut, `这些类的 transform 没被 transform:none 真正关掉：${tfNotShut.join(', ')}`).toEqual([]);
  });

  it('交互控件（回到作品页链接）有 :focus-visible 键盘描边', () => {
    expect(ppRuleLines, 'back 链接缺 :focus-visible').toMatch(/\.pp-back:focus-visible/);
  });

  it('守住三态读路径与诚实分支：force-dynamic / 复用 getPublishedPage / schema 校验 / 交互组件 / 钉住版说明', () => {
    expect(code, '强制动态渲染声明丢了').toContain("export const dynamic = 'force-dynamic'");
    expect(code, '可见性判定不再复用 getPublishedPage（会抄出第二份漂移谓词）').toContain('getPublishedPage(path)');
    expect(code, 'schema 校验丢了（读不出来要如实说，不悄悄空关卡）').toContain('GameDocumentSchema.safeParse');
    expect(code, '投影编译丢了').toContain('compileForKind(document)');
    expect(code, '校验问题如实列出丢了').toContain('validateGame(document)');
    expect(code, 'PublicPlay 交互组件丢了（游戏运行时本体，门面不能碰）').toContain('<PublicPlay');
    expect(code, 'VisitMeter 访问心跳丢了（与作品页同口径）').toContain('<VisitMeter');
    expect(code, '钉住版本说明丢了（分享链接不随工作稿变）').toContain('data-play-pinned');
    expect(code, '三态分支的诚实文案丢了').toContain('这一版没有可玩内容');
    expect(code, '读不出来态的诚实文案丢了').toContain('这一版钉住的游戏读不出来');
  });

  it('渐变墨字 .pp-title 不被更高层的 Tailwind 颜色 utility 覆盖（层优先级）', () => {
    const titleTags = [...code.matchAll(/className="([^"]*\bpp-title\b[^"]*)"/g)].map((m) => m[1]!);
    expect(titleTags.length, 'page.tsx 找不到 pp-title').toBeGreaterThan(0);
    const colorUtility = /\btext-(fg|accent|brand|warn|bg)-\d/;
    const offenders = titleTags.filter((cls) => colorUtility.test(cls));
    expect(offenders, `pp-title 挂了会覆盖渐变墨字的颜色 utility：${offenders.join(' | ')}`).toEqual([]);
    const titleBlock = ppSegment.match(/\.pp-title\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(titleBlock, '.pp-title 基础规则找不到').toBeTruthy();
    expect(titleBlock, '.pp-title 未用 transparent 字实现渐变墨字').toMatch(/color:\s*transparent/);
    expect(titleBlock, '.pp-title 缺 background-clip:text').toMatch(/background-clip:\s*text/);
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
