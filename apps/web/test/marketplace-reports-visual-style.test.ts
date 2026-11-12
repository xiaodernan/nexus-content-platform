import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-13 我的举报页 `/marketplace/reports` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端）。
 *
 * 三兄弟收官片，也是 FE 门面序列里**首个 server 组件 + 首个数据驱动状态色映射**。
 * 缺口（改前）：FE-2 只上市场外壳 `.mk-`、FE-10/11/12 分别上了 `.mp-`/`.mi-`/`.me-`，
 * 但 reports 仍是全裸 Tailwind——denied/empty/list 三态 + 四状态徽标 + 工单行 + 页脚全无门面。
 * 与前三片 client 组件不同，本片零行为边界更微妙：`STATUS_LABELS.className` 的值本就是**配色**
 * （含裸语义色 `text-green-400`），属视觉、应换 `.mr-statusXxx` 语义类；但 4 个状态键、4 个 label
 * 文案、`Record<ReportStatus, …>` 类型、三个纯函数、域函数直连、两段结案文案必须逐字钉死。
 *
 * FE-13 只动视觉、零行为，哈希锚点因"STATUS_LABELS.className 要改"拆成**双段**：
 *  - 段 A：文件头到 `const STATUS_LABELS` 之前（imports + `dynamic` + JSDoc）恒等；
 *  - 段 B：`/** 时间按 UTC 印` 到 `export default` 之前（`stamp` / `itemState` / `reasonLabel`
 *    三个纯函数）恒等。
 *  `STATUS_LABELS` 的**键 + label** 由契约门逐条钉、**className 值**由视觉门（类名闭环 +
 *  四态徽标专属类）管；denied/main 的域逻辑与分支由契约门守。
 *
 * 判据不变式（先红→绿→变异臂有牙，延续 ADR-0154 / §CRIT-1）：
 *  1. 类名闭环：page 每个 `mr-*` 类（**含 STATUS_LABELS 值里的数据驱动状态类**）在 globals.css
 *     有 `.mr-*` 基础定义（剔 reduced-motion、只认基础选择器）；
 *  2. 成规模视觉段（≥16 类）；3. 零写死 hex；4. token 真存在；5. 零新增颜色 token；
 *  6. **page 零裸 Tailwind**（含模板串 `className={`…${status.className}`}` 的字面部分、
 *     剔除 `${}` 插值；STATUS_LABELS.className 值也须是 `mr-*`）；
 *  7. 17 个 `data-*` 钩子一个不丢；
 *  8. **双段 JS 逻辑 SHA256 逐字节零行为**（段 A imports + 段 B 三纯函数）；
 *  9. 域函数 / 状态映射 / 纯函数契约零行为（含计数：4 键 / 4 label / 2 次 itemState / 2 次 stamp /
 *     2 处 outcome-note / 两段结案文案）；
 *  10. 四状态徽标各有专属 `.mr-statusXxx` 类（不是同一副裸样子）；
 *  11. 两个 `<Link>`（去登录 / 回市场）`:focus-visible` 键盘描边（本片有交互控件，故设此门，
 *      与 FE-12 纯展示页诚实删门形成对照）；
 *  12. 动效被 prefers-reduced-motion 真正关掉；
 *  13. 注释定界符严格配对。
 *
 * 本片**不加渐变墨字**，不触发 A11Y-1 forced-colors 联动；全局不变式仍由既有门守。
 * 浏览器那一寸归 `e2e/marketplace-reports-visual.spec.ts`。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/marketplace/reports/page.tsx');
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

/** 去掉注释后的真实代码——契约门/结构钩子门锚它，注释不得喂绿（CRIT-1）。 */
const code = cssNoComments(page);

function mrRules(css: string): string[] {
  return cssNoComments(css)
    .split('\n')
    .filter((line) => /\.mr-[A-Za-z]/.test(line));
}

function pageMrClasses(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/["'`]([^"'`\n]*\bmr-[A-Za-z0-9-]+[^"'`\n]*)["'`]/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (/\bmr-[A-Za-z0-9-]+/.test(cls)) found.add(cls.replace(/[^\w-].*$/, ''));
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

/** globals.css 里有基础规则体的 `.mr-` 主类名（剔 reduced-motion、只认基础选择器）。 */
function definedMrClasses(css: string): Set<string> {
  const clean = stripMedia(cssNoComments(css), '@media (prefers-reduced-motion: reduce)');
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(mr-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
      const tail = line.slice(m.index! + m[0]!.length).trimStart();
      if (/^[{,]/.test(tail)) out.add(m[1]!);
    }
  }
  return out;
}

function definedTokens(css: string): Set<string> {
  return new Set([...cssNoComments(css).matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

function ruleBlocks(css: string): Array<{ selector: string; decls: string }> {
  const out: Array<{ selector: string; decls: string }> = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1]!, decls: m[2]! });
  return out;
}

/** `.mr-` 视觉段完整文本：从第一个 `.mr-` 到第一个 `.me-` 之前（FE-13 段插在 FE-12 `.me-` 前方）。 */
const mrSegment = (() => {
  const start = findOutsideComments(globals, /\.mr-[A-Za-z]/);
  if (start < 0) return '';
  const rest = globals.slice(start);
  const nextSection = rest.search(/\/\*\s*─+\s*§FE-\d+/);
  return cssNoComments(nextSection >= 0 ? rest.slice(0, nextSection) : rest);
})();

const mrRuleLines = mrRules(globals).join('\n');
const mrReducedMotionBody = (() => {
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
    if (/\.mr-/.test(body)) out.push(body);
    from = end + 1;
  }
  return out.join('\n');
})();

/** 双段 JS 逻辑哈希：段 A = 文件头到 STATUS_LABELS 之前；段 B = 三个纯函数区。 */
const SEG_A_SHA256 = '5b4e2924ce6cf53f3bf3c49995ea7d213558076ab13c525d3779d72612f585cd';
const SEG_B_SHA256 = '2ebfd4105dd99871f97ad5d939d8031bcd729bb5120cda314d6a8ead629346f1';
function jsLogicSegments(src: string): { a: string; b: string } {
  const s = src.replace(/\r\n/g, '\n');
  const aIdx = s.indexOf('const STATUS_LABELS');
  const bStart = s.indexOf('/** 时间按 UTC 印');
  const bEnd = s.indexOf('export default async function');
  if (aIdx < 0 || bStart < 0 || bEnd < 0) throw new Error('reports 双段 JS 锚点找不到');
  return {
    a: createHash('sha256').update(s.slice(0, aIdx).trimEnd()).digest('hex'),
    b: createHash('sha256').update(s.slice(bStart, bEnd).trimEnd()).digest('hex'),
  };
}

/**
 * 全文件 className token：**同时匹配静态 `className="…"` 与模板串 `className={`…`}`**，
 * 并剔除 `${…}` 插值（FE-13 首个遇到动态模板串的门：`${status.className}` 由数据驱动状态类门单独管）。
 */
function allClassNameTokens(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const raw = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    for (const t of raw.split(/\s+/)) if (t) out.push(t);
  }
  return out;
}

/** STATUS_LABELS 的 4 个 className 值（数据驱动状态类）。 */
function statusClassValues(src: string): string[] {
  return [...src.matchAll(/className:\s*'([^']+)'/g)].map((m) => m[1]!);
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('§FE-13 我的举报页门面（静态不变式）', () => {
  it('page 用了 .mr- 语义类（含 STATUS_LABELS 数据驱动状态类），全部有 globals.css 基础定义', () => {
    const used = pageMrClasses(code);
    expect(used.length, 'reports 一个 mr- 类都没有，门面没接上').toBeGreaterThan(14);
    const defined = definedMrClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 mr- 类在 page 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
    // STATUS_LABELS 的 className 值也必须换成 mr-* 语义类（不再是 text-green-400 等裸原子类）
    const statusVals = statusClassValues(code);
    expect(statusVals.length, 'STATUS_LABELS 的 4 个 className 值没扫到').toBe(4);
    for (const v of statusVals) {
      expect(v.startsWith('mr-'), `STATUS_LABELS.className 仍是裸 Tailwind：${v}`).toBe(true);
      expect(defined, `STATUS_LABELS 状态类 ${v} 没在 globals.css 定义`).toContain(v);
    }
  });

  it('globals.css 定义了成规模的 .mr- 视觉段（不是空壳）', () => {
    expect(definedMrClasses(globals).size, '.mr- 定义太少，FE-13 门面升级没落地').toBeGreaterThanOrEqual(16);
  });

  it('.mr- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界，扫整段含续行）', () => {
    const hex = [...mrSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.mr- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.mr- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（扫整段含续行）', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of mrSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.mr- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('.mr- 段零新增颜色 token（只引用既有双主题 token，不另立 --nexus-color-*）', () => {
    const newlyDefined = [...mrSegment.matchAll(/(--nexus-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect([...new Set(newlyDefined)], `.mr- 段定义了新颜色 token（ADR-0123 零新增红线）：${[...new Set(newlyDefined)].join(', ')}`).toEqual([]);
  });

  it('page 零裸 Tailwind：className（含模板串字面）只能是 mr-*，STATUS_LABELS 值也须是 mr-*', () => {
    const classTokens = allClassNameTokens(code);
    expect(classTokens.length, 'page 没扫到任何 className，门面没接上').toBeGreaterThan(12);
    const bare = classTokens.filter((t) => !t.startsWith('mr-'));
    expect(bare, `仍有裸 Tailwind 原子类没换成 .mr-：${[...new Set(bare)].join(', ')}`).toEqual([]);
  });

  it('17 个 data-* 结构/判据钩子一个不丢（denied/empty/list/行/状态/时间/结案...）', () => {
    const expected = [
      'data-reports-denied', 'data-reports-title', 'data-reports-back', 'data-reports-empty',
      'data-reports-count', 'data-reports-list', 'data-report-row', 'data-report-id',
      'data-report-status', 'data-report-item-title', 'data-report-item-state',
      'data-report-status-label', 'data-report-reason', 'data-report-created',
      'data-report-resolved', 'data-report-description', 'data-report-outcome-note',
    ];
    const missing = expected.filter((h) => !code.includes(h));
    expect(missing, `结构/判据钩子丢了：${missing.join(', ')}`).toEqual([]);
  });

  it('双段 JS 逻辑逐字节零行为：段 A（imports+dynamic）与段 B（三纯函数）SHA256 恒等', () => {
    const seg = jsLogicSegments(page);
    expect(seg.a, '段 A（imports/dynamic）变了').toBe(SEG_A_SHA256);
    expect(seg.b, '段 B（stamp/itemState/reasonLabel 三纯函数）变了').toBe(SEG_B_SHA256);
  });

  it('域函数 / 状态映射 / 纯函数契约零行为（4 键 / 4 label / 2 itemState / 2 stamp / 2 outcome，含计数）', () => {
    // 域函数直连
    expect(code, 'currentUserOrNull 直连契约丢了').toContain('await currentUserOrNull()');
    expect(code, 'listReportsByReporter 直连契约丢了').toContain('await listReportsByReporter(user.id)');
    expect(code, 'force-dynamic 契约丢了').toContain("export const dynamic = 'force-dynamic'");
    expect(code, '未登录 denied 分支丢了').toContain('if (!user)');
    // STATUS_LABELS：Record 类型 + 4 键 + 4 label 逐字（className 值属视觉、由视觉门管）
    expect(code, 'STATUS_LABELS 的 Record<ReportStatus,…> 类型钉死丢了').toContain(
      'Record<ReportStatus, { label: string; className: string }>',
    );
    for (const [key, label] of [
      ['pending', '待受理'], ['reviewing', '审核中'], ['resolved', '举报成立'], ['dismissed', '举报不成立'],
    ]) {
      expect(code, `STATUS_LABELS 键 ${key} 丢了`).toMatch(new RegExp(`${key}:\\s*\\{`));
      expect(code, `STATUS_LABELS label「${label}」丢了`).toContain(`label: '${label}'`);
    }
    // 三纯函数在 JSX 里的调用：itemState ×2 / stamp ×2 / reasonLabel ×1。
    // 注意锚 stamp(report. 而非 stamp( —— 纯函数定义 `function stamp(value: Date)` 也含 stamp(，
    // 只数带 report. 实参的**调用**才不会把定义算进去（先红假红逼出的修实，§CRIT-1）。
    expect(countOccurrences(code, 'itemState(report.itemVisibility, report.itemDeletedAt)'), 'itemState 调用数变了').toBe(2);
    expect(countOccurrences(code, 'stamp(report.'), 'stamp 调用数变了（created + resolved）').toBe(2);
    expect(code, 'reasonLabel(report.reason) 丢了').toContain('reasonLabel(report.reason)');
    // 空/列表分支 + 状态映射
    expect(code, '空态分支 reports.length===0 丢了').toContain('reports.length === 0');
    expect(code, 'reports.map 丢了').toContain('reports.map((report)');
    expect(code, 'STATUS_LABELS[report.status] 映射丢了').toContain('STATUS_LABELS[report.status]');
    // 两段结案分支与文案逐字
    expect(code, 'resolved 结案分支丢了').toContain("report.status === 'resolved'");
    expect(code, 'dismissed 结案分支丢了').toContain("report.status === 'dismissed'");
    for (const copy of [
      '审核员认定举报成立。这是工单结论，物品是否撤下由人工复核台另行处理。',
      '审核员判定这次举报不成立。若之后发现新的证据，可以留意物品页面的变化。',
      '页面只列你自己提交的工单：别人的举报不在这一页，也拿不到举报人是谁。',
    ]) {
      expect(code, `结案/页脚文案「${copy.slice(0, 12)}…」丢了`).toContain(copy);
    }
    expect(countOccurrences(code, 'data-report-outcome-note'), 'outcome-note 分支数变了').toBe(2);
  });

  it('四状态徽标各有专属 .mr-statusXxx 类（待受理/审核中/成立/不成立不是同一副裸样子）', () => {
    const defined = definedMrClasses(globals);
    const statusVals = statusClassValues(code);
    for (const cls of ['mr-statusPending', 'mr-statusReviewing', 'mr-statusResolved', 'mr-statusDismissed']) {
      expect(statusVals, `STATUS_LABELS 缺 ${cls} 值`).toContain(cls);
      expect(defined, `globals.css 缺 ${cls} 基础定义`).toContain(cls);
    }
  });

  it('两个 Link（去登录 / 回市场）都有 :focus-visible 键盘描边', () => {
    expect(mrRuleLines, '去登录链接缺 :focus-visible').toMatch(/\.mr-loginLink:focus-visible/);
    expect(mrRuleLines, '回市场链接缺 :focus-visible').toMatch(/\.mr-back:focus-visible/);
  });

  it('用了动效的 .mr- 类都被 prefers-reduced-motion 在同一批规则里真正关掉', () => {
    expect(mrReducedMotionBody, 'mr- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    // 伪元素作独立动画槽（FE-12 修实纪律沿用），不与基础类归并
    const mrNames = (sel: string): string[] =>
      [...sel.matchAll(/\.(mr-[A-Za-z0-9-]+)(::?(before|after))?/g)].map((m) => m[1]! + (m[2] ? `::${m[3]!}` : ''));
    const prodCss = stripMedia(mrSegment, '@media (prefers-reduced-motion: reduce)');
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    const animated = new Set<string>();
    const hasTransform = (d: string) => /(?<![-\w])transform\s*:/.test(d);
    const transformNone = (d: string) => /(?<![-\w])transform\s*:\s*none/.test(d);
    for (const { selector, decls } of blocks) {
      const names = mrNames(selector);
      if (/animation:/.test(decls) && !/animation:\s*none/.test(decls)) for (const n of names) animated.add(n);
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (hasTransform(decls) && !transformNone(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size + animated.size + transformed.size, '没扫到任何 mr- 动效源，这道门是空的').toBeGreaterThan(0);
    const rmBlocks = ruleBlocks(mrReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    const animationShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of mrNames(selector)) {
        if (/transition:\s*none/.test(decls)) transitionShut.add(n);
        if (transformNone(decls)) transformShut.add(n);
        if (/animation:\s*none/.test(decls)) animationShut.add(n);
      }
    }
    for (const [name, set, shut, kw] of [
      ['transition', transitioned, transitionShut, 'transition:none'],
      ['transform', transformed, transformShut, 'transform:none'],
      ['animation', animated, animationShut, 'animation:none'],
    ] as const) {
      const notShut = [...set].filter((c) => !shut.has(c));
      expect(notShut, `这些类的 ${name} 没被 ${kw} 真正关掉：${notShut.join(', ')}`).toEqual([]);
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
