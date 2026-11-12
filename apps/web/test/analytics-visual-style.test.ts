import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-14 创作数据页 `/analytics` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端）。
 *
 * 全库裸 Tailwind 密度最高的一片（改造前 58 个去重原子类 / 88 处 className），也是 FE 序列
 * **最大的 server 门面页** + **首个三元动态 className**（range option 选中态：
 * `className={option === windowDays ? 'text-fg-1 underline' : 'text-accent-2-ink underline'}`）。
 * 与之同页的 `TrendChart.tsx`（SVG 三轴语义色守恒）另立 FE-15，本判据只管 `page.tsx`。
 *
 * 缺口（改前）：analytics 是登录后 server 组件，双层口径（窗口 / 累计）、12 条 DEFINITIONS
 * 诚实文案、12 列表格、agent 规则分析区、按天趋势区、CSV 导出、7 类告警 / 爬虫 / 截断旁注——
 * 全裸 Tailwind。本页的成败不在"有没有图"，在"每个数字说的是不是真话"（§168）与这些门面
 * 语言的层次；门面化必须**逐字节不动**那些诚实文案与取数链。
 *
 * **双段哈希为何"先红时行为门就绿"**：段 A（文件头→`function Cell` 前，含 imports、常量、
 * `duration`、全部 12 条 DEFINITIONS）与段 B（`creatorAnalytics` 起到 `publicationTrend` 止的
 * 8 项取数链 + 窗口钳制）**都零 className**，故改造前后逐字节恒等。先红（未门面化）时视觉门
 * 红、行为门（双段哈希 / 27 data 钩子 / 契约零行为 / a11y 契约）**本就绿**——这本身是
 * "缺口纯视觉、零行为"的可执行证据，而非事后声明（延续 ADR-0154 / §CRIT-1）。
 *
 * 判据不变式：
 *  1. 类名闭环：page 每个 `an-*` 类（**含三元两分支值**）在 globals.css 有 `.an-*` 基础定义；
 *  2. 成规模视觉段（≥28）；3. 零写死 hex；4. token 真存在；5. 零新增颜色 token；
 *  6. **page 零裸 Tailwind**（静态 `className="…"` + 模板串 + **三元 `className={…}` 的引号
 *     字面量**三形态全扫，剔除 `${}` 插值与 JS 条件标识符）；
 *  7. **首个三元动态类门**：条件 `option === windowDays` 逐字不动、两分支换成 `an-rangeOn`/
 *     `an-rangeOff`、且 globals.css 里两档视觉可分；
 *  8. 27 个 `data-analytics-*` 钩子一个不丢（含带值的 window/value/project-window 计数）；
 *  9. **双段 JS 逻辑 SHA256 逐字节零行为**（段 A 2206 字节 / 段 B 954 字节）；
 *  10. 域函数 / 纯函数 / DEFINITIONS / 三元分支 / 诚实文案契约零行为（**含计数**：12 条定义、
 *      12 列表头、5 value / 7 window / 4 project-window、三类"只有你自己…"、四类"未计入"）；
 *  11. a11y 契约零行为：横滚 `role="region"`+`aria-label`+`tabIndex={0}`、CSV `download`、
 *      外链 `target="_blank" rel="noreferrer"`；
 *  12. 告警 / 数字 / 旁注各有专属 `.an-*` 类，`text-amber-300` 裸色换 token 化语义类；
 *  13. 多个 `<Link>`/`<a>` `:focus-visible` 键盘描边；
 *  14. 动效被 prefers-reduced-motion 真关掉（伪元素独立动画槽沿用 FE-12）；
 *  15. 注释定界符严格配对。
 *
 * 本片**不加渐变墨字**，不触发 A11Y-1 forced-colors 联动。浏览器那一寸归
 * `e2e/analytics-visual.spec.ts`。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/analytics/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

function cssNoComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 去掉注释后的真实代码——契约门/结构钩子门锚它，注释不得喂绿（CRIT-1）。 */
const code = cssNoComments(page);

function anRules(css: string): string[] {
  return cssNoComments(css)
    .split('\n')
    .filter((line) => /\.an-[A-Za-z]/.test(line));
}

/** 从任意字符串里抽出所有 `an-*` token（含三元组值、含模板串插值剔除）。 */
function anTokensOf(s: string): string[] {
  return [...s.matchAll(/\ban-[A-Za-z0-9-]+/g)].map((m) => m[0]!);
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

/** globals.css 里有基础规则体的 `.an-` 主类名（剔 reduced-motion、只认基础选择器）。 */
function definedAnClasses(css: string): Set<string> {
  const clean = stripMedia(cssNoComments(css), '@media (prefers-reduced-motion: reduce)');
  const out = new Set<string>();
  for (const line of clean.split('\n')) {
    for (const m of line.matchAll(/\.(an-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
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

/** `.an-` 视觉段完整文本：首个 `.an-` 到首个 `.mr-` 之前（FE-14 段插在 FE-13 `.mr-` 前方）。 */
const anSegment = (() => {
  const clean = cssNoComments(globals);
  const start = clean.search(/\.an-[A-Za-z]/);
  if (start < 0) return '';
  const tail = clean.slice(start);
  const nextFacade = tail.search(/\.mr-[A-Za-z]/);
  return nextFacade >= 0 ? tail.slice(0, nextFacade) : tail;
})();

const anRuleLines = anRules(globals).join('\n');
const anReducedMotionBody = (() => {
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
    if (/\.an-/.test(body)) out.push(body);
    from = end + 1;
  }
  return out.join('\n');
})();

/** 双段 JS 逻辑哈希：段 A = 文件头到 `function Cell`；段 B = creatorAnalytics 到 publicationTrend 取数链。 */
const SEG_A_SHA256 = '0b1f28fcaf0e41d14de0c1a70154043e2d96a2b1131aa6716ddc1bf549c050b8';
const SEG_B_SHA256 = 'dd0dd3ea30bac4961283608be32bbd8f398b4dcb2ff318f32fe69f813c065f63';

/**
 * **剥 className 后全文逐字节哈希**（本片第三道、也是最强一道零行为门）：FE-14 是全库最大门面页，
 * 88 处静态 + 1 处三元 className 散落在段 A/B 之间（含 Cell / CompletionCell 两个带 JSX 逻辑的
 * 组件的 value===null / toLocaleString / avgPct / over 分支），逐条契约门挂一漏万。此门把所有
 * className 的**值**归一成 `@`，保留三元条件、分支结构、全部文案、data 钩子、域逻辑——改前（全裸）
 * 与改后（.an-）必须**逐字节恒等**，从而证明"除 className 字面值外一个字节都没动"。
 * 与双段哈希互补：双段锚原样字节（段 A/B 本就零 className），此门锚剥类后的**整份**文件。
 */
const STRIP_CLASS_SHA256 = '614916b9db97ed38ecf745ff198b341297b153c6e1b08e3ee49a4bb0a0747cf6';
function stripClassNames(src: string): string {
  const s = src.replace(/\r\n/g, '\n');
  // 三元/表达式：保留条件与 ? :，只把引号字面量归一；再吞静态 className="…"
  let t = s.replace(/className=\{([^}]*)\}/g, (_m, expr: string) =>
    'className={' + expr.replace(/'[^']*'/g, "'@'").replace(/"[^"]*"/g, '"@"') + '}',
  );
  t = t.replace(/className="[^"]*"/g, 'className="@"');
  return t;
}
const SEG_B_START = '  const rows = await creatorAnalytics(user.id);';
const SEG_B_END = '  const trend = projectId ? await publicationTrend(user.id, projectId, window) : null;';
function jsLogicSegments(src: string): { a: string; b: string } {
  const s = src.replace(/\r\n/g, '\n');
  const aIdx = s.indexOf('function Cell({');
  const bStart = s.indexOf(SEG_B_START);
  const bEndExpr = s.indexOf(SEG_B_END);
  if (aIdx < 0 || bStart < 0 || bEndExpr < 0) throw new Error('analytics 双段 JS 锚点找不到');
  const bEnd = bEndExpr + SEG_B_END.length;
  return {
    a: createHash('sha256').update(s.slice(0, aIdx).trimEnd()).digest('hex'),
    b: createHash('sha256').update(s.slice(bStart, bEnd).trimEnd()).digest('hex'),
  };
}

/**
 * 全文件 className token：**三形态**——静态 `className="…"`、模板串 `className={`…`}`、
 * 三元/表达式 `className={…}` 里的**引号字面量**。剔除 `${…}` 插值与 JS 条件标识符，
 * 只留"会被当成 class 的字符串"。FE-14 首个三元动态类门即建在这之上。
 */
function allClassNameTokens(src: string): string[] {
  const out: string[] = [];
  const push = (raw: string): void => {
    for (const t of raw.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (t) out.push(t);
  };
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) push(m[1] ?? m[2] ?? '');
  for (const m of src.matchAll(/className=\{(?!`)([^}]*)\}/g)) {
    for (const lit of m[1]!.matchAll(/'([^']*)'|"([^"]*)"/g)) push(lit[1] ?? lit[2] ?? '');
  }
  return out;
}

/** 首个三元 className 的条件与两分支（FE-14 首个动态类门锚它）。 */
function ternaryClass(src: string): { condition: string; branches: string[] } {
  const m = src.match(/className=\{([^}]*\?[^}]*:[^}]*)\}/);
  if (!m) throw new Error('analytics 三元动态 className 找不到——FE-14 首个三元门没接上');
  const expr = m[1]!;
  const condition = expr.slice(0, expr.indexOf('?')).trim();
  const branches = [...expr.matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) => (x[1] ?? x[2] ?? '').trim());
  return { condition, branches };
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('§FE-14 创作数据页门面（静态不变式）', () => {
  it('page 用了 .an- 语义类（含三元两分支值），全部有 globals.css 基础定义', () => {
    const used = [...new Set(anTokensOf(code))].sort();
    expect(used.length, 'analytics 一个 an- 类都没有，门面没接上').toBeGreaterThan(28);
    const defined = definedAnClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 an- 类在 page 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
    // 三元两分支也须是 an-* 语义类
    const { branches } = ternaryClass(code);
    expect(branches.length, '三元 className 两分支没扫到').toBe(2);
    for (const b of branches) {
      const t = b.split(/\s+/)[0]!;
      expect(t.startsWith('an-'), `三元分支仍是裸 Tailwind：${b}`).toBe(true);
      expect(defined, `三元分支类 ${t} 没在 globals.css 定义`).toContain(t);
    }
  });

  it('globals.css 定义了成规模的 .an- 视觉段（不是空壳）', () => {
    expect(definedAnClasses(globals).size, '.an- 定义太少，FE-14 门面升级没落地').toBeGreaterThanOrEqual(28);
  });

  it('.an- 段里没有写死的 hex 颜色（零新增颜色 token 硬边界，扫整段含续行）', () => {
    expect(anSegment.length, '.an- 视觉段为空，零 hex 门不能假绿').toBeGreaterThan(200);
    const hex = [...anSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.an- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.an- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（扫整段含续行）', () => {
    expect(anSegment.length, '.an- 视觉段为空，token 门不能假绿').toBeGreaterThan(200);
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of anSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.an- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
  });

  it('.an- 段零新增颜色 token（只引用既有双主题 token，不另立 --nexus-color-*）', () => {
    const newlyDefined = [...anSegment.matchAll(/(--nexus-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect([...new Set(newlyDefined)], `.an- 段定义了新颜色 token（ADR-0123 零新增红线）：${[...new Set(newlyDefined)].join(', ')}`).toEqual([]);
  });

  it('page 零裸 Tailwind：静态/模板/三元三形态 className 只能是 an-*', () => {
    const classTokens = allClassNameTokens(code);
    expect(classTokens.length, 'page 没扫到任何 className，门面没接上').toBeGreaterThan(60);
    const bare = classTokens.filter((t) => !t.startsWith('an-'));
    expect(bare, `仍有裸 Tailwind 原子类没换成 .an-：${[...new Set(bare)].join(', ')}`).toEqual([]);
  });

  it('首个三元动态类门：条件 option === windowDays 逐字不动，两分支 an-rangeOn/an-rangeOff 视觉可分', () => {
    expect(code, 'range option 三元条件丢了').toContain('option === windowDays');
    const { condition, branches } = ternaryClass(code);
    expect(condition, '三元条件不是 option === windowDays').toBe('option === windowDays');
    expect(branches.map((b) => b.trim()), 'range 两分支类名不是 an-rangeOn/an-rangeOff').toEqual([
      'an-rangeOn',
      'an-rangeOff',
    ]);
    // 两档在 globals.css 的声明必须**不同**（选中态比未选中态更强，不是同一副）
    const declOf = (cls: string): string => {
      const m = anRuleLines.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
      return m ? m[1]!.replace(/\s+/g, ' ').trim() : '';
    };
    const on = declOf('an-rangeOn');
    const off = declOf('an-rangeOff');
    expect(on, 'an-rangeOn 缺基础定义').toBeTruthy();
    expect(off, 'an-rangeOff 缺基础定义').toBeTruthy();
    expect(on, 'an-rangeOn 与 an-rangeOff 视觉趋同——三元选中态没分档').not.toBe(off);
  });

  it('27 个 data-analytics-* 钩子一个不丢（denied/export/agent/表格/窗口/图表调用...）', () => {
    const expected = [
      'data-analytics-denied', 'data-analytics-page', 'data-analytics-export',
      'data-analytics-agent', 'data-analytics-agent-denied', 'data-analytics-agent-clean',
      'data-analytics-finding', 'data-analytics-project-trend', 'data-analytics-project-window',
      'data-analytics-trend', 'data-analytics-range', 'data-analytics-range-option',
      'data-analytics-window-totals', 'data-analytics-window', 'data-analytics-empty',
      'data-analytics-table-scroll', 'data-analytics-row', 'data-analytics-ask',
      'data-analytics-selfonly', 'data-analytics-self-completed', 'data-analytics-self-interactive-completed',
      'data-analytics-capped', 'data-analytics-bots', 'data-analytics-bot-completions',
      'data-analytics-bot-interactive-completions', 'data-analytics-interactive', 'data-analytics-value',
    ];
    const missing = expected.filter((h) => !code.includes(h));
    expect(missing, `结构/判据钩子丢了：${missing.join(', ')}`).toEqual([]);
    // 带值的钩子计数（多格 / 多行映射）
    expect(countOccurrences(code, 'data-analytics-value='), 'value 钩子数变了').toBe(5);
    expect(countOccurrences(code, 'data-analytics-window='), 'window 钩子数变了').toBe(7);
    expect(countOccurrences(code, 'data-analytics-project-window='), 'project-window 钩子数变了').toBe(4);
  });

  it('双段 JS 逻辑逐字节零行为：段 A（imports/常量/duration/DEFINITIONS）与段 B（8 项取数链）SHA256 恒等', () => {
    const seg = jsLogicSegments(page);
    expect(seg.a, '段 A（imports/dynamic/duration/12 条定义）变了').toBe(SEG_A_SHA256);
    expect(seg.b, '段 B（creatorAnalytics→publicationTrend 取数链）变了').toBe(SEG_B_SHA256);
  });

  it('剥 className 后全文逐字节零行为：89 处类值之外（含三元条件/Cell 分支/全部文案）一个字节没动', () => {
    // 全库最大门面页的最强零行为门：className 值归一后整份文件哈希恒等。
    expect(createHash('sha256').update(stripClassNames(page).trimEnd()).digest('hex'),
      '剥类后全文变了——改动溢出 className，纯视觉零行为承诺不成立').toBe(STRIP_CLASS_SHA256);
  });

  it('域函数 / 纯函数 / DEFINITIONS / 诚实文案契约零行为（含计数）', () => {
    // 域函数直连 + 双次读时钟口径
    for (const call of [
      'await currentUserOrNull()', 'await creatorAnalytics(user.id)',
      'await creatorOverview(user.id, window)', 'await publicationTrend(user.id, projectId, window)',
      'await buildCreatorFact(projectId, user.id)', 'analyzeCreatorFacts(fact)',
      'dayWindow(utcDay(new Date()), windowDays)',
    ]) {
      expect(code, `域函数直连契约丢了：${call}`).toContain(call);
    }
    expect(code, 'force-dynamic 契约丢了').toContain("export const dynamic = 'force-dynamic'");
    // 窗口钳制：只认三档（防止 ?days=100000 拉库十年）
    expect(code, 'RANGE_OPTIONS 三档丢了').toContain('const RANGE_OPTIONS = [7, 30, 90] as const');
    expect(code, 'DEFAULT_RANGE 丢了').toContain('const DEFAULT_RANGE = 30;');
    expect(code, '窗口钳制丢了').toContain('(RANGE_OPTIONS as readonly number[]).includes(requested)');
    expect(code, 'denied 分支丢了').toContain('if (!user)');
    expect(code, '空/数据表格分支丢了').toContain('rows.length === 0');
    // DEFINITIONS 12 条（诚实口径的核心，进段 A 哈希之外再单独计数）
    // 先红时曾写死 13→假红，读码证实是 12（打开次数…连续有人来），§CRIT-1 纪律当场修实。
    expect(countOccurrences(code, "label: '"), 'DEFINITIONS 条数变了').toBe(12);
    for (const label of [
      '打开次数', '今天 / 访客', '点赞 / 改编', '粉丝', '完成度', '通关过', '互动完成',
      '浏览时长', '疑似爬虫', '窗口口径', '窗口访客', '连续有人来',
    ]) {
      expect(code, `DEFINITIONS「${label}」丢了`).toContain(`label: '${label}'`);
    }
    // 12 列表头逐字
    for (const th of ['作品', '可见性', '打开', '今天', '访客', '点赞', '改编', '粉丝', '完成度', '通关过', '互动完成', '时长']) {
      expect(code, `表头「${th}」丢了`).toContain(`>${th}</th>`);
    }
    // 三类"只有你自己…" + 四类"未计入/截断"旁注
    for (const copy of [
      '只有你自己看过', '只有你自己通关过', '只有你自己走通过',
      '次上报被截断', '次打开来自爬虫/自动化（未计入）',
      '次通关来自爬虫/自动化（未计入）', '次走通来自爬虫/自动化（未计入）',
    ]) {
      expect(code, `诚实旁注「${copy}」丢了`).toContain(copy);
    }
    // 双层口径诚实边界（窗口 vs 累计不可互推）逐字
    for (const copy of [
      '窗口口径', '累计口径', '两者不是同一个数、也不能互相推',
      '这一条限度不假装已经解决', '人·天',
      '未采集', '为什么没人看？', '收起这份分析', '回到我的项目',
    ]) {
      expect(code, `诚实文案「${copy.slice(0, 12)}…」丢了`).toContain(copy);
    }
  });

  it('a11y 契约零行为：横滚 region / CSV download / 外链 noreferrer 一个不动', () => {
    expect(code, '横滚 role=region 丢了').toContain('role="region"');
    expect(code, '横滚 aria-label 丢了').toContain('aria-label="作品数据表（可横向滚动）"');
    expect(code, '横滚键盘可达 tabIndex 丢了').toContain('tabIndex={0}');
    expect(code, 'CSV 导出 href 丢了').toContain('href="/api/analytics/export"');
    expect(code, 'CSV download 文件名丢了').toContain('download="creator-analytics.csv"');
    expect(code, '作品外链 target=_blank 丢了').toContain('target="_blank"');
    expect(code, '作品外链 rel=noreferrer 丢了').toContain('rel="noreferrer"');
    expect(code, 'TrendChart 调用 days 丢了').toContain('days={overview.days}');
    expect(code, 'TrendChart 调用 emptyNote 丢了').toContain('emptyNote=');
  });

  it('告警 / 数字 / 旁注各有专属 .an-* 类，裸色 text-amber-300 已 token 化', () => {
    const defined = definedAnClasses(globals);
    for (const cls of [
      'an-flagWarn', 'an-flagMuted', 'an-cell', 'an-cellMuted', 'an-cellNote',
      'an-workLink', 'an-version', 'an-ask', 'an-visibility', 'an-mono', 'an-muted',
    ]) {
      expect(defined, `globals.css 缺 ${cls} 基础定义`).toContain(cls);
      expect(code, `page 缺 ${cls} 使用`).toContain(cls);
    }
    expect(code, '裸色 text-amber-300 没换成 token 化语义类').not.toContain('text-amber-300');
    expect(anSegment, '告警类未锚 --nexus-color-warn-ink token').toMatch(/--nexus-color-warn-ink/);
  });

  it('多个 Link / <a> 都有 :focus-visible 键盘描边', () => {
    for (const cls of [
      'an-homeLink', 'an-export', 'an-close', 'an-rangeOn', 'an-rangeOff',
      'an-ask', 'an-workLink', 'an-back',
    ]) {
      expect(anRuleLines, `${cls} 缺 :focus-visible`).toMatch(new RegExp(`\\.${cls}:focus-visible`));
    }
  });

  it('用了动效的 .an- 类都被 prefers-reduced-motion 在同一批规则里真正关掉', () => {
    expect(anReducedMotionBody, 'an- 段没有 prefers-reduced-motion 收口').toBeTruthy();
    // 伪元素作独立动画槽（FE-12 修实纪律沿用），不与基础类归并
    const anNames = (sel: string): string[] =>
      [...sel.matchAll(/\.(an-[A-Za-z0-9-]+)(::?(before|after))?/g)].map((m) => m[1]! + (m[2] ? `::${m[3]!}` : ''));
    const prodCss = stripMedia(anSegment, '@media (prefers-reduced-motion: reduce)');
    const blocks = ruleBlocks(prodCss);
    const transitioned = new Set<string>();
    const transformed = new Set<string>();
    const animated = new Set<string>();
    const hasTransform = (d: string) => /(?<![-\w])transform\s*:/.test(d);
    const transformNone = (d: string) => /(?<![-\w])transform\s*:\s*none/.test(d);
    for (const { selector, decls } of blocks) {
      const names = anNames(selector);
      if (/animation:/.test(decls) && !/animation:\s*none/.test(decls)) for (const n of names) animated.add(n);
      if (/transition:/.test(decls) && !/transition:\s*none/.test(decls)) for (const n of names) transitioned.add(n);
      if (hasTransform(decls) && !transformNone(decls)) for (const n of names) transformed.add(n);
    }
    expect(transitioned.size + animated.size + transformed.size, '没扫到任何 an- 动效源，这道门是空的').toBeGreaterThan(0);
    const rmBlocks = ruleBlocks(anReducedMotionBody!);
    const transitionShut = new Set<string>();
    const transformShut = new Set<string>();
    const animationShut = new Set<string>();
    for (const { selector, decls } of rmBlocks) {
      for (const n of anNames(selector)) {
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
