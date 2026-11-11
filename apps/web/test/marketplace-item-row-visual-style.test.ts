import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-11 市场交互原子 `MarketplaceItemRow.tsx` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端）。
 *
 * 缺口（改前）：FE-2 给市场**列表外壳**上了 `.mk-` 妆（.mk-card 已精致：渐变卡片 + accent-2 压边 +
 * hover 抬升），但卡片**内部的交互控件全裸**——购买/下载/举报/编辑/下架 5 类按钮、3 处 disabled busy
 * （purchasing/downloading/reportBusy）、2 个 disclosure 面板（edit/report）、表单输入/选择、已购/已举报
 * 徽标，全是裸 Tailwind 原子类（rounded/bg-bg-3/px-2/text-11/...）。这是"外壳精致、控件全裸"的断层，
 * 也是 FE-10 建立的交互态状态语言（`.mp-`）最该推广的真实落点（全站交互最密集处）。
 *
 * FE-11 只动视觉（`.mi-` 语义类），**零行为**，并比 FE-10 加一道更硬的锚：
 *  - **JS 逻辑段 SHA256 逐字节零行为门**：`return (` 之前的全部字节哈希必须恒等——5 个 fetch 端点、
 *    4 处 csrfHeaders、2 处 window.confirm、3 处 router.refresh、12 个 useState、saveBlob、
 *    REPORT_REASONS 枚举、editPanelId/reportPanelId 派生一并钉死，一个字符都不许动。
 *  - **return 段零裸 Tailwind 门**：所有 className token 只能是 `mk-card` 或 `mi-*`，保证门面真正
 *    **替代**裸原子类而非并列堆叠（否则"加了一层语义类、裸类还在"会静默假绿）。
 * 其余门延续 FE-10 骨架，另把 A11Y-2 刚做的 disclosure aria 契约单列门锚守。
 *
 * 判据不变式（先红→绿→变异臂有牙，延续 ADR-0154 / §CRIT-1「锚真实代码、别被注释喂绿」）：
 *  1. 类名闭环：component 每个 `mi-*` 类在 globals.css 有 `.mi-*` **基础定义**（剔 reduced-motion、
 *     只认基础选择器，堵"出现过≠定义过"）；
 *  2. 成规模视觉段（≥18 类）；3. 零写死 hex；4. token 真存在；5. 零新增颜色 token；
 *  6. **return 段零裸 Tailwind 原子类**（门面替代而非堆叠）；
 *  7. 22 个 `data-*` 结构/判据钩子一个不丢；
 *  8. **JS 逻辑段 SHA256 逐字节零行为**（本片最硬锚）；
 *  9. 交互契约零行为（5 fetch / 4 csrf / 2 confirm / 3 refresh / 12 useState / saveBlob / 枚举，含计数）；
 *  10. return 段交互契约零行为（onClick / 3 disabled / 条件分支 / 表单绑定 / 文案分支都在）；
 *  11. A11Y-2 disclosure aria 契约零回归（aria-controls/aria-expanded/id 配对）；
 *  12. 交互态语言：`.mi-` 段覆盖 `:hover` / `:active` / `:disabled` / `:focus-visible`；
 *  13. 动效被 prefers-reduced-motion 真正关掉；
 *  14. 徽标（已购/已举报）与按钮语气（主/次/危险）各有专属 `.mi-` 类，不是同一副裸样子；
 *  15. 注释定界符严格配对（FE-6 真编译挂的洞）。
 *
 * 浏览器那一寸归 `e2e/marketplace-item-row-visual.spec.ts`（setContent 注入真实产物字节）。
 */
const ROOT = process.cwd();
const COMPONENT = join(ROOT, 'apps/web/src/marketplace/MarketplaceItemRow.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const component = readFileSync(COMPONENT, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 去掉 JSDoc 后的**真实代码**——契约门/结构钩子门一律锚它，注释不得喂绿（CRIT-1 纪律）。 */
const code = cssNoComments(component);

function miRules(css: string): string[] {
  return cssNoComments(css)
    .split('\n')
    .filter((line) => /\.mi-[A-Za-z]/.test(line));
}

function pageMiClasses(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/["'`]([^"'`\n]*\bmi-[A-Za-z0-9-]+[^"'`\n]*)["'`]/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (/\bmi-[A-Za-z0-9-]+/.test(cls)) found.add(cls.replace(/[^\w-].*$/, ''));
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

/** globals.css 里有基础规则体的 `.mi-` 主类名（剔 reduced-motion、只认基础选择器）。 */
function definedMiClasses(css: string): Set<string> {
  const clean = stripMedia(cssNoComments(css), '@media (prefers-reduced-motion: reduce)');
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(mi-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
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

/** `.mi-` 视觉段完整文本：从第一个 `.mi-` 到第一个 `.mp-` 之前（FE-11 段插在 FE-10 段前方，互不污染）。 */
const miSegment = (() => {
  const clean = cssNoComments(globals);
  const start = clean.search(/\.mi-[A-Za-z]/);
  if (start < 0) return '';
  const tail = clean.slice(start);
  const nextFacade = tail.search(/\.mp-[A-Za-z]/);
  return (nextFacade >= 0 ? tail.slice(0, nextFacade) : tail);
})();

const miRuleLines = miRules(globals).join('\n');
const miReducedMotionBody = (() => {
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
    if (/\.mi-/.test(body)) out.push(body);
    from = end + 1;
  }
  return out.join('\n');
})();

/** JS 逻辑段：从文件头到 `return (` 之前的全部字节（换行归一，跨 CRLF/LF 稳定）。 */
const JS_SEGMENT_SHA256 = 'cf39bcd64e0bc3abd8f3bac202a25448ea08e59dd66ae358e693eea16d996dec';
function jsSegmentSha256(src: string): string {
  const normalized = src.replace(/\r\n/g, '\n');
  const idx = normalized.indexOf('  return (');
  if (idx < 0) throw new Error('MarketplaceItemRow 找不到主 return (，JS 段无法锚定');
  return createHash('sha256').update(normalized.slice(0, idx).trimEnd()).digest('hex');
}

/** return 段里所有 className token（纯字符串 className，本组件无模板拼接）。 */
function allClassNameTokens(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/className="([^"]*)"/g)) {
    for (const t of m[1]!.split(/\s+/)) if (t) out.push(t);
  }
  return out;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('§FE-11 市场交互原子门面（静态不变式）', () => {
  it('component 用了 .mi- 语义类，且全部在 globals.css 有基础定义（拼错不静默失效）', () => {
    const used = pageMiClasses(code);
    expect(used.length, 'MarketplaceItemRow 一个 mi- 类都没有，门面没接上').toBeGreaterThan(14);
    const defined = definedMiClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 mi- 类在 component 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .mi- 视觉段（不是空壳）', () => {
    expect(definedMiClasses(globals).size, '.mi- 定义太少，FE-11 门面升级没落地').toBeGreaterThanOrEqual(18);
  });

  it('.mi- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界，扫整段含续行）', () => {
    const hex = [...miSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.mi- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.mi- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（扫整段含续行）', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of miSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.mi- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('.mi- 段零新增颜色 token（只引用既有双主题 token，不另立 --nexus-color-*）', () => {
    const newlyDefined = [...miSegment.matchAll(/(--nexus-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect([...new Set(newlyDefined)], `.mi- 段定义了新颜色 token（ADR-0123 零新增红线）：${[...new Set(newlyDefined)].join(', ')}`).toEqual([]);
  });

  it('return 段零裸 Tailwind 原子类：className 只能是 mk-card 或 mi-*（门面替代而非堆叠）', () => {
    const tokens = allClassNameTokens(code);
    expect(tokens.length, 'return 段没扫到任何 className，门面没接上').toBeGreaterThan(14);
    const bare = tokens.filter((t) => t !== 'mk-card' && !t.startsWith('mi-'));
    expect(bare, `仍有裸 Tailwind 原子类没换成 .mi- 语义类：${[...new Set(bare)].join(', ')}`).toEqual([]);
  });

  it('22 个 data-* 结构/判据钩子一个不丢（e2e 与 A11Y 靠它们定位控件/面板/消息）', () => {
    const expected = [
      'data-marketplace-item', 'data-marketplace-preview', 'data-marketplace-item-title',
      'data-marketplace-item-visibility', 'data-marketplace-item-price', 'data-marketplace-purchased',
      'data-marketplace-reported', 'data-marketplace-edit', 'data-marketplace-purchase',
      'data-marketplace-report', 'data-marketplace-download', 'data-marketplace-remove',
      'data-marketplace-edit-panel', 'data-marketplace-edit-price', 'data-marketplace-edit-visibility',
      'data-marketplace-edit-save', 'data-marketplace-report-panel', 'data-marketplace-report-reason',
      'data-marketplace-report-note', 'data-marketplace-report-submit', 'data-marketplace-report-cancel',
      'data-marketplace-item-message',
    ];
    const missing = expected.filter((h) => !code.includes(h));
    expect(missing, `结构/判据钩子丢了：${missing.join(', ')}`).toEqual([]);
  });

  it('JS 逻辑段逐字节零行为：return ( 之前全部字节 SHA256 恒等（5 fetch / 12 useState / aria 派生一并钉死）', () => {
    expect(jsSegmentSha256(component), 'return 前的 JS 逻辑变了（fetch/setter/aria 派生/枚举任一改动都会红）').toBe(JS_SEGMENT_SHA256);
  });

  it('交互契约零行为：5 fetch / 4 csrfHeaders / 2 confirm / 3 refresh / 12 useState / saveBlob / 枚举都在（含计数）', () => {
    expect(countOccurrences(code, 'fetch('), 'fetch 调用数变了').toBe(5);
    for (const ep of [
      '/api/marketplace/${item.id}/purchase',
      '/api/marketplace/${item.id}/content',
      '/api/marketplace/${item.id}',
      '/api/admin/marketplace/reports',
    ]) {
      expect(code, `fetch 端点 ${ep} 丢了`).toContain(ep);
    }
    expect(countOccurrences(code, 'csrfHeaders()'), 'csrfHeaders 调用数变了').toBe(4);
    expect(countOccurrences(code, 'window.confirm('), 'window.confirm 调用数变了').toBe(2);
    expect(countOccurrences(code, 'router.refresh()'), 'router.refresh 调用数变了').toBe(3);
    // 12 个 useState 里两处带泛型（useState<string | null> / useState<ReportReason>），
    // 不能用 'useState(' 字面计数（会漏成 10）；须认可选泛型。逐个再精确锚 const [v, setV] = useState，
    // 否则「对每个变量断言 code 含 useState(」是废断言（同一句话断言 12 遍、等于没守）。
    expect(code.match(/useState(?:<[^(>]+>)?\(/g)?.length, 'useState 数变了（含泛型的两处也要算）').toBe(12);
    for (const v of ['message', 'editing', 'price', 'visibility', 'purchased', 'purchasing', 'downloading', 'reportOpen', 'reportReason', 'reportNote', 'reportBusy', 'reported']) {
      const setter = `set${v.charAt(0).toUpperCase()}${v.slice(1)}`;
      expect(code, `状态 ${v} 的 useState 声明或 setter ${setter} 丢了`).toMatch(
        new RegExp(`const \\[${v}, ${setter}\\] = useState`),
      );
    }
    expect(code, 'saveBlob 交付契约丢了').toContain('saveBlob(');
    expect(code, 'REPORT_REASONS 枚举丢了').toContain('REPORT_REASONS');
    expect(code, 'REPORT_REASON_LABELS 丢了').toContain('REPORT_REASON_LABELS');
  });

  it('return 段交互契约零行为：onClick / 3 disabled / 条件分支 / 表单绑定 / 文案分支都在', () => {
    for (const handler of [
      'void purchase()', 'setEditing((on) => !on)', 'setReportOpen((on) => !on)',
      'void download()', 'void remove()', 'void saveEdit()', 'void submitReport()', 'setReportOpen(false)',
    ]) {
      expect(code, `onClick 契约 ${handler} 丢了`).toContain(handler);
    }
    expect(countOccurrences(code, 'disabled={'), 'disabled 个数变了（应 3 处 busy）').toBe(3);
    for (const d of ['disabled={purchasing}', 'disabled={downloading}', 'disabled={reportBusy}']) {
      expect(code, `disabled 契约 ${d} 丢了`).toContain(d);
    }
    for (const branch of [
      'item.priceCredits === 0', 'item.priceCredits > 0 && !mine && !purchased', 'signedIn && !mine && !reported',
      'mine ?', 'purchased ?', 'reported ?', 'item.previewAssetId ?', 'item.description ?', 'message ?',
    ]) {
      expect(code, `条件渲染分支 ${branch} 丢了`).toContain(branch);
    }
    for (const bind of ['value={price}', 'value={visibility}', 'value={reportReason}', 'value={reportNote}', 'maxLength={1000}', 'type="number"', 'REPORT_REASONS.map']) {
      expect(code, `表单绑定 ${bind} 丢了`).toContain(bind);
    }
    for (const copy of ["'购买中...' : '购买'", "'取包中...'", "'提交中...' : '提交举报'", "'收起' : '改价格/可见性'", "'收起举报' : '举报'"]) {
      expect(code, `文案分支 ${copy} 丢了`).toContain(copy);
    }
  });

  it('A11Y-2 disclosure aria 契约零回归：aria-controls / aria-expanded / 面板 id 配对都在', () => {
    expect(code, 'editPanelId 派生丢了').toContain('const editPanelId = `marketplace-edit-${item.id}`');
    expect(code, 'reportPanelId 派生丢了').toContain('const reportPanelId = `marketplace-report-${item.id}`');
    expect(code, '编辑按钮 aria-expanded 丢了').toContain('aria-expanded={editing}');
    expect(code, '编辑按钮 aria-controls 丢了').toContain('aria-controls={editing ? editPanelId : undefined}');
    expect(code, '举报按钮 aria-expanded 丢了').toContain('aria-expanded={reportOpen}');
    expect(code, '举报按钮 aria-controls 丢了').toContain('aria-controls={reportOpen ? reportPanelId : undefined}');
    expect(code, '编辑面板 id 配对丢了').toContain('id={editPanelId}');
    expect(code, '举报面板 id 配对丢了').toContain('id={reportPanelId}');
  });

  it('交互态语言存在：.mi- 段覆盖 :hover / :active / :disabled / :focus-visible', () => {
    expect(miRuleLines, '.mi- 段零 :hover 反馈').toMatch(/\.mi-[A-Za-z0-9-]+:hover/);
    expect(miRuleLines, '.mi- 段零 :active 按下反馈').toMatch(/\.mi-[A-Za-z0-9-]+:active/);
    expect(miRuleLines, '.mi- 段零 :disabled 禁用视觉（3 处 busy 无反馈）').toMatch(/\.mi-[A-Za-z0-9-]+:disabled/);
    expect(miRuleLines, '.mi- 段零 :focus-visible 键盘描边（按钮/表单不可达）').toMatch(/\.mi-[A-Za-z0-9-]+:focus-visible/);
  });

  it('用了动效的 .mi- 类都被 prefers-reduced-motion 在同一批规则里真正关掉', () => {
    expect(miReducedMotionBody, 'mi- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    const base = (s: string) => s.replace(/:(hover|focus-visible|active|disabled|before|after).*$/, '');
    const miNames = (sel: string) => [...sel.matchAll(/\.(mi-[A-Za-z0-9-]+)/g)].map((m) => base(m[1]!));

    const prodCss = stripMedia(miSegment, '@media (prefers-reduced-motion: reduce)');
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    const animated = new Set<string>();
    const hasTransform = (d: string) => /(?<![-\w])transform\s*:/.test(d);
    const transformNone = (d: string) => /(?<![-\w])transform\s*:\s*none/.test(d);
    for (const { selector, decls } of blocks) {
      const names = miNames(selector);
      if (/animation:/.test(decls) && !/animation:\s*none/.test(decls)) for (const n of names) animated.add(n);
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (hasTransform(decls) && !transformNone(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size + animated.size + transformed.size, '没扫到任何 mi- 动效源，这道门是空的').toBeGreaterThan(0);

    const rmBlocks = ruleBlocks(miReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    const animationShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of miNames(selector)) {
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

  it('徽标（已购/已举报）与按钮语气（主/次/危险）各有专属 .mi- 类，不是同一副裸样子', () => {
    const defined = definedMiClasses(globals);
    const used = pageMiClasses(code);
    for (const cls of ['mi-badgePurchased', 'mi-badgeReported', 'mi-btnPrimary', 'mi-btnGhost', 'mi-btnDanger']) {
      expect(used, `component 缺 ${cls} 类`).toContain(cls);
      expect(defined, `globals.css 缺 ${cls} 基础定义`).toContain(cls);
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
