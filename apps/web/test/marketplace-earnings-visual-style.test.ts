import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-12 创作者收入页 `/marketplace/earnings` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端）。
 *
 * 缺口（改前）：FE-2 只给市场列表外壳上了 `.mk-`，FE-10 给 purchases 子页上了 `.mp-` 门面，
 * 但顶栏送 logged-in 用户进的**三兄弟**里 earnings 仍是**全裸 Tailwind 原子类**——loading/error/
 * empty/data 四态 + 汇总卡（累计收入/总销量）+ 每日明细表格，全无门面语言。这是 ADR-0158/0159
 * 反复记的"purchases/earnings/reports 三兄弟"欠账的第二个，也是 FE-10 `.mp-` 模板片最稳的复用。
 *
 * FE-12 只动视觉（`.me-` 语义类），**零行为**，沿用 FE-11 的哈希硬门：
 *  - **JS 逻辑段 SHA256 逐字节零行为门**：文件头到 `if (loading)` 之前的全部字节（imports + 两个
 *    interface + 组件签名 + useRouter + 3 useState + useEffect 全量）哈希恒等——fetch 端点、401
 *    跳转、状态机与 setter 一并钉死。earnings 有 3 个提前 `return <div>`，故哈希锚点取"第一个
 *    分支判断之前"那段**绝不含 className** 的纯 JS；4 个分支判断、data-* 钩子、插值由下方契约门守。
 *  - **return 段零裸 Tailwind 门**：所有 className token 只能是 `me-*`，保证门面**替代**而非堆叠。
 *
 * 判据不变式（先红→绿→变异臂有牙，延续 ADR-0154 / §CRIT-1「锚真实代码、别被注释喂绿」）：
 *  1. 类名闭环：page 每个 `me-*` 类在 globals.css 有 `.me-*` **基础定义**（剔 reduced-motion、
 *     只认基础选择器）；
 *  2. 成规模视觉段（≥16 类）；3. 零写死 hex；4. token 真存在；5. 零新增颜色 token；
 *  6. **page 零裸 Tailwind 原子类**（门面替代而非堆叠）；
 *  7. 结构/判据钩子一个不丢（data-earnings-total/sales）；
 *  8. **JS 逻辑段 SHA256 逐字节零行为**（本片最硬锚）；
 *  9. 状态机/交互契约零行为（fetch 端点 / 401 跳转 / 3 setter / 3 分支 / 插值都在，含计数）；
 *  10. 四态各有专属 `.me-` 类（loading/error/empty/data 不是同一副裸样子）；
 *  11. 动效被 prefers-reduced-motion 真正关掉；
 *  12. 注释定界符严格配对（FE-6 真编译挂的洞）。
 *
 * 说明：earnings 是**纯展示页**（无按钮/链接/输入），故不设 `:focus-visible` 门——该门只在有
 * 键盘交互控件的门面（FE-10 `.mp-` / FE-11 `.mi-`）成立；本片门面收益在四态与表格的视觉层次。
 *
 * 本片**不加渐变墨字**，故不触发 A11Y-1 forced-colors 联动；全局不变式仍由
 * `forced-colors-style.test.ts` 守。浏览器那一寸归 `e2e/marketplace-earnings-visual.spec.ts`。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/marketplace/earnings/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 去掉 JSDoc / 行注释后的**真实代码**——契约门/结构钩子门一律锚它，注释不得喂绿（CRIT-1）。 */
const code = cssNoComments(page);

function pageMeClasses(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/["'`]([^"'`\n]*\bme-[A-Za-z0-9-]+[^"'`\n]*)["'`]/g)) {
    for (const cls of m[1]!.split(/\s+/)) {
      if (/\bme-[A-Za-z0-9-]+/.test(cls)) found.add(cls.replace(/[^\w-].*$/, ''));
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

/** globals.css 里有基础规则体的 `.me-` 主类名（剔 reduced-motion、只认基础选择器）。 */
function definedMeClasses(css: string): Set<string> {
  const clean = stripMedia(cssNoComments(css), '@media (prefers-reduced-motion: reduce)');
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(me-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
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

/** `.me-` 视觉段完整文本：从第一个 `.me-` 到第一个 `.mi-` 之前（FE-12 段插在 FE-11 `.mi-` 前方）。 */
const meSegment = (() => {
  const clean = cssNoComments(globals);
  const start = clean.search(/\.me-[A-Za-z]/);
  if (start < 0) return '';
  const tail = clean.slice(start);
  const nextFacade = tail.search(/\.mi-[A-Za-z]/);
  return nextFacade >= 0 ? tail.slice(0, nextFacade) : tail;
})();

const meReducedMotionBody = (() => {
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
    if (/\.me-/.test(body)) out.push(body);
    from = end + 1;
  }
  return out.join('\n');
})();

/** JS 逻辑段：文件头到第一个 `if (loading)` 之前的全部字节（此段绝不含 className）。 */
const JS_LOGIC_SHA256 = '677abf1341e37de986b0e91d817f4d4398051ea26092df14ac0e6728b7128bba';
function jsLogicSha256(src: string): string {
  const normalized = src.replace(/\r\n/g, '\n');
  const idx = normalized.indexOf('  if (loading)');
  if (idx < 0) throw new Error('earnings 找不到 if (loading) 分支，JS 逻辑段无法锚定');
  return createHash('sha256').update(normalized.slice(0, idx).trimEnd()).digest('hex');
}

/** 全文件所有 className token（earnings 全为静态字符串，无模板拼接）。 */
function allClassNameTokens(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/className="([^"]*)"/g)) {
    for (const t of m[1]!.split(/\s+/)) if (t) out.push(t);
  }
  return out;
}

describe('§FE-12 创作者收入页门面（静态不变式）', () => {
  it('page 用了 .me- 语义类，且全部在 globals.css 有基础定义（拼错不静默失效）', () => {
    const used = pageMeClasses(code);
    expect(used.length, 'earnings 一个 me- 类都没有，门面没接上').toBeGreaterThan(12);
    const defined = definedMeClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 me- 类在 page 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
  });

  it('globals.css 定义了成规模的 .me- 视觉段（不是空壳）', () => {
    expect(definedMeClasses(globals).size, '.me- 定义太少，FE-12 门面升级没落地').toBeGreaterThanOrEqual(16);
  });

  it('.me- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界，扫整段含续行）', () => {
    const hex = [...meSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.me- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.me- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（扫整段含续行）', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of meSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.me- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('.me- 段零新增颜色 token（只引用既有双主题 token，不另立 --nexus-color-*）', () => {
    const newlyDefined = [...meSegment.matchAll(/(--nexus-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect([...new Set(newlyDefined)], `.me- 段定义了新颜色 token（ADR-0123 零新增红线）：${[...new Set(newlyDefined)].join(', ')}`).toEqual([]);
  });

  it('page 零裸 Tailwind 原子类：className 只能是 me-*（门面替代而非堆叠）', () => {
    const classTokens = allClassNameTokens(code);
    expect(classTokens.length, 'page 没扫到任何 className，门面没接上').toBeGreaterThan(12);
    const bare = classTokens.filter((t) => !t.startsWith('me-'));
    expect(bare, `仍有裸 Tailwind 原子类没换成 .me- 语义类：${[...new Set(bare)].join(', ')}`).toEqual([]);
  });

  it('结构/判据钩子一个不丢（data-earnings-total / data-earnings-sales）', () => {
    for (const h of ['data-earnings-total', 'data-earnings-sales']) {
      expect(code, `结构/判据钩子 ${h} 丢了`).toContain(h);
    }
  });

  it('JS 逻辑段逐字节零行为：if (loading) 前全部字节 SHA256 恒等（imports/状态机/useEffect 钉死）', () => {
    expect(jsLogicSha256(page), 'JS 逻辑变了（fetch 端点/401 跳转/setter/useEffect 任一改动都会红）').toBe(JS_LOGIC_SHA256);
  });

  it('状态机/交互契约零行为：fetch 端点 / 401 跳转 / 3 setter / 3 分支 / 插值都在（含计数）', () => {
    expect(code, 'fetch 端点变了（行为改动）').toMatch(/fetch\(['"]\/api\/marketplace\/earnings['"]\)/);
    expect(code, '401 未登录跳登录页契约丢了').toMatch(/res\.status === 401[\s\S]*?router\.push\(['"]\/login['"]\)/);
    expect(code, 'useEffect 依赖契约丢了').toContain('}, [router]);');
    // 3 个 useState 里两处带泛型（useState<CreatorEarningsSummary | null> / useState<string | null>），
    // 不能用 'useState(' 字面计数（会漏成 1）；须认可选泛型。
    expect(code.match(/useState(?:<[^(>]+>)?\(/g)?.length, 'useState 数变了（含泛型两处也要算）').toBe(3);
    for (const v of ['summary', 'loading', 'error']) {
      const setter = `set${v.charAt(0).toUpperCase()}${v.slice(1)}`;
      expect(code, `状态 ${v} 的 useState 声明或 setter ${setter} 丢了`).toMatch(
        new RegExp(`const \\[${v}, ${setter}\\] = useState`),
      );
    }
    // 3 个提前 return 分支 + 主 data 态
    for (const branch of ['if (loading)', 'if (error)', 'if (!summary)']) {
      expect(code, `状态分支 ${branch} 丢了`).toContain(branch);
    }
    // 插值与每日表格映射一字不动
    for (const expr of [
      'summary.totalEarned', 'summary.totalSales', 'summary.dailyBreakdown.length > 0',
      'summary.dailyBreakdown.map((day)', 'day.date', 'day.salesCount', 'day.totalAmount',
    ]) {
      expect(code, `插值/映射 ${expr} 丢了`).toContain(expr);
    }
  });

  it('四态各有专属 .me- 视觉类（loading/error/empty/data 不是同一副裸样子）', () => {
    const defined = definedMeClasses(globals);
    const used = pageMeClasses(code);
    for (const kind of ['loading', 'error', 'empty']) {
      expect(used.some((c) => c.startsWith(`me-${kind}`)), `page 缺 me-${kind}* 类`).toBe(true);
      expect([...defined].some((c) => c.startsWith(`me-${kind}`)), `globals.css 缺 me-${kind}* 定义`).toBe(true);
    }
    // data 态主容器也在（不是只有三个提前 return 有门面）
    expect(used, 'page 缺 me-root 主容器类').toContain('me-root');
    expect(defined, 'globals.css 缺 me-root 定义').toContain('me-root');
  });

  it('用了动效的 .me- 类都被 prefers-reduced-motion 真正关掉', () => {
    expect(meReducedMotionBody, 'me- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    // 伪元素（::before / ::after）的 animation 是**独立于基础类**的动画槽，不能按类名归并：
    // 否则 `.me-loading::before { animation: me-pulse }` 与 `.me-loading { animation: me-fade-in }`
    // 都归成 me-loading，reduced 块里关基础类的那条 animation:none 会"假装"同时关掉伪元素，
    // 删掉 `.me-loading::before { animation:none }` 仍全绿（变异臂 C 假绿逼出的修实，§CRIT-1）。
    // 故这里把伪元素保留成独立 key（me-loading::before），逐一核对各自的 animation:none。
    const meNames = (sel: string): string[] =>
      [...sel.matchAll(/\.(me-[A-Za-z0-9-]+)(::?(before|after))?/g)].map(
        (m) => m[1]! + (m[2] ? `::${m[3]!}` : ''),
      );

    const prodCss = stripMedia(meSegment, '@media (prefers-reduced-motion: reduce)');
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    const animated = new Set<string>();
    const hasTransform = (d: string) => /(?<![-\w])transform\s*:/.test(d);
    const transformNone = (d: string) => /(?<![-\w])transform\s*:\s*none/.test(d);
    for (const { selector, decls } of blocks) {
      const names = meNames(selector);
      if (/animation:/.test(decls) && !/animation:\s*none/.test(decls)) for (const n of names) animated.add(n);
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (hasTransform(decls) && !transformNone(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size + animated.size + transformed.size, '没扫到任何 me- 动效源，这道门是空的').toBeGreaterThan(0);

    const rmBlocks = ruleBlocks(meReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    const animationShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of meNames(selector)) {
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
