import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-8 公开分镜页 `/n/[handle]/[slug]/storyboard` 视觉升级的**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 公开门面矩阵已升 discover / marketplace / home / search / profile(`/u/…`) /
 * published(`/n/…`) / play(`/n/…/play`)；唯独缺**公开分镜页**——访客点"分镜"进来的
 * 镜头表落点。改前三个状态（无分镜稿 / 读不出来 / 有镜头表）都是零语义前缀的裸 Tailwind：
 * 空/错态一色字、header 素边、每镜一张裸 `rounded border` 卡、钉住说明贴边。
 * FE-8 只动视觉（`.ss-` 类），结构/文案/`data-storyboard-*` 钩子/读路径/三态分支/
 * `VisitMeter` 一字不改（§159 / ADR-0123 六红线）。
 *
 * 复用 FE-4/5/6/7 沉淀的静态判据骨架（先红→绿→变异臂有牙），把"不依赖渲染也能确定"的
 * 部分钉死——恰是本机多 agent 抢资源下真浏览器 e2e 会被 SIGTERM 吃掉时仍能守住的那一寸：
 *
 *  1. 类名闭环：page.tsx 每个 `ss-*` 类在 globals.css 有 `.ss-*` **基础定义**（只认后跟
 *     `{`/`,` 的基础选择器、整段剔 reduced-motion，堵 FE-5 变异臂 A 的"出现过≠定义过"洞）；
 *  2. 零写死 hex；3. token 真存在；4. 三态结构钩子一个不丢；
 *  5. 动效被 prefers-reduced-motion 按规则块真正关掉；6. 交互控件有 :focus-visible；
 *  7. 层优先级：渐变墨字 `.ss-title` 不被更高层 Tailwind 颜色 utility 覆盖（FE-6 真 bug 固化）；
 *  8. 注释定界符严格配对（FE-6 真编译挂的洞，用字符码构造定界符避自指）；
 *  9. **守住读路径与诚实三态**（FE-8 特有）：force-dynamic、getPublishedPage 复用、
 *     StoryboardDocumentSchema 校验、三态文案与钩子、VisitMeter、钉住版说明、镜头标签
 *     （明示"镜头表不是视频"）——一个都不能被动。
 *
 * 浏览器那一寸归 `e2e/storyboard-visual.spec.ts`；无障碍/互动归既有 `a11y-*` / `interactive-work.spec.ts`。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/n/[handle]/[slug]/storyboard/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

/** raw 文本里找首个 `re` 匹配，跳过注释（注释里长得像门面类的 `.an-` 不是段起点）。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 去掉 JSDoc 后的**真实代码**——所有语义门一律锚它，不锚含注释的 page 全文（ADR-0154）。
 * 同批 play 门被变异臂证伪过：删正文 `getPublishedPage(path)`、只在 JSDoc 补同形字样，
 * 锚全文仍绿。判据守真实调用/文案/钩子，不守"文件里含某词"。
 */
const code = cssNoComments(page);

function ssRules(css: string): string[] {
  return cssNoComments(css)
    .split('\n')
    .filter((line) => /\.ss-[A-Za-z]/.test(line));
}

function pageSsClasses(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/["'`]([^"'`\n]*\bss-[A-Za-z0-9-]+[^"'`\n]*)["'`]/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (/\bss-[A-Za-z0-9-]+/.test(cls)) found.add(cls.replace(/[^\w-].*$/, ''));
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

/** globals.css 里有基础规则体的 `.ss-` 主类名（剔 reduced-motion、只认基础选择器）。 */
function definedSsClasses(css: string): Set<string> {
  const clean = stripMedia(cssNoComments(css), '@media (prefers-reduced-motion: reduce)');
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(ss-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
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

/** `.ss-` 段完整文本：`.ss-` 起，到下一个 `/* ── §FE-` 段头止（文件段头接缝，不是 layer 顶格 `}`）。 */
const ssSegment = (() => {
  const start = findOutsideComments(globals, /\.ss-[A-Za-z]/);
  if (start < 0) return '';
  const rest = globals.slice(start);
  const nextSection = rest.search(/\/\*\s*─+\s*§FE-\d+/);
  return cssNoComments(nextSection >= 0 ? rest.slice(0, nextSection) : rest);
})();

/** 把 CSS 切成 `{ selector, decls }` 规则块（含多行声明）。 */
function ruleBlocks(css: string): Array<{ selector: string; decls: string }> {
  const out: Array<{ selector: string; decls: string }> = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1]!, decls: m[2]! });
  return out;
}

const ssRuleLines = ssRules(globals).join('\n');
const ssReducedMotionBody = mediaBlocks(
  cssNoComments(globals),
  '@media (prefers-reduced-motion: reduce)',
).find((body) => body.includes('.ss-'));

describe('§FE-8 公开分镜页视觉段（静态不变式）', () => {
  it('page.tsx 用了 .ss- 语义类，且全部在 globals.css 有基础定义（拼错不静默失效）', () => {
    const used = pageSsClasses(code);
    expect(used.length, 'page.tsx 一个 ss- 类都没有，视觉段没接上').toBeGreaterThan(8);
    const defined = definedSsClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 ss- 类在 page.tsx 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .ss- 视觉段（不是空壳）', () => {
    expect(definedSsClasses(globals).size, '.ss- 定义太少，FE-8 视觉升级没落地').toBeGreaterThanOrEqual(12);
  });

  it('.ss- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界，扫整段含续行）', () => {
    const hex = [...ssSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.ss- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.ss- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（扫整段含续行）', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of ssSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.ss- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('FE-8 只动视觉：公开分镜页 15 个 data-storyboard-* 结构/判据钩子一个都不能丢', () => {
    const expected = [
      'data-storyboard="none"',
      'data-storyboard="broken"',
      'data-storyboard="live"',
      'data-storyboard-back',
      'data-storyboard-none-reason',
      'data-storyboard-issue',
      'data-storyboard-title',
      'data-storyboard-source',
      'data-storyboard-pinned',
      'data-storyboard-shot',
      'data-storyboard-shot-meta',
      'data-storyboard-shot-prompt',
      'data-storyboard-shot-refs',
      'data-storyboard-empty',
      'data-storyboard-total',
      'data-storyboard-notes',
      'data-storyboard-notice',
    ];
    const missing = expected.filter((h) => !code.includes(h));
    expect(missing, `结构/判据钩子丢了（不是纯视觉片）：${missing.join(', ')}`).toEqual([]);
  });

  it('用了动效的 .ss- 类都被 prefers-reduced-motion 在同一条规则里真正关掉', () => {
    expect(ssReducedMotionBody, '.ss- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    const base = (s: string) => s.replace(/:(hover|focus-visible|active|before|after).*$/, '');
    const ssNames = (sel: string) => [...sel.matchAll(/\.(ss-[A-Za-z0-9-]+)/g)].map((m) => base(m[1]!));

    const prodCss = stripMedia(ssSegment, '@media (prefers-reduced-motion: reduce)');
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    const hasTransform = (d: string) => /(?<![-\w])transform\s*:/.test(d);
    const transformNone = (d: string) => /(?<![-\w])transform\s*:\s*none/.test(d);
    for (const { selector, decls } of blocks) {
      const names = ssNames(selector);
      if (/animation:/.test(decls)) { for (const n of names) { transitioned.add(n); transformed.add(n); } }
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (hasTransform(decls) && !transformNone(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size, '没扫到任何 .ss- transition 动效源，这道门是空的').toBeGreaterThan(0);

    const rmBlocks = ruleBlocks(ssReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of ssNames(selector)) {
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
    expect(ssRuleLines, 'back 链接缺 :focus-visible').toMatch(/\.ss-back:focus-visible/);
  });

  it('守住三态读路径与诚实分支：force-dynamic / 复用 getPublishedPage / schema 校验 / VisitMeter / 钉住版说明 / 不是视频', () => {
    expect(code, '强制动态渲染声明丢了').toContain("export const dynamic = 'force-dynamic'");
    expect(code, '可见性判定不再复用 getPublishedPage（会抄出第二份漂移谓词）').toContain('getPublishedPage(path)');
    expect(code, 'schema 校验丢了（读不出来要如实说，不悄悄空镜头表）').toContain('StoryboardDocumentSchema.safeParse');
    expect(code, 'VisitMeter 访问心跳丢了（与作品页/试玩页同口径）').toContain('<VisitMeter');
    expect(code, '分镜标签映射丢了').toContain('CAMERA_LABELS');
    expect(code, '镜头转场标签丢了').toContain('TRANSITION_LABELS');
    expect(code, '钉住版本说明丢了（分享链接不随工作稿变）').toContain('data-storyboard-pinned');
    expect(code, '空态诚实文案丢了').toContain('这一版没有分镜稿');
    expect(code, '读不出来态诚实文案丢了').toContain('这一版钉住的分镜读不出来');
    expect(code, '「不是视频」诚实边界丢了（本机无视频 provider，不把镜头表说成视频）').toContain('不是视频');
  });

  it('渐变墨字 .ss-title 不被更高层的 Tailwind 颜色 utility 覆盖（层优先级）', () => {
    const titleTags = [...code.matchAll(/className="([^"]*\bss-title\b[^"]*)"/g)].map((m) => m[1]!);
    expect(titleTags.length, 'page.tsx 找不到 ss-title').toBeGreaterThan(0);
    const colorUtility = /\btext-(fg|accent|brand|warn|bg)-\d/;
    const offenders = titleTags.filter((cls) => colorUtility.test(cls));
    expect(offenders, `ss-title 挂了会覆盖渐变墨字的颜色 utility：${offenders.join(' | ')}`).toEqual([]);
    const titleBlock = ssSegment.match(/\.ss-title\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(titleBlock, '.ss-title 基础规则找不到').toBeTruthy();
    expect(titleBlock, '.ss-title 未用 transparent 字实现渐变墨字').toMatch(/color:\s*transparent/);
    expect(titleBlock, '.ss-title 缺 background-clip:text').toMatch(/background-clip:\s*text/);
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
