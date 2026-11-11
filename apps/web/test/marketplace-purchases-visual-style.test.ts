import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-10 市场购买页 `/marketplace/purchases` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端）。
 *
 * 缺口（改前）：FE-2 给市场**列表外壳**上了 `.mk-` 妆，但顶栏（marketplace/page.tsx:75-88）把
 * logged-in 用户送进的 3 个子页（purchases / earnings / reports）仍是**全裸 Tailwind 原子类**，
 * 而 purchases 恰有全站最完整的交互态——loading / error / empty / busy / disabled / 状态徽标 /
 * 结果消息——却没有任何门面语言。这是"有状态无门面"的断层，也是 ADR 长期记的"交互态欠账"
 * 最真实的落点（新访客/创作者高频路径）。本片是三兄弟的**模板片**，earnings/reports 留 FE-11。
 *
 * FE-10 只动视觉（`.mp-` 语义类），**零行为**：purchases 是 client 组件，状态机（rows/error/busy/
 * message）、fetch、disabled、data-* 判据钩子、状态徽标文案一字不动——只把裸 className 换成
 * 语义类 + 补纯装饰结构。因此 FE-9 的"纯展示零行为"门在此换成**"状态机/交互契约零行为"门**
 * （守这些契约都在），其余门照搬 FE-4~FE-9 沉淀的骨架。
 *
 * 另一处刻意补齐：全库门面此前**零 `:active`、零 `:disabled` 视觉**（探查坐实的 CSS 空白）。
 * 本片在 `.mp-` 段内首次引入按下/禁用的 token 化状态语言，但**克制在 .mp- 内**、不动共享约定，
 * 避免 FE-10 变成影响 9 个门面的高风险共享改动。
 *
 * 判据不变式（先红→绿→变异臂有牙，延续 ADR-0154 / CRIT-1「锚真实代码、别被注释喂绿」）：
 *  1. 类名闭环：page 每个 `mp-*` 类在 globals.css 有 `.mp-*` **基础定义**（只认基础选择器、
 *     整段剔 reduced-motion，堵 FE-5 变异臂"出现过≠定义过"洞）；
 *  2. 成规模视觉段（≥16 类）；3. 零写死 hex；4. token 真存在；5. 零新增颜色 token；
 *  6. 结构/判据钩子一个不丢（e2e/a11y 靠它们定位四态与行）；
 *  7. **状态机/交互契约零行为**（fetch / disabled / busy / data-* / 状态分支都在，纯 className 换皮）；
 *  8. 四态齐备（error/loading/empty/list 各有专属 `.mp-` 类）；
 *  9. **`:active` / `:disabled` 交互态语言存在**（补全库 CSS 空白）；
 *  10. 动效被 prefers-reduced-motion 真正关掉；
 *  11. 交互按钮 `:focus-visible` 键盘描边；
 *  12. 注释定界符严格配对（FE-6 真编译挂的洞）。
 *
 * 本片**不加渐变墨字**（纯色标题 + 渐变压边轨道），故完全不触发 A11Y-1 forced-colors 联动，
 * 风险更低；forced-colors 全局不变式仍由既有 forced-colors-style.test.ts 守。
 * 浏览器那一寸归 `e2e/marketplace-purchases-visual.spec.ts`（setContent 注入真实产物字节）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/marketplace/purchases/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 去掉 JSDoc 后的**真实代码**——契约门/结构钩子门一律锚它，注释不得喂绿（CRIT-1 纪律）。 */
const code = cssNoComments(page);

function mpRules(css: string): string[] {
  return cssNoComments(css)
    .split('\n')
    .filter((line) => /\.mp-[A-Za-z]/.test(line));
}

function pageMpClasses(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/["'`]([^"'`\n]*\bmp-[A-Za-z0-9-]+[^"'`\n]*)["'`]/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (/\bmp-[A-Za-z0-9-]+/.test(cls)) found.add(cls.replace(/[^\w-].*$/, ''));
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

/** globals.css 里有基础规则体的 `.mp-` 主类名（剔 reduced-motion、只认基础选择器）。 */
function definedMpClasses(css: string): Set<string> {
  const clean = stripMedia(cssNoComments(css), '@media (prefers-reduced-motion: reduce)');
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(mp-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
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

/** `.mp-` 视觉段完整文本：从第一个 `.mp-` 到 forced-colors 块之前（含 reduced-motion）。 */
const mpSegment = (() => {
  const clean = cssNoComments(globals);
  const start = clean.search(/\.mp-[A-Za-z]/);
  if (start < 0) return '';
  const tail = clean.slice(start);
  const forcedAt = tail.search(/@media\s*\(forced-colors:\s*active\)/);
  return (forcedAt >= 0 ? tail.slice(0, forcedAt) : tail).replace(/\n\}\s*$/, '\n');
})();

const mpRuleLines = mpRules(globals).join('\n');
const mpReducedMotionBody = (() => {
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
    if (/\.mp-/.test(body)) out.push(body);
    from = end + 1;
  }
  return out.join('\n');
})();

describe('§FE-10 市场购买页门面（静态不变式）', () => {
  it('purchases page.tsx 用了 .mp- 语义类，且全部在 globals.css 有基础定义（拼错不静默失效）', () => {
    const used = pageMpClasses(code);
    expect(used.length, 'purchases 一个 mp- 类都没有，门面没接上').toBeGreaterThan(12);
    const defined = definedMpClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 mp- 类在 page 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .mp- 视觉段（不是空壳）', () => {
    expect(definedMpClasses(globals).size, '.mp- 定义太少，FE-10 门面升级没落地').toBeGreaterThanOrEqual(16);
  });

  it('.mp- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界，扫整段含续行）', () => {
    const hex = [...mpSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.mp- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.mp- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（扫整段含续行）', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of mpSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.mp- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('.mp- 段零新增颜色 token（只引用既有双主题 token，不另立 --nexus-color-*）', () => {
    const newlyDefined = [...mpSegment.matchAll(/(--nexus-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect([...new Set(newlyDefined)], `.mp- 段定义了新颜色 token（ADR-0123 零新增红线）：${[...new Set(newlyDefined)].join(', ')}`).toEqual([]);
  });

  it('四态结构/判据钩子一个不丢（error/loading/empty/list + 行/状态/下载/消息，e2e 靠它们定位）', () => {
    const expected = [
      'data-purchases-back',
      'data-purchases-error',
      'data-purchases-loading',
      'data-purchases-empty',
      'data-purchases-list',
      'data-purchase-row',
      'data-purchase-item',
      'data-purchase-status',
      'data-purchase-status-label',
      'data-purchase-date',
      'data-purchase-price',
      'data-purchase-download',
      'data-purchase-message',
    ];
    const missing = expected.filter((h) => !code.includes(h));
    expect(missing, `结构/判据钩子丢了：${missing.join(', ')}`).toEqual([]);
  });

  it('四态各有专属 .mp- 视觉类（error/loading/empty/list 不是同一副裸样子）', () => {
    const defined = definedMpClasses(globals);
    const used = pageMpClasses(code);
    for (const kind of ['error', 'loading', 'empty', 'list']) {
      expect(used.some((c) => c.startsWith(`mp-${kind}`)), `page 缺 mp-${kind}* 类`).toBe(true);
      expect([...defined].some((c) => c.startsWith(`mp-${kind}`)), `globals.css 缺 mp-${kind}* 定义`).toBe(true);
    }
  });

  it('状态机/交互契约零行为：fetch / disabled / busy / data-* / 状态分支都在（只换 className）', () => {
    // fetch 与端点一字不动
    expect(code, ' purchases 读取端点变了（行为改动）').toMatch(/fetch\(['"]\/api\/marketplace\/purchases['"]\)/);
    expect(code, ' 下载端点变了（行为改动）').toMatch(/\/api\/marketplace\/\$\{row\.itemId\}\/content/);
    // 状态机变量与 setter 都在
    for (const v of ['rows', 'error', 'busy', 'message']) {
      expect(code, `状态变量 ${v} 丢了（行为改动）`).toMatch(new RegExp(`set${v.charAt(0).toUpperCase()}${v.slice(1)}\\s*\\(`));
    }
    // disabled 契约还在（busy 时禁用下载）
    expect(code, '下载按钮 disabled={busy===...} 契约丢了').toMatch(/disabled=\{busy\s*===\s*row\.itemId\}/);
    // 三态渲染分支都在
    for (const branch of ['data-purchases-error', 'data-purchases-loading', 'data-purchases-empty', 'data-purchases-list']) {
      expect(code, `渲染分支 ${branch} 丢了`).toContain(branch);
    }
    // 状态推导函数没被改坏
    expect(code, 'statusOf 状态枚举（delisted/private/在售）丢了').toMatch(/delistedAt|visibility\s*===\s*['"]private['"]/);
  });

  it('交互态语言存在：.mp- 段首次覆盖 :active 与 :disabled（补全库门面 CSS 空白）', () => {
    expect(mpRuleLines, '.mp- 段零 :active 按下反馈（全库空白没补上）').toMatch(/\.mp-[A-Za-z0-9-]+:active/);
    expect(mpRuleLines, '.mp- 段零 :disabled 禁用视觉（busy 态无反馈）').toMatch(/\.mp-[A-Za-z0-9-]+:disabled/);
    expect(mpRuleLines, '.mp- 段零 :hover 反馈').toMatch(/\.mp-[A-Za-z0-9-]+:hover/);
  });

  it('用了动效的 .mp- 类都被 prefers-reduced-motion 在同一批规则里真正关掉', () => {
    expect(mpReducedMotionBody, 'mp- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    const base = (s: string) => s.replace(/:(hover|focus-visible|active|disabled|before|after).*$/, '');
    const mpNames = (sel: string) => [...sel.matchAll(/\.(mp-[A-Za-z0-9-]+)/g)].map((m) => base(m[1]!));

    const prodCss = stripMedia(mpSegment, '@media (prefers-reduced-motion: reduce)');
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    // FE-10 新增 animation（.mp-loading 的呼吸脉冲）：关闭它的是 animation:none，
    // 不是 transition:none。故把 animation 单列一类，别沿用 FE-9「animation 也算进
    // transitioned/transformed」的近似——那条近似在只有 transition/transform 的门面上成立，
    // 一旦真有 animation 就会误红（本门首跑 mp-loading 假红逼出的修实）。
    const animated = new Set<string>();
    const hasTransform = (d: string) => /(?<![-\w])transform\s*:/.test(d);
    const transformNone = (d: string) => /(?<![-\w])transform\s*:\s*none/.test(d);
    for (const { selector, decls } of blocks) {
      const names = mpNames(selector);
      if (/animation:/.test(decls) && !/animation:\s*none/.test(decls)) for (const n of names) animated.add(n);
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (hasTransform(decls) && !transformNone(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size + animated.size, '没扫到任何 mp- transition/animation 动效源，这道门是空的').toBeGreaterThan(0);

    const rmBlocks = ruleBlocks(mpReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    const animationShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of mpNames(selector)) {
        if (/transition:\s*none/.test(decls)) transitionShut.add(n);
        if (transformNone(decls)) transformShut.add(n);
        if (/animation:\s*none/.test(decls)) animationShut.add(n);
      }
    }
    const transNotShut = [...transitioned].filter((c) => !transitionShut.has(c));
    expect(transNotShut, `这些类的 transition 没被 transition:none 真正关掉：${transNotShut.join(', ')}`).toEqual([]);
    const tfNotShut = [...transformed].filter((c) => !transformShut.has(c));
    expect(tfNotShut, `这些类的 transform 没被 transform:none 真正关掉：${tfNotShut.join(', ')}`).toEqual([]);
    const animNotShut = [...animated].filter((c) => !animationShut.has(c));
    expect(animNotShut, `这些类的 animation 没被 animation:none 真正关掉：${animNotShut.join(', ')}`).toEqual([]);
  });

  it('交互控件（下载按钮 / 回市场链接）都有 :focus-visible 键盘描边', () => {
    expect(mpRuleLines, 'mp-download 缺 :focus-visible').toMatch(/\.mp-download:focus-visible/);
    expect(mpRuleLines, 'mp-back 缺 :focus-visible').toMatch(/\.mp-back:focus-visible/);
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
