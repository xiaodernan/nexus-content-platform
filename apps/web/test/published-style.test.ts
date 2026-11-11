import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-6 公开作品页 `/n/[handle]/[slug]` 视觉升级的**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 作品页是内容平台最核心的落点——访客点开分享链接看到的第一张脸。公开门面矩阵已升
 * discover / marketplace / home / search / profile，就差这一块，补上即"集大成"。改前 232 行
 * 全是裸 Tailwind 原子类（header 一条素边框、meta 纯文字、试玩/分镜链接一块纯色、统计告知
 * 贴边），FE-6 只动视觉（`.pb-` 类），结构/文案/`data-*` 钩子/SEO/React cache 读路径一字不改。
 *
 * 为什么单独写这份而不是只靠 e2e：FE-4 的教训是「真 Chrome 双主题」在本机多 agent 抢资源下
 * 会被 SIGTERM 超时吃掉，判据写就却跑不到。这里把「不依赖渲染也能确定」的部分先钉死——
 * 恰好也是最容易静默失效的部分：
 *
 *  1. **类名闭环**：page.tsx 里每个 `pb-*` 类都在 globals.css 有 `.pb-*` **基础定义**。
 *     只数"出现过"不够（FE-5 变异臂 A 抓出的真缺口）：伪类/reduced-motion 会让删掉的基础类
 *     继续"存在"，故只认后跟 `{`/`,` 的基础选择器，并整段剔掉 reduced-motion 块。
 *  2. **零写死颜色**：`.pb-` 段里不出现 hex 字面量（颜色全走 token / color-mix）。
 *  3. **token 真存在**：`.pb-` 段里每个 `var(--nexus-*)` 都在 tokens.css 声明过。
 *  4. **结构钩子不丢**：12 个 `data-*` 钩子一个都不能少（少一个=改了判据面，非纯视觉片）。
 *  5. **动效有退路**：凡用了 `transition`/`transform`/`animation` 的 `.pb-` 类，都要被
 *     `@media (prefers-reduced-motion: reduce)` 在同一条规则里真正关掉（按规则块解析，
 *     不吃 FE-5 按行扫漏多行声明的亏）。
 *  6. **键盘可达**：交互类（试玩 / 分镜链接）要有 `:focus-visible` 描边。
 *  7. **守住前后端协同**（FE-6 特有）：本片只动视觉，绝不能把服务端 SEO 出标签、React cache
 *     去重读路径、fire-and-forget 浏览量统计这三件事弄断——它们是这块页面"能被抓取端读懂、
 *     不为爬虫重复查库、不因统计拖慢首屏"的既成协同，不是本片新增的优化（不编造）。
 *  8. **守住最脆的渲染路径**（FE-6 特有）：四份断点投影 / 自动选档媒体查询 / 交互热点 /
 *     PublishedFrame 作品本体，一个都不能被视觉改造碰到——那一片是作品内容本身，不是门面。
 *
 * 浏览器那一寸（真的渲染、深/浅主题、零 console error）归 `e2e/published-visual.spec.ts`；
 * 无障碍 axe / 布局归既有 `a11y-*` / `interactive-work.spec.ts`；这里不重复。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/n/[handle]/[slug]/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

/** 去掉 CSS 注释，避免注释里的示例类名/hex 混进断言。 */
function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 去掉 JSDoc 后的**真实代码**——所有语义门（类名/钩子/读路径计数/SEO/渲染/层优先级）
 * 一律锚它，不锚含注释的 page 全文（ADR-0154）。同批 play 门被变异臂证伪过：删正文
 * `getPublishedPage(path)`、只在 JSDoc 补同形字样，锚全文仍绿。计数门改锚 code 后，
 * 靠注释凑 `getPublishedPage(` 次数也失效——只认真调用。
 */
const code = cssNoComments(page);

/** globals.css 里含 `.pb-` 的选择器行。 */
function pbRules(css: string): string[] {
  return cssNoComments(css)
    .split('\n')
    .filter((line) => /\.pb-[A-Za-z]/.test(line));
}

/** page.tsx 里所有以 pb- 开头的语义类名（去重）。 */
function pagePbClasses(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/["'`]([^"'`\n]*\bpb-[A-Za-z0-9-]+[^"'`\n]*)["'`]/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (/\bpb-[A-Za-z0-9-]+/.test(cls)) found.add(cls.replace(/[^\w-].*$/, ''));
    }
  }
  return [...found].sort();
}

/** 整段剔除某个 @media 块（花括号配对），用于剔掉 reduced-motion 段。 */
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

/**
 * globals.css 里**有基础规则体**的 .pb- 主类名。
 * ①先剔掉所有 prefers-reduced-motion 块（那里只关动效、且常以 `.pb-a, .pb-b { transition:none }`
 *   开头，会把删掉的基础类重新"定义"一遍）；②只认 `.pb-x` 后紧跟 `{`/`,` 的基础选择器
 *   （排除 `:hover`/`::before`/`:focus-visible` 伪类后缀）。
 */
function definedPbClasses(css: string): Set<string> {
  const clean = stripMedia(cssNoComments(css), '@media (prefers-reduced-motion: reduce)');
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(pb-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
      const tail = line.slice(m.index! + m[0]!.length).trimStart();
      if (/^[{,]/.test(tail)) out.add(m[1]!);
    }
  }
  return out;
}

/** tokens.css 里声明过的全部 token 名。 */
function definedTokens(css: string): Set<string> {
  return new Set(
    [...cssNoComments(css).matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
  );
}

/** 取出某个 @media 查询的所有块的**完整 body**（花括号配对，不是 `[^}]*`）。 */
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

/**
 * `.pb-` 段的**完整文本**（含多行声明的续行），到 `@layer components` 的顶格闭合 `}` 为止。
 * hex / token / 动效门都扫它，而不是只扫"含 `.pb-` 的行"——后者是 FE-5 遗留的盲点：
 * 多行规则里 `color: var(--nexus-*)` 或写死 hex 常在续行、那行没有 `.pb-` 字样，只扫行会漏判。
 * 顶格 `}` 是 layer 闭合（`.pb-` 段内规则的 `}` 都带缩进），据此精确截断，不把后续内容算进来。
 */
const pbSegment = (() => {
  const clean = cssNoComments(globals);
  const start = clean.search(/\.pb-[A-Za-z]/);
  if (start < 0) return '';
  const out: string[] = [];
  for (const line of clean.slice(start).split('\n')) {
    if (/^}/.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
})();

/** 把 CSS 文本切成 `{ selector, decls }` 规则块（含多行声明）。 */
function ruleBlocks(css: string): Array<{ selector: string; decls: string }> {
  const out: Array<{ selector: string; decls: string }> = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1]!, decls: m[2]! });
  return out;
}

const pbRulesText = pbRules(globals);
const pbRuleLines = pbRulesText.join('\n');
/** 本片那条 reduced-motion 段的完整 body（多条规则都在），定位靠 `.pb-` 前缀。 */
const pbReducedMotionBody = mediaBlocks(
  cssNoComments(globals),
  '@media (prefers-reduced-motion: reduce)',
).find((body) => body.includes('.pb-'));

describe('§FE-6 公开作品页视觉段（静态不变式）', () => {
  it('page.tsx 确实用了 .pb- 语义类，且全部在 globals.css 有基础定义（拼错不静默失效）', () => {
    const used = pagePbClasses(code);
    expect(used.length, 'page.tsx 一个 pb- 类都没有，视觉段没接上').toBeGreaterThan(8);
    const defined = definedPbClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 pb- 类在 page.tsx 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .pb- 视觉段（不是空壳）', () => {
    expect(definedPbClasses(globals).size, '.pb- 定义太少，FE-6 视觉升级没落地').toBeGreaterThanOrEqual(14);
  });

  it('.pb- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界，扫整段含续行）', () => {
    const hex = [...pbSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.pb- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.pb- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（扫整段含续行）', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of pbSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.pb- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('FE-6 只动视觉：作品页 12 个 data-* 结构/判据钩子一个都不能丢', () => {
    const expected = [
      'data-published-root',
      'data-published-path',
      'data-published-title',
      'data-published-meta',
      'data-published-auto',
      'data-published-variant',
      'data-published-variant-width',
      'data-interactive-note',
      'data-published-play',
      'data-published-storyboard',
      'data-visit-notice',
      'data-seo-jsonld',
    ];
    const missing = expected.filter((h) => !code.includes(h));
    expect(missing, `结构/判据钩子丢了（不是纯视觉片）：${missing.join(', ')}`).toEqual([]);
  });

  it('用了动效的 .pb- 类都被 prefers-reduced-motion 在同一条规则里真正关掉', () => {
    expect(pbReducedMotionBody, '.pb- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    const base = (s: string) => s.replace(/:(hover|focus-visible|active|before|after).*$/, '');
    const pbNames = (sel: string) => [...sel.matchAll(/\.(pb-[A-Za-z0-9-]+)/g)].map((m) => base(m[1]!));

    // reduced-motion 段自身（写着 transition:none）剔掉，不算动效源；按**规则块**扫，
    // 多行声明块里的 transition 才扫得到（FE-5 按行扫翻过车）。
    const prodCss = stripMedia(pbSegment, '@media (prefers-reduced-motion: reduce)');
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    // 只认**声明边界**处的 transform:，别把 `text-transform: uppercase` 这类静态排版
    // 误当几何位移动效（负向前瞻排掉 `text-transform` 的 `-transform`）。
    const hasTransform = (d: string) => /(?<![-\w])transform\s*:/.test(d);
    const transformNone = (d: string) => /(?<![-\w])transform\s*:\s*none/.test(d);
    for (const { selector, decls } of blocks) {
      const names = pbNames(selector);
      if (/animation:/.test(decls)) { for (const n of names) { transitioned.add(n); transformed.add(n); } }
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (hasTransform(decls) && !transformNone(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size, '没扫到任何 .pb- transition 动效源，这道门是空的').toBeGreaterThan(0);

    // reduced-motion 段里逐条规则看：transition:none / transform:none 必须在同一条规则里
    // 点名了对应类，才算真正收口（删掉 transition:none 那条会在此红）。
    const rmBlocks = ruleBlocks(pbReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of pbNames(selector)) {
        if (/transition:\s*none/.test(decls)) transitionShut.add(n);
        if (transformNone(decls)) transformShut.add(n);
      }
    }
    const transNotShut = [...transitioned].filter((c) => !transitionShut.has(c));
    expect(transNotShut, `这些类的 transition 没被 transition:none 真正关掉：${transNotShut.join(', ')}`).toEqual([]);
    const tfNotShut = [...transformed].filter((c) => !transformShut.has(c));
    expect(tfNotShut, `这些类的 transform 没被 transform:none 真正关掉：${tfNotShut.join(', ')}`).toEqual([]);
  });

  it('交互类（试玩 / 分镜链接）有 :focus-visible 键盘描边', () => {
    expect(pbRuleLines, '试玩链接缺 :focus-visible').toMatch(/\.pb-playLink:focus-visible/);
    expect(pbRuleLines, '分镜链接缺 :focus-visible').toMatch(/\.pb-storyboardLink:focus-visible/);
  });

  it('守住前后端协同：服务端 SEO / React cache 去重读路径 / fire-and-forget 浏览量统计未被弄断', () => {
    expect(code, '强制动态渲染声明丢了（公开快照页口径）').toContain("export const dynamic = 'force-dynamic'");
    expect(code, 'generateMetadata 丢了（抓取端不执行 JS，head 必须服务端出）').toContain('export async function generateMetadata');
    // generateMetadata 与正文各调一次 getPublishedPage，靠 React cache 去重为一次库查（不为爬虫再查）
    const reads = code.match(/getPublishedPage\(/g) ?? [];
    expect(reads.length, 'getPublishedPage 读取点少了一处，React cache 去重那条腿断了').toBeGreaterThanOrEqual(2);
    expect(code, 'SEO 构建丢了').toContain('buildPublishedSeo');
    expect(code, 'JSON-LD 结构化数据钩子丢了').toContain('data-seo-jsonld');
    expect(code, 'JSON-LD script 类型丢了').toContain('application/ld+json');
    expect(code, '浏览量统计不再是 fire-and-forget（会拖慢首屏）').toMatch(/recordView\([^)]*\)\.catch\(/);
  });

  it('守住最脆的渲染路径：四份断点投影 / 自动选档 / 交互热点 / PublishedFrame 作品本体未被动', () => {
    expect(code, 'PublishedFrame 作品本体渲染丢了').toContain('<PublishedFrame');
    expect(code, '四份投影 variants 丢了').toContain('variants.map');
    expect(code, '自动选档媒体查询样式丢了').toContain('publishedVariantsStyle()');
    expect(code, '交互热点投影丢了').toContain('hotspotsFor(layout)');
    expect(code, 'PublishedFrame 拿到的 hotspots props 丢了').toContain('hotspots={hotspotsFor(layout)}');
  });

  /**
   * 这一门是 FE-6 真浏览器首跑抓出的**判据盲区**补的：上文所有门都用 `cssNoComments()`
   * 的非贪婪「块注释开始…块注释结束」定界符去注释，遇到注释正文里提前写下的结束定界符
   * （本片曾在注释里写 `data-*` 紧跟一个斜杠再接 `SEO`，星号加斜杠恰好凑成那个结束符），
   * 会把残留半句当裸文本，而那段不含 `.pb-` 字样，于是前 9 门全绿、真 Next 编译却
   * `Unexpected token` 直接失败。
   *
   * 为什么不用 `postcss.parse()` 当门：实测它对这种提前闭合**照样解析通过**（残留文本被
   * 容成 selector），抓不住；Next 内部更严的编译步骤才拒绝。所以这里用**确定性信号**——
   * 把全部合法的成对块注释整段剔掉后，正文不应残留任何单个的块注释开始符或结束符。
   * 注释里一处提前闭合，就会让原本那句真正的结束符孤立残留，计数从 0 变 1，必红。
   * 零依赖、零浏览器、不依赖任何 parser 的容错行为，把「静态全绿但真编译挂」这一类洞
   * 永久钉死。注意本注释自身也刻意不写出那两个定界符字面，否则会重蹈提前闭合的覆辙。
   */
  it('渐变墨字 .pb-title 不被更高层的 Tailwind 颜色 utility 覆盖（层优先级）', () => {
    // .pb-title 用 color:transparent + background-clip:text 实现渐变墨字；Tailwind 的
    // text-fg-*/text-accent-* 属更高优先级的 utilities 层，一旦同挂会盖掉 transparent，
    // 让渐变失效、退回纯色字（真浏览器浅色 computed color 抓出的真 bug，§ADR-0138）。
    const titleTags = [...code.matchAll(/className="([^"]*\bpb-title\b[^"]*)"/g)].map((m) => m[1]!);
    expect(titleTags.length, 'page.tsx 找不到 pb-title').toBeGreaterThan(0);
    const colorUtility = /\btext-(fg|accent|brand|warn|bg)-\d/;
    const offenders = titleTags.filter((cls) => colorUtility.test(cls));
    expect(offenders, `pb-title 挂了会覆盖渐变墨字的颜色 utility：${offenders.join(' | ')}`).toEqual([]);
    // 语义类自身确实写了 transparent + background-clip:text，这门才不是空的
    const titleBlock = pbSegment.match(/\.pb-title\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(titleBlock, '.pb-title 基础规则找不到').toBeTruthy();
    expect(titleBlock, '.pb-title 未用 transparent 字实现渐变墨字').toMatch(/color:\s*transparent/);
    expect(titleBlock, '.pb-title 缺 background-clip:text').toMatch(/background-clip:\s*text/);
  });

  it('globals.css 块注释定界符严格配对（堵注释提前闭合导致真编译挂的洞）', () => {
    // 用字符码拼定界符，避免本门源码里出现会自伤的字面序列（那会重蹈提前闭合覆辙）。
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
    if (inside) strayOpen++; // 扫到文件尾仍在注释里 = 有开无合
    expect(
      { strayOpen, strayClose },
      'globals.css 有孤立定界符或注释未闭合——注释正文里提前闭合了（如 data-* 紧跟斜杠）',
    ).toEqual({ strayOpen: 0, strayClose: 0 });
  });
});
