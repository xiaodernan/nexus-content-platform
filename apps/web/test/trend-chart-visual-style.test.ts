import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-15 `analytics/TrendChart.tsx` 的**静态那一寸**（零浏览器、零真库、零时钟、零后端）。
 *
 * FE 序列**首个 SVG 图表门面片**，也是 analytics 分析页最后一块裸 Tailwind：改造前 8 处静态
 * className（含 SVG 专属的 `fill-[var(--nexus-color-fg-3)]` / `text-[9px]` 两个任意值原子类）。
 * 与 FE-10~14 的 HTML 门面不同，本片的灵魂是**三轴语义色守恒**——opens/visitors/playTimeMs
 * 各有专属纵轴与专属色（accent-2 / brand / success），缺数据日画成"基线上一小段虚线短柱"
 * 而不是 0 或满高（§168 "别把图画成谎话"）。这些语义色是 `spec.color` 里的 token 字符串，
 * 喂给 SVG 的 `fill` / `stroke` presentation attributes，**不是 className**；门面化必须守恒
 * 它们逐字节不动，只把 8 处布局/文字 className 换成 `.tc-` 门面类。
 *
 * **9px 字号决策**：坐标轴日期标签 `text-[9px]` 是全库唯一 9px 使用（90 天窗口底部要挤 12 个
 * 标签）。globals.css 铁律"字号全走 token、零 `font-size: Npx`"（现 0 处写死）。为守恒 9px
 * 又不破坏纪律，补 `--nexus-font-size-9: 9px`（阶梯 9→10 档），与 FE-14 补 size-11 同构。
 *
 * **剥 className 后全文逐字节零行为门**是本片最强门：SVG 的 `viewBox`/`x`/`y`/`width`/`height`/
 * `fill`/`stroke`/`strokeDasharray`/`strokeOpacity`、三轴 `spec.color`/`pick`/`missing`/`read`、
 * `dayLabel`/`secondOf` 纯函数、`MISSING_STUB`/`WIDTH`/`PAD_*` 常量、`<title>` 与 aria 文案——
 * 全部在 className 归一成 `@` 后仍须**整份文件逐字节恒等**。先红（全裸）时此门绿（改前基线），
 * 转绿（门面化）后仍须绿——它锚的是"除 className 值外一个字节都没动"。
 *
 * 判据不变式：
 *  1. 类名闭环：page 每个 `tc-*` 在 globals.css 有 `.tc-` 基础定义；
 *  2. 成规模视觉段（≥6）；3. 零写死 hex；4. token 真存在（含 size-9）；5. 零新增颜色 token；
 *  6. **page 零裸 Tailwind**（8 处静态 className 全换，含 2 个任意值原子类）；
 *  7. **三轴语义色守恒**：opens/visitors/playTimeMs 三 key 各有专属 token 色、两两不同、全锚既有双主题 token；
 *  8. **SVG 缺数据语义守恒**：`fill=transparent` / `stroke=spec.color` / `dasharray=2 2` / `opacity=0.5` 逐字节不动；
 *  9. **剥 className 后全文 SHA256 逐字节零行为**（SVG attributes + 纯函数 + 全部文案）；
 * 10. 7 个 `data-analytics-*` 钩子一个不丢；
 * 11. 纯函数 / 常量 / 语义契约零行为（`dayLabel`/`secondOf`/`MISSING_STUB`/`WIDTH`/`PAD_*`/`labelEvery`/aria）；
 * 12. 注释定界符严格配对。
 *
 * 本片是纯展示 SVG（无焦点控件、无 hover 交互），**不设 `:focus-visible` 门**（诚实：无控件则不设，
 * 沿用 FE-12 纯展示页纪律）。不加渐变墨字，不触发 A11Y-1 forced-colors 联动。
 * 浏览器那一寸归 `e2e/trend-chart-visual.spec.ts`。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/analytics/TrendChart.tsx');
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

function definedTokens(css: string): Set<string> {
  return new Set([...cssNoComments(css).matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
}

/** globals.css 里有基础规则体的 `.tc-` 主类名（剔 reduced-motion、伪类）。 */
function definedTcClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(tc-[A-Za-z0-9-]+)(?![\w-])(?!:)/g)) {
      const tail = line.slice(m.index! + m[0]!.length).trimStart();
      if (/^[{,]/.test(tail)) out.add(m[1]!);
    }
  }
  return out;
}

/** `.tc-` 视觉段完整文本：首个 `.tc-` 到首个 `.an-` 之前（FE-15 段插在 FE-14 `.an-` 前方）。 */
/** `.tc-` 段完整文本：`.tc-` 起，到下一个 `/* ── §FE-` 段头止（段头接缝，不随文件序漂移）。 */
const tcSegment = (() => {
  const start = findOutsideComments(globals, /\.tc-[A-Za-z]/);
  if (start < 0) return '';
  const rest = globals.slice(start);
  const nextSection = rest.search(/\/\*\s*─+\s*§FE-\d+/);
  return cssNoComments(nextSection >= 0 ? rest.slice(0, nextSection) : rest);
})();

/** 从任意字符串抽所有 `tc-*` token。 */
function tcTokensOf(s: string): string[] {
  return [...s.matchAll(/\btc-[A-Za-z0-9-]+/g)].map((m) => m[0]!);
}

/**
 * **剥 className 后全文逐字节哈希**（本片最强零行为门）：FE-15 是 SVG 图表，属性密集——
 * 把 8 处 className 的**值**归一成 `@`（静态 `className="…"` 一种形态，本片无模板串/三元），
 * 其余全部保留（含 SVG attributes / 三轴语义色 / 纯函数 / 全部文案），改前与改后必须整份恒等。
 */
const STRIP_CLASS_SHA256 = 'e4ee0bb8aba25a5f6f208a84c16d9960f84221cff164b79cdc6aaa28117693d9';
function stripClassNames(src: string): string {
  const s = src.replace(/\r\n/g, '\n');
  return s.replace(/className="[^"]*"/g, 'className="@"');
}

/** 全文件 className token（本片只静态一形态，仍按三形态写以便未来加动态类也覆盖）。 */
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

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** 三轴 spec 的 key → 语义色 token 映射（逐字锚真实 spec 对象）。 */
const AXIS_SPECS: Array<{ key: string; colorToken: string }> = [
  { key: 'opens', colorToken: 'var(--nexus-color-accent-2)' },
  { key: 'visitors', colorToken: 'var(--nexus-color-brand)' },
  { key: 'playTimeMs', colorToken: 'var(--nexus-color-success)' },
];

describe('§FE-15 TrendChart SVG 三轴语义色守恒门面（静态不变式）', () => {
  it('page 用了 .tc- 语义类（8 处），全部有 globals.css 基础定义', () => {
    const used = [...new Set(tcTokensOf(code))].sort();
    expect(used.length, 'TrendChart 一个 tc- 类都没有，门面没接上').toBeGreaterThanOrEqual(6);
    const defined = definedTcClasses(globals);
    const missing = used.filter((c) => !defined.has(c));
    expect(missing, `这些 tc- 类在 page 用到却没在 globals.css 定义：${missing.join(', ')}`).toEqual([]);
    // 改造后确实一文不剩裸类（8 处全换）
    expect(countOccurrences(code, 'className="'), '静态 className 处数变了（期望 8）').toBe(8);
  });

  it('globals.css 定义了成规模的 .tc- 视觉段（不是空壳）', () => {
    expect(definedTcClasses(globals).size, '.tc- 定义太少，FE-15 门面升级没落地').toBeGreaterThanOrEqual(6);
    expect(tcSegment.length, '.tc- 视觉段为空，零 hex 门不能假绿').toBeGreaterThan(120);
  });

  it('.tc- 段里没有写死的 hex 颜色', () => {
    const hex = [...tcSegment.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hex, `.tc- 段出现写死 hex：${hex.join(', ')}`).toEqual([]);
  });

  it('.tc- 段里每个 var(--nexus-*) 都在 tokens.css 声明过（含新 size-9）', () => {
    const declared = definedTokens(tokens);
    const unknown: string[] = [];
    for (const m of tcSegment.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
      if (!declared.has(m[1]!)) unknown.push(m[1]!);
    }
    expect([...new Set(unknown)], `.tc- 段引用了未声明的 token：${[...new Set(unknown)].join(', ')}`).toEqual([]);
    // 9px 字号阶梯确实补齐（守护"字号不写死 px"的纪律）
    expect(declared, '补 size-9 前坐标轴 9px 会失真或写死裸 px').toContain('--nexus-font-size-9');
    expect(tokens, 'size-9 必须是 9px').toMatch(/--nexus-font-size-9:\s*9px/);
  });

  it('.tc- 段零新增颜色 token（只引用既有双主题 token）', () => {
    const newlyDefined = [...tcSegment.matchAll(/(--nexus-color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect([...new Set(newlyDefined)], `.tc- 段定义了新颜色 token：${[...new Set(newlyDefined)].join(', ')}`).toEqual([]);
  });

  it('page 零裸 Tailwind：8 处 className 只能是 tc-*（含 2 个任意值原子类）', () => {
    const classTokens = allClassNameTokens(code);
    const bare = classTokens.filter((t) => !t.startsWith('tc-'));
    expect(bare, `仍有裸 Tailwind 原子类没换成 .tc-：${[...new Set(bare)].join(', ')}`).toEqual([]);
    expect(classTokens.length, 'page 没扫到任何 className，门面没接上').toBeGreaterThanOrEqual(8);
    // 两个任意值原子类必消失
    expect(code, 'SVG 专属 fill-[...] 任意值没换门面类').not.toContain('fill-[var(');
    expect(code, 'SVG 专属 text-[9px] 任意值没换门面类').not.toContain('text-[9px]');
  });

  it('三轴语义色守恒：opens/visitors/playTimeMs 各有专属 token 色、两两不同、全锚既有双主题 token', () => {
    for (const { key, colorToken } of AXIS_SPECS) {
      // 每个 spec 块里 key 后紧跟它的 color（用正则跨行锚定 key 与 color 的相邻关系）
      const specBlock = code.match(new RegExp(`key:\\s*'${key}'[\\s\\S]*?color:\\s*'([^']+)'`));
      expect(specBlock, `${key} 轴的 spec.color 找不到`).toBeTruthy();
      expect(specBlock![1], `${key} 轴语义色被改（期望 ${colorToken}）`).toBe(colorToken);
    }
    const declared = definedTokens(tokens);
    const colors = AXIS_SPECS.map((s) => s.colorToken.replace(/var\((.*)\)/, '$1'));
    for (const c of colors) expect(declared, `三轴色 ${c} 未在 tokens.css 声明`).toContain(c);
    expect(new Set(colors).size, '三轴语义色撞色——图会失去区分').toBe(3);
  });

  it('SVG 缺数据语义守恒：fill=transparent / stroke=spec.color / dasharray=2 2 / opacity=0.5 逐字节不动', () => {
    for (const fragment of [
      "fill={empty ? 'transparent' : spec.color}",
      "stroke={empty ? spec.color : 'none'}",
      "strokeDasharray={empty ? '2 2' : undefined}",
      'strokeOpacity={empty ? 0.5 : undefined}',
      'const empty = spec.missing(point);',
      'const barHeight = empty ? MISSING_STUB : Math.max(1, Math.round((spec.pick(point) / max) * plot));',
      'data-analytics-bar-state={empty ? \'missing\' : \'value\'}',
    ]) {
      expect(code, `缺数据虚线短柱语义「${fragment.slice(0, 32)}…」丢了`).toContain(fragment);
    }
    // 基线 stroke 仍锚既有 token
    expect(code, '基线 stroke token 丢了').toContain('stroke="var(--nexus-color-border-subtle)"');
    // SVG 可访问性契约：role=img + aria-label + <title>
    expect(code, 'SVG role=img 丢了').toContain('role="img"');
    expect(code, 'SVG aria-label 丢了').toContain('aria-label={`${spec.title}');
    expect(code, '柱子 <title> 丢了').toContain('<title>{`${point.day} · ${spec.read(point)}`}</title>');
  });

  it('剥 className 后全文逐字节零行为：8 处类值之外（SVG attributes/三轴色/纯函数/文案）一个字节没动', () => {
    const stripped = stripClassNames(page).trimEnd();
    expect(createHash('sha256').update(stripped).digest('hex'),
      '剥类后全文变了——改动溢出 className，纯视觉零行为承诺不成立').toBe(STRIP_CLASS_SHA256);
  });

  it('7 个 data-analytics-* 钩子一个不丢', () => {
    const expected = [
      'data-analytics-charts', 'data-analytics-chart-empty',
      'data-analytics-series', 'data-analytics-series-max',
      'data-analytics-bar', 'data-analytics-bar-day', 'data-analytics-bar-state',
    ];
    // 用词边界抽**完整 token 集合**后比对，不用 `code.includes(h)` 子串判定：
    // 变异臂 S11 把 `data-analytics-bar-state` 改成 `...-statex`，includes 对前缀仍为真
    // 会假绿（声称钩子没丢、实际已改名）。抽 token 后 `-statex` 是另一个 token，正确报缺。
    const present = new Set([...code.matchAll(/\bdata-analytics-[a-z-]+/g)].map((m) => m[0]!));
    const missing = expected.filter((h) => !present.has(h));
    expect(missing, `结构/判据钩子丢了（或改名成别的 token）：${missing.join(', ')}`).toEqual([]);
  });

  it('纯函数 / 常量 / 语义契约零行为', () => {
    for (const fragment of [
      'return day.slice(5).replace(\'-\', \'/\');',
      'const secondOf = (ms: number) => Math.round(ms / 1000);',
      'const MISSING_STUB = 3;',
      'const WIDTH = 720;',
      'const PAD_LEFT = 44;',
      'const PAD_RIGHT = 8;',
      'const labelEvery = Math.max(1, Math.ceil(days.length / 12));',
      'max = Math.max(max, 1);',
      'const top = 6;',
      'const plot = height - top - (showAxis ? 16 : 4);',
      'const step = (WIDTH - PAD_LEFT - PAD_RIGHT) / Math.max(days.length, 1);',
      'const barWidth = Math.max(1, Math.min(step - 2, 22));',
      'height={92}', 'height={108}', 'showAxis', 'formatMax', 'pick', 'missing', 'read',
      'point.playTimeMs === null',
    ]) {
      expect(code, `纯函数/语义契约「${fragment.slice(0, 36)}…」丢了`).toContain(fragment);
    }
    // 三轴真实文案（诚实口径）逐字
    for (const copy of [
      '每天打开次数（只数真人；爬虫/自动化的打开另计在窗口汇总里，不画进这条曲线）',
      '每天访客数（同一人同一天只算一个；这一天没有人来就是 0）',
      '每天可见时长（虚线短柱 = 那一天一条心跳都没有，不是 0 秒）',
      '纵轴 0 →', '打开 ${point.opens} 次', '访客 ${point.visitors} 人',
      '未采集（这一天没有心跳）', '可见 ${secondOf(point.playTimeMs)} 秒',
    ]) {
      expect(code, `诚实文案「${copy.slice(0, 16)}…」丢了`).toContain(copy);
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
